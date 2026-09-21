"""End-to-end API tests against a real PostgreSQL database.

These are not unit tests with mocked repositories: they exercise the actual
lifecycle, authorization and token rules through HTTP, because that is where
the rules that matter live.

Requires TEST_DATABASE_URL pointing at a database that is safe to drop.
"""
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

TEST_DB = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_DB, reason="TEST_DATABASE_URL not set")

if TEST_DB:
    os.environ["DATABASE_URL"] = TEST_DB
    os.environ["JWT_SECRET"] = "test-secret"
    os.environ["ENV"] = "test"

from app.db import Base, engine          # noqa: E402
from app import models                    # noqa: E402,F401
from app.main import app                  # noqa: E402
from app.security import hash_password    # noqa: E402
from app import security                  # noqa: E402
from app.db import SessionLocal           # noqa: E402
from app.constants import Role            # noqa: E402


@pytest.fixture(scope="module")
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    """The login limiter is in-process and shared; a test suite hammering the
    same client would otherwise trip it. Clearing here keeps the limiter itself
    under test (see test_login_rate_limit) without breaking everything else."""
    security._hits.clear()
    yield


@pytest.fixture(scope="module")
def world(client):
    """A minimal but realistic council: admin, resolver, approver, requester."""
    db = SessionLocal()
    password = "TestPass123!"
    users = {}
    for key, role in [
        ("admin", Role.ADMIN), ("resolver", Role.RESOLVER),
        ("approver", Role.APPROVER), ("requester", Role.REQUESTER),
        ("other", Role.REQUESTER), ("resolver2", Role.RESOLVER),
    ]:
        user = models.User(
            full_name=f"{key} user", email=f"{key}@qa.buqata.muni.il",
            password_hash=hash_password(password), role=role,
            must_change_password=False, active=True)
        db.add(user)
        db.flush()
        users[key] = user.id

    request_type = models.RequestType(key="new_service", name="שירות חדש", sort_order=1)
    fault = models.RequestType(key="fault", name="תקלה", sort_order=0)
    db.add_all([request_type, fault])
    db.flush()

    category = models.Category(
        name="מחשוב", resolver_id=users["resolver"], escalation_id=users["approver"],
        sla_hours=8, cost_threshold=500, hours_threshold=4, approval_new_service=True)
    db.add(category)
    db.flush()
    db.add_all([
        models.CategoryRequestType(category_id=category.id, request_type_id=request_type.id),
        models.CategoryRequestType(category_id=category.id, request_type_id=fault.id),
    ])
    db.commit()

    result = {
        "users": users, "password": password, "category": category.id,
        "new_service": request_type.id, "fault": fault.id,
    }
    db.close()
    return result


def auth(client, world, key):
    """Log in once per role and reuse the token, as a real client would."""
    cache = world.setdefault("tokens", {})
    if key not in cache:
        security._hits.clear()
        response = client.post("/api/auth/login", json={
            "email": f"{key}@qa.buqata.muni.il", "password": world["password"]})
        assert response.status_code == 200, response.text
        cache[key] = response.json()["token"]
    return {"Authorization": f"Bearer {cache[key]}"}


# --- authentication ---------------------------------------------------------

def test_login_rejects_wrong_password(client, world):
    response = client.post("/api/auth/login", json={
        "email": "requester@qa.buqata.muni.il", "password": "wrong"})
    assert response.status_code == 401


def test_login_is_rate_limited(client, world):
    """Repeated failures from one address are throttled."""
    security._hits.clear()
    statuses = [
        client.post("/api/auth/login", json={
            "email": "requester@qa.buqata.muni.il", "password": "wrong"}).status_code
        for _ in range(12)
    ]
    assert 429 in statuses, "brute-force attempts should eventually be throttled"
    security._hits.clear()


def test_unauthenticated_requests_are_rejected(client, world):
    assert client.get("/api/tickets").status_code == 401
    assert client.get("/api/users").status_code == 401
    assert client.get("/api/settings").status_code == 401


# --- lifecycle --------------------------------------------------------------

def test_ticket_lifecycle_new_to_resolved(client, world):
    requester = auth(client, world, "requester")
    resolver = auth(client, world, "resolver")

    created = client.post("/api/tickets", headers=requester, json={
        "subject": "אין אינטרנט", "description": "מהבוקר",
        "category_id": world["category"], "request_type_id": world["fault"],
    })
    assert created.status_code == 201, created.text
    ticket = created.json()
    # Category has a resolver, so the ticket is auto-assigned.
    assert ticket["status"] == "assigned"
    assert ticket["resolver"]["id"] == world["users"]["resolver"]
    assert ticket["sla_state"] in {"ok", "at_risk"}

    ticket_id = ticket["id"]

    # The assigned resolver opening it for the first time moves it to VIEWED.
    viewed = client.get(f"/api/tickets/{ticket_id}", headers=resolver)
    assert viewed.json()["status"] == "viewed"

    # Requester opening it does not change the status.
    again = client.get(f"/api/tickets/{ticket_id}", headers=requester)
    assert again.json()["status"] == "viewed"

    started = client.post(f"/api/tickets/{ticket_id}/start", headers=resolver)
    assert started.json()["status"] == "in_progress"

    resolved = client.post(f"/api/tickets/{ticket_id}/resolve", headers=resolver,
                           json={"note": "הוחלף כבל"})
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"

    # Requester reopens: same ticket, history preserved, no duplicate created.
    reopened = client.post(f"/api/tickets/{ticket_id}/reopen", headers=requester,
                           json={"reason": "חזר שוב"})
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "reopened"
    assert reopened.json()["id"] == ticket_id
    assert reopened.json()["reopen_count"] == 1

    activity = client.get(f"/api/tickets/{ticket_id}/activity", headers=resolver).json()
    actions = [item.get("action") for item in activity["items"] if item["kind"] == "event"]
    for expected in ("ticket_created", "ticket_viewed", "ticket_resolved", "ticket_reopened"):
        assert expected in actions, f"{expected} missing from audit trail"


def test_requester_cannot_see_another_requesters_ticket(client, world):
    requester = auth(client, world, "requester")
    other = auth(client, world, "other")

    created = client.post("/api/tickets", headers=requester, json={
        "subject": "פרטי", "description": "לא לעיניים זרות",
        "category_id": world["category"], "request_type_id": world["fault"]})
    ticket_id = created.json()["id"]

    # 404 rather than 403: do not confirm the ticket exists.
    assert client.get(f"/api/tickets/{ticket_id}", headers=other).status_code == 404

    listing = client.get("/api/tickets", headers=other).json()
    assert all(item["id"] != ticket_id for item in listing["items"])


def test_requester_cannot_post_internal_note(client, world):
    requester = auth(client, world, "requester")
    resolver = auth(client, world, "resolver")
    created = client.post("/api/tickets", headers=requester, json={
        "subject": "הערה", "description": "בדיקה",
        "category_id": world["category"], "request_type_id": world["fault"]})
    ticket_id = created.json()["id"]

    # Requester asks for internal=True; the server must ignore it.
    client.post(f"/api/tickets/{ticket_id}/comments", headers=requester,
                json={"body": "מהפונה", "internal": True})
    client.post(f"/api/tickets/{ticket_id}/comments", headers=resolver,
                json={"body": "הערה פנימית אמיתית", "internal": True})

    as_requester = client.get(f"/api/tickets/{ticket_id}/activity", headers=requester).json()
    bodies = [i.get("body") for i in as_requester["items"]]
    assert "מהפונה" in bodies
    assert "הערה פנימית אמיתית" not in bodies      # internal note hidden

    as_resolver = client.get(f"/api/tickets/{ticket_id}/activity", headers=resolver).json()
    assert "הערה פנימית אמיתית" in [i.get("body") for i in as_resolver["items"]]


# --- approvals --------------------------------------------------------------

def test_cost_threshold_triggers_approval_and_blocks_resolution(client, world):
    requester = auth(client, world, "requester")
    resolver = auth(client, world, "resolver")
    approver = auth(client, world, "approver")

    created = client.post("/api/tickets", headers=requester, json={
        "subject": "מחשב חדש", "description": "לעובד חדש",
        "category_id": world["category"], "request_type_id": world["new_service"],
        "estimated_cost": 4800, "estimated_hours": 2})
    ticket = created.json()
    assert ticket["approval_state"] == "pending"
    ticket_id = ticket["id"]

    approvals = client.get(f"/api/tickets/{ticket_id}/approvals", headers=resolver).json()
    triggers = {row["trigger"] for row in approvals["items"]}
    assert "cost" in triggers            # 4800 > 500
    assert "new_service" in triggers     # category requires approval for new service

    # Cannot close while an approval is pending.
    blocked = client.post(f"/api/tickets/{ticket_id}/resolve", headers=resolver,
                          json={"note": "בוצע"})
    assert blocked.status_code == 400

    # Only the named approver may decide.
    approval_id = approvals["items"][0]["id"]
    assert client.post(f"/api/approvals/{approval_id}/decision", headers=resolver,
                       json={"decision": "approved"}).status_code == 403

    for row in approvals["items"]:
        decided = client.post(f"/api/approvals/{row['id']}/decision", headers=approver,
                              json={"decision": "approved", "note": "מאושר"})
        assert decided.status_code == 200

    after = client.get(f"/api/tickets/{ticket_id}", headers=resolver).json()
    assert after["approval_state"] == "approved"
    assert client.post(f"/api/tickets/{ticket_id}/resolve", headers=resolver,
                       json={"note": "סופק"}).status_code == 200


# --- transfer ---------------------------------------------------------------

def test_transfer_preserves_everything_and_resets_to_assigned(client, world):
    requester = auth(client, world, "requester")
    resolver = auth(client, world, "resolver")

    created = client.post("/api/tickets", headers=requester, json={
        "subject": "העברה", "description": "בדיקה",
        "category_id": world["category"], "request_type_id": world["fault"]})
    ticket_id = created.json()["id"]

    client.post(f"/api/tickets/{ticket_id}/comments", headers=requester, json={"body": "תגובה"})
    client.get(f"/api/tickets/{ticket_id}", headers=resolver)      # -> viewed

    transferred = client.post(f"/api/tickets/{ticket_id}/transfer", headers=resolver, json={
        "resolver_id": world["users"]["resolver2"], "reason": "בתחום אחר"})
    assert transferred.status_code == 200
    body = transferred.json()
    assert body["resolver"]["id"] == world["users"]["resolver2"]
    # Back to assigned so the new resolver produces their own view event.
    assert body["status"] == "assigned"

    activity = client.get(f"/api/tickets/{ticket_id}/activity",
                          headers=auth(client, world, "resolver2")).json()
    assert "תגובה" in [i.get("body") for i in activity["items"]]
    assert "ticket_transferred" in [i.get("action") for i in activity["items"]]


# --- external subtasks ------------------------------------------------------

def test_external_subtask_token_scope_and_invalidation(client, world):
    requester = auth(client, world, "requester")
    resolver = auth(client, world, "resolver")

    created = client.post("/api/tickets", headers=requester, json={
        "subject": "מצלמות", "description": "לא מקליטות",
        "category_id": world["category"], "request_type_id": world["fault"]})
    ticket_id = created.json()["id"]

    client.post(f"/api/tickets/{ticket_id}/comments", headers=resolver,
                json={"body": "סוד פנימי", "internal": True})

    subtask = client.post(f"/api/tickets/{ticket_id}/subtasks", headers=resolver, json={
        "title": "בדיקת ספק", "description": "להחליף דיסק",
        "assignee_type": "external", "external_name": "ספק",
        "external_email": "vendor@vendor-test.co.il", "external_channel": "email"})
    assert subtask.status_code == 201, subtask.text
    link = subtask.json()["guest_link"]
    assert link, "guest link must be returned exactly once, at creation"
    token = link.rsplit("/", 1)[-1]

    # The guest view exposes the subtask and only minimal parent context.
    view = client.get(f"/api/external/subtask/{token}")
    assert view.status_code == 200
    payload = view.json()
    assert payload["subtask"]["title"] == "בדיקת ספק"
    assert payload["ticket"]["number"]
    serialized = view.text
    assert "סוד פנימי" not in serialized       # no internal notes
    assert "approvals" not in payload          # no approval data
    assert "requester" not in payload          # no directory information

    # A wrong token is indistinguishable from an expired one.
    assert client.get("/api/external/subtask/not-a-real-token").status_code == 410

    # The guest can comment and progress the task.
    assert client.patch(f"/api/external/subtask/{token}",
                        json={"comment": "נגיע מחר"}).status_code == 200
    assert client.patch(f"/api/external/subtask/{token}",
                        json={"status": "in_progress"}).status_code == 200

    # Resolving ends the token immediately.
    done = client.patch(f"/api/external/subtask/{token}", json={"status": "resolved"})
    assert done.status_code == 200
    assert done.json()["link_active"] is False
    assert client.get(f"/api/external/subtask/{token}").status_code == 410
    assert client.patch(f"/api/external/subtask/{token}",
                        json={"comment": "עוד משהו"}).status_code == 410

    # The external activity is on the parent ticket's audit trail.
    activity = client.get(f"/api/tickets/{ticket_id}/activity", headers=resolver).json()
    actions = [i.get("action") for i in activity["items"]]
    assert "external_comment_added" in actions
    assert "external_status_changed" in actions


def test_revoked_token_stops_working(client, world):
    requester = auth(client, world, "requester")
    resolver = auth(client, world, "resolver")
    created = client.post("/api/tickets", headers=requester, json={
        "subject": "ביטול קישור", "description": "בדיקה",
        "category_id": world["category"], "request_type_id": world["fault"]})
    ticket_id = created.json()["id"]

    subtask = client.post(f"/api/tickets/{ticket_id}/subtasks", headers=resolver, json={
        "title": "משימה", "assignee_type": "external", "external_name": "ספק",
        "external_email": "v2@vendor-test.co.il"}).json()
    token = subtask["guest_link"].rsplit("/", 1)[-1]
    assert client.get(f"/api/external/subtask/{token}").status_code == 200

    client.post(f"/api/subtasks/{subtask['id']}/token/revoke", headers=resolver)
    assert client.get(f"/api/external/subtask/{token}").status_code == 410


def test_open_subtasks_block_resolution(client, world):
    requester = auth(client, world, "requester")
    resolver = auth(client, world, "resolver")
    created = client.post("/api/tickets", headers=requester, json={
        "subject": "חסימה", "description": "בדיקה",
        "category_id": world["category"], "request_type_id": world["fault"]})
    ticket_id = created.json()["id"]

    client.post(f"/api/tickets/{ticket_id}/subtasks", headers=resolver, json={
        "title": "משימה פנימית", "assignee_type": "internal",
        "assignee_user_id": world["users"]["resolver2"]})

    blocked = client.post(f"/api/tickets/{ticket_id}/resolve", headers=resolver,
                          json={"note": "סיימתי"})
    assert blocked.status_code == 400


# --- administration ---------------------------------------------------------

def test_only_admin_manages_categories_and_users(client, world):
    resolver = auth(client, world, "resolver")
    admin = auth(client, world, "admin")

    payload = {"name": f"קטגוריה {uuid.uuid4().hex[:6]}", "default_priority": "normal"}
    assert client.post("/api/categories", headers=resolver, json=payload).status_code == 403
    assert client.post("/api/categories", headers=admin, json=payload).status_code == 201

    user_payload = {
        "full_name": "חדש", "email": f"new{uuid.uuid4().hex[:6]}@qa.buqata.muni.il",
        "role": "requester", "password": "Password1234"}
    assert client.post("/api/users", headers=resolver, json=user_payload).status_code == 403
    assert client.post("/api/users", headers=admin, json=user_payload).status_code == 201


def test_password_change_enforced_and_validated(client, world):
    admin = auth(client, world, "admin")
    email = f"pw{uuid.uuid4().hex[:6]}@qa.buqata.muni.il"
    client.post("/api/users", headers=admin, json={
        "full_name": "משתמש", "email": email, "role": "requester",
        "password": "Initial12345"})

    login = client.post("/api/auth/login", json={"email": email, "password": "Initial12345"})
    assert login.json()["user"]["must_change_password"] is True
    headers = {"Authorization": f"Bearer {login.json()['token']}"}

    # Too short, and letters-only, are both rejected.
    assert client.post("/api/me/password", headers=headers, json={
        "current_password": "Initial12345", "new_password": "short"}).status_code == 400
    assert client.post("/api/me/password", headers=headers, json={
        "current_password": "Initial12345", "new_password": "onlylettershere"}).status_code == 400
    assert client.post("/api/me/password", headers=headers, json={
        "current_password": "wrong", "new_password": "Brandnew12345"}).status_code == 400

    ok = client.post("/api/me/password", headers=headers, json={
        "current_password": "Initial12345", "new_password": "Brandnew12345"})
    assert ok.status_code == 200
    assert client.get("/api/me", headers=headers).json()["must_change_password"] is False


def test_upload_rejects_unsupported_type(client, world):
    requester = auth(client, world, "requester")
    created = client.post("/api/tickets", headers=requester, json={
        "subject": "קובץ", "description": "בדיקה",
        "category_id": world["category"], "request_type_id": world["fault"]})
    ticket_id = created.json()["id"]

    bad = client.post(
        f"/api/tickets/{ticket_id}/attachments", headers=requester,
        files={"file": ("evil.exe", b"MZ binary", "application/x-msdownload")})
    assert bad.status_code == 400

    good = client.post(
        f"/api/tickets/{ticket_id}/attachments", headers=requester,
        files={"file": ("note.txt", b"hello", "text/plain")})
    assert good.status_code == 201

    # A content type on the list is still refused when the extension is not:
    # both halves have to agree, so a .exe cannot arrive labelled as a video.
    mismatched = client.post(
        f"/api/tickets/{ticket_id}/attachments", headers=requester,
        files={"file": ("payload.exe", b"MZ", "video/mp4")})
    assert mismatched.status_code == 400


def test_media_uploads_and_inline_disposition(client, world):
    """Photographs, video and voice notes are accepted, and only media may be
    served inline -- a document asked for inline still downloads."""
    requester = auth(client, world, "requester")
    created = client.post("/api/tickets", headers=requester, json={
        "subject": "מדיה", "description": "בדיקה",
        "category_id": world["category"], "request_type_id": world["fault"]})
    ticket_id = created.json()["id"]

    media = [
        ("photo.jpg", b"\xff\xd8\xff\xe0jpeg", "image/jpeg"),
        ("clip.mp4", b"\x00\x00\x00\x20ftypmp4", "video/mp4"),
        ("clip.mov", b"\x00\x00\x00\x14ftypqt", "video/quicktime"),
        ("voice.webm", b"\x1a\x45\xdf\xa3webm", "audio/webm"),
        ("voice.m4a", b"\x00\x00\x00\x20ftypM4A", "audio/mp4"),
    ]
    ids = {}
    for name, body, content_type in media:
        res = client.post(
            f"/api/tickets/{ticket_id}/attachments", headers=requester,
            files={"file": (name, body, content_type)})
        assert res.status_code == 201, f"{name}: {res.text}"
        ids[name] = res.json()["id"]

    inline = client.get(f"/api/attachments/ticket/{ids['photo.jpg']}?inline=true",
                        headers=requester)
    assert inline.status_code == 200
    assert "attachment" not in inline.headers.get("content-disposition", "")

    download = client.get(f"/api/attachments/ticket/{ids['photo.jpg']}", headers=requester)
    assert "attachment" in download.headers["content-disposition"]

    # Browsers frequently send octet-stream for a document; the extension is
    # already validated, so it decides, and the stored type comes from it.
    for name, declared in [("report.pdf", "application/octet-stream"),
                           ("letter.docx", "application/octet-stream"),
                           ("letter.docx", "application/zip"),
                           ("sheet.xlsx", "")]:
        res = client.post(
            f"/api/tickets/{ticket_id}/attachments", headers=requester,
            files={"file": (name, b"stub-bytes", declared)})
        assert res.status_code == 201, f"{name} as {declared!r}: {res.text}"

    stored = client.post(
        f"/api/tickets/{ticket_id}/attachments", headers=requester,
        files={"file": ("report.pdf", b"stub", "application/octet-stream")}).json()
    assert stored["content_type"] == "application/pdf"

    # A header still cannot talk a document into the inline media path.
    liar = client.post(
        f"/api/tickets/{ticket_id}/attachments", headers=requester,
        files={"file": ("sneaky.pdf", b"stub", "video/mp4")}).json()
    assert liar["content_type"] == "application/pdf"
    forced_liar = client.get(f"/api/attachments/ticket/{liar['id']}?inline=true",
                             headers=requester)
    assert "attachment" in forced_liar.headers["content-disposition"]

    # A text file cannot be coaxed into rendering in the page.
    doc = client.post(
        f"/api/tickets/{ticket_id}/attachments", headers=requester,
        files={"file": ("note.txt", b"hello", "text/plain")}).json()
    forced = client.get(f"/api/attachments/ticket/{doc['id']}?inline=true", headers=requester)
    assert "attachment" in forced.headers["content-disposition"]


def test_sla_target_follows_priority(client, world):
    """Two hours, one day, three days, one week -- and re-prioritising an open
    ticket moves its deadline rather than leaving the old one in place."""
    from datetime import datetime

    staff = auth(client, world, "resolver")
    expected = {"urgent": 2, "high": 24, "normal": 72, "low": 168}

    def hours_between(created: str, due: str) -> float:
        a = datetime.fromisoformat(created.replace("Z", "+00:00"))
        b = datetime.fromisoformat(due.replace("Z", "+00:00"))
        return (b - a).total_seconds() / 3600

    ids = {}
    for priority, hours in expected.items():
        body = client.post("/api/tickets", headers=staff, json={
            "subject": f"דחיפות {priority}", "description": "בדיקת זמן תקן",
            "category_id": world["category"], "request_type_id": world["fault"],
            "priority": priority}).json()
        assert body["sla_due_at"], f"{priority} got no target"
        got = hours_between(body["created_at"], body["sla_due_at"])
        assert abs(got - hours) < 0.1, f"{priority}: expected {hours}h, got {got:.2f}h"
        ids[priority] = body["id"]

    # Raising a low-priority ticket to urgent pulls the deadline in to two hours.
    raised = client.patch(f"/api/tickets/{ids['low']}", headers=staff,
                          json={"priority": "urgent"})
    assert raised.status_code == 200
    after = client.get(f"/api/tickets/{ids['low']}", headers=staff).json()
    assert abs(hours_between(after["created_at"], after["sla_due_at"]) - 2) < 0.1


def test_admin_can_change_a_user_email(client, world):
    """The staff import generated addresses for employees with none on file, so
    correcting one has to be possible -- and must not collide with another."""
    admin = auth(client, world, "admin")
    created = client.post("/api/users", headers=admin, json={
        "full_name": "עובד בדיקה", "email": "generated.name@qa.buqata.muni.il",
        "role": "requester", "password": "TempPass12345", "active": True})
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]

    fixed = client.patch(f"/api/users/{user_id}", headers=admin,
                         json={"email": "Real.Mailbox@QA.buqata.muni.il"})
    assert fixed.status_code == 200, fixed.text
    assert fixed.json()["email"] == "real.mailbox@qa.buqata.muni.il"   # normalised

    # The new address is the login from now on.
    security._hits.clear()
    assert client.post("/api/auth/login", json={
        "email": "real.mailbox@qa.buqata.muni.il", "password": "TempPass12345"}).status_code == 200
    security._hits.clear()
    assert client.post("/api/auth/login", json={
        "email": "generated.name@qa.buqata.muni.il", "password": "TempPass12345"}).status_code == 401

    # Two people cannot share one login.
    clash = client.patch(f"/api/users/{user_id}", headers=admin,
                         json={"email": "requester@qa.buqata.muni.il"})
    assert clash.status_code == 400

"""Mail configuration that an administrator can edit in the application.

The .env file still supplies the defaults, so an existing deployment keeps
working untouched, but anything stored in the settings table wins. That is what
lets the council put a mailbox password in place themselves rather than editing
a file on the server over SSH.

The password is encrypted at rest with a key derived from JWT_SECRET. That is
not a secrets manager -- anyone holding both the database and the .env can
recover it -- but it does mean a database dump on its own does not hand over the
mailbox, which is the realistic exposure for a nightly backup.
"""
from __future__ import annotations

import base64
import hashlib
import logging
from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from .. import config as env
from ..models import Setting

log = logging.getLogger("helpdesk.mail")

PASSWORD_KEY = "mail.password"
GRAPH_SECRET_KEY = "mail.graph_client_secret"
GROUP = "mail"

#: Values that are encrypted at rest and never returned to a client.
SECRET_KEYS = (PASSWORD_KEY, GRAPH_SECRET_KEY)

#: Returned in place of a stored secret. The UI shows whether one is set; the
#: value itself never leaves the server.
MASK = "********"

KEYS = {
    "provider": "mail.provider",
    "host": "mail.host",
    "port": "mail.port",
    "security": "mail.security",
    "username": "mail.username",
    "from_address": "mail.from_address",
    "from_name": "mail.from_name",
    "support_inbox": "mail.support_inbox",
    "graph_tenant_id": "mail.graph_tenant_id",
    "graph_client_id": "mail.graph_client_id",
}


@dataclass
class MailConfig:
    provider: str          # log | smtp | graph
    host: str
    port: int
    security: str          # auto | ssl | starttls
    username: str
    password: str
    from_address: str
    from_name: str
    support_inbox: str
    graph_tenant_id: str = ""
    graph_client_id: str = ""
    graph_client_secret: str = ""

    @property
    def use_ssl(self) -> bool:
        if self.security == "ssl":
            return True
        if self.security == "starttls":
            return False
        return self.port == 465          # auto

    @property
    def graph_ready(self) -> bool:
        return bool(self.graph_tenant_id and self.graph_client_id
                    and self.graph_client_secret and self.from_address)


def _fernet() -> Fernet:
    digest = hashlib.sha256((env.JWT_SECRET or "helpdesk").encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt(value: str) -> str:
    """Returns "" for anything we cannot read, so a rotated JWT_SECRET degrades
    to "no password configured" rather than breaking every send with a stack
    trace."""
    if not value:
        return ""
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        log.warning("stored mail password could not be decrypted; treating as unset")
        return ""


def _stored(db: Session | None) -> dict[str, str]:
    if db is None:
        return {}
    rows = db.query(Setting).filter(Setting.key.like("mail.%")).all()
    return {row.key: (row.value or "") for row in rows}


def resolve(db: Session | None = None) -> MailConfig:
    """Effective configuration: stored values over environment defaults."""
    stored = _stored(db)

    def pick(field: str, fallback: str) -> str:
        value = stored.get(KEYS[field], "").strip()
        return value or fallback

    port_raw = pick("port", str(env.SMTP_PORT))
    try:
        port = int(port_raw)
    except ValueError:
        port = env.SMTP_PORT

    password = decrypt(stored.get(PASSWORD_KEY, "")) or env.SMTP_PASSWORD

    return MailConfig(
        provider=pick("provider", env.EMAIL_PROVIDER),
        host=pick("host", env.SMTP_HOST),
        port=port,
        security=pick("security", "auto"),
        username=pick("username", env.SMTP_USER),
        password=password,
        from_address=pick("from_address", env.SMTP_FROM),
        from_name=pick("from_name", env.SMTP_FROM_NAME),
        support_inbox=pick("support_inbox", env.SUPPORT_INBOX),
        graph_tenant_id=pick("graph_tenant_id", env.GRAPH_TENANT_ID),
        graph_client_id=pick("graph_client_id", env.GRAPH_CLIENT_ID),
        graph_client_secret=(decrypt(stored.get(GRAPH_SECRET_KEY, ""))
                             or env.GRAPH_CLIENT_SECRET),
    )


def apply(db: Session, values: dict[str, str | None], user_id: int | None = None) -> list[str]:
    """Write mail.* values. Returns the keys actually changed.

    An absent or masked password means "leave what is there" -- otherwise
    loading the settings screen and pressing save would wipe the credential.
    """
    changed: list[str] = []
    for key, value in values.items():
        if not key.startswith("mail."):
            continue
        if key.endswith("_set"):
            continue                      # read-only flags the screen echoes back
        if key in SECRET_KEYS:
            if value is None or value in ("", MASK):
                continue                  # "leave what is stored", not "clear it"
            value = encrypt(value)
        row = db.get(Setting, key)
        if row:
            row.value = value
            row.group = GROUP
            row.updated_by_id = user_id
        else:
            db.add(Setting(key=key, value=value, group=GROUP, updated_by_id=user_id))
        changed.append(key)
    return changed


def has_password(db: Session) -> bool:
    row = db.get(Setting, PASSWORD_KEY)
    return bool(row and row.value) or bool(env.SMTP_PASSWORD)


def has_graph_secret(db: Session) -> bool:
    row = db.get(Setting, GRAPH_SECRET_KEY)
    return bool(row and row.value) or bool(env.GRAPH_CLIENT_SECRET)

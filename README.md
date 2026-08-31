# Kortex Support — מוקד שירות

A municipal service desk for **Buq'ata Local Council** (מועצה מקומית בוקעאתא).
Hebrew-first, RTL throughout, built for internal staff and external contractors.

**Stack:** React 19 + TypeScript (Vite) · AG Grid · i18next · Python 3.12 (FastAPI + SQLAlchemy 2) · PostgreSQL 16
**Live:** https://support.buqata.muni.il

---

## What it does

Registered council employees open tickets; the category decides who resolves them,
what the SLA target is, and when the work needs approval. Resolvers can split a
ticket into subtasks — including subtasks handed to outside contractors, who work
through a scoped guest link without ever getting an account.

- **Lifecycle:** `NEW → ASSIGNED → VIEWED → IN_PROGRESS → RESOLVED | REJECTED`, with
  `REOPENED` available to the requester. `VIEWED` is set automatically the first time
  the assigned resolver opens the ticket.
- **Reopening keeps the same ticket.** No duplicate is created; comments, files,
  approvals, subtasks and history all stay attached, and a new audit event is written.
- **Transfers** move a ticket to another resolver, optionally in another category,
  recording who moved it, from and to where, and why. The ticket returns to `ASSIGNED`
  so the receiving resolver produces their own `VIEWED` event.
- **Approvals** are triggered by request type, an estimated-cost threshold, an
  estimated-hours threshold, or a manual request. A ticket with a pending approval
  cannot be closed.
- **External subtasks** issue a single-use guest link scoped to one subtask.

## Interface

The frame follows the buildings-manager layout so the council's two systems feel
like one product: an icon rail on the right, a dark app bar, section tabs, a blue
title banner carrying the record count, an action bar, then a dense grid.

**Languages.** Hebrew, Arabic and English, switched from the display menu in the
app bar. Hebrew is the source language and the fallback, so a missing Arabic or
English string renders its Hebrew text rather than a raw key. Arabic is a
first-class locale, not a placeholder: Buq'ata is a Druze village where Arabic is
the first language of most residents. Switching language flips `dir` on `<html>`,
which every logical CSS property already follows. Dates and numbers follow the
language but keep the Israel region, and Arabic is pinned to Latin digits so the
interface does not mix `٤` with Latin ticket numbers.

**Text size and contrast.** Small / normal / large, and light / normal / dark /
high contrast. Both are attributes on `<html>` applied from localStorage *before*
React mounts, so a reload paints correctly rather than flashing the default. Text
size scales the type tokens, and control and grid-row heights grow with them.
High contrast is a real accessibility mode: pure black on white, 2px borders in
place of shadows, a yellow focus ring, and chips that carry a border so status is
not conveyed by hue alone. Preferences are stored per user on the server, so they
follow someone between devices, and mirrored to localStorage for first paint.

**Grid layout is configurable in three layers**, in increasing priority:
1. the column definitions in code,
2. `field_configurations` — what an administrator sets for everyone on the
   *Table layout* page: heading per language, width in characters, visibility,
   pinning and order,
3. `grid_preferences` — what each user adjusts for themselves by dragging and
   resizing, saved from the grid toolbar.

## Repository layout

```
backend/
  alembic/            migrations (initial schema: 20 tables)
  app/
    api/              routers: auth, tickets, subtasks, external, approvals, admin, insights
      deps.py         authentication and role guards
      serializers.py  every response shape, so field-level access is reviewable in one file
    services/         audit, sla, approvals, files, tokens, notifications/
    constants.py      the domain vocabulary (statuses, roles, events)
    models.py         SQLAlchemy models
    schemas.py        request bodies
    seed.py           reference data + admin (+ --demo)
    import_employees.py  HR spreadsheet import
  tests/              end-to-end API tests against real PostgreSQL
frontend/
  src/
    styles/           tokens.css · base.css · app.css
    components/ui/    button, chip, card, field, dialog, drawer, tabs, states, toast
    components/tickets/  status chips, lifecycle rail, ticket table, dialogs
    components/layout/   application shell
    lib/              api client, auth context, hooks, formatting, Hebrew labels
    pages/            15 route components
deploy/               systemd unit, nginx vhost, deploy.sh
```

## Local development

### 1. Database
```bash
docker compose up -d          # PostgreSQL 16 on localhost:5433
```
PostgreSQL is required — the app refuses to start on any other `DATABASE_URL`.

### 2. Backend
```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # Linux/macOS: .venv/bin/pip
cp .env.example .env                               # set JWT_SECRET and ADMIN_PASSWORD
.venv/Scripts/alembic upgrade head
.venv/Scripts/python -m app.seed --demo            # reference data + demo staff and tickets
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```
API docs: http://127.0.0.1:8000/docs

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

`--demo` creates staff and requester accounts with password `Buqata2026!`, six
Hebrew sample tickets, an internal subtask and an external subtask (whose guest
link is printed). It refuses to run when `ENV=production`.

## Tests

```bash
cd backend
export TEST_DATABASE_URL=postgresql+psycopg2://municipos:...@localhost:5432/municipos_test
.venv/bin/python -m pytest -q
```

14 end-to-end tests covering the lifecycle, cross-user access (IDOR), internal-note
visibility, approval gating, transfers, guest-token scope and invalidation, role
guards, password rules, upload validation and login rate limiting. They run against a
real PostgreSQL database, not mocks. Without `TEST_DATABASE_URL` the suite skips.

## Deployment

Ubuntu host, source in `/opt/municipos-helpdesk`, uvicorn under systemd on
`127.0.0.1:8071`, nginx terminating TLS and serving `frontend/dist`.

```bash
rsync -a --exclude node_modules --exclude .venv --exclude dist \
      ./ root@HOST:/opt/municipos-helpdesk/
ssh root@HOST 'cd /opt/municipos-helpdesk && bash deploy/deploy.sh'
```

First run also needs the `municipos` role and database, a filled-in `backend/.env`,
and a certificate. See the header of [deploy/deploy.sh](deploy/deploy.sh).

`JWT_SECRET` is mandatory when `ENV=production` (`openssl rand -hex 32`).

## Importing employees

```bash
python -m app.import_employees "רשימת עובדים.xlsx" --password '...' --dry-run
```

Matches columns by Hebrew header name. **National ID and date of birth are
deliberately not imported** — a service desk needs neither, and copying them into a
second system widens the exposure of personal data for no operational benefit.
Employees with no address on file get a generated `@buqata.muni.il` login so they can
still sign in; the script lists them so an administrator can correct the address.
Notifications to a generated address will not arrive.

## Notifications

Domain code emits an event key; the service resolves recipients, renders Hebrew copy,
persists a delivery row per recipient and channel, and hands it to whichever provider
is configured. Providers are adapters behind one interface (`services/notifications/providers.py`).

The default for all three channels is `log`: deliveries are recorded with recipient,
subject and body but nothing is sent. This is a real implementation, not a stub
pretending to deliver — every logged delivery is visible on the System Health page.
Set `EMAIL_PROVIDER=smtp` plus the `SMTP_*` values to send actual mail. SMS and
WhatsApp adapters are not implemented.

## Security

- bcrypt password hashing; forced password change on first login, enforced by a route guard.
- Guest tokens are 256-bit, stored **only as a SHA-256 digest**, scoped to one subtask,
  and invalidated the moment that subtask is resolved or closed. They can be revoked
  and regenerated. An invalid, revoked, expired token and a finished subtask all return
  the same `410`, so the endpoint cannot be used to probe for subtasks.
- Authorization is checked server-side on every route; the frontend is never trusted.
  A ticket belonging to someone else returns `404`, not `403`, to avoid confirming it exists.
- Uploads are validated by extension and content type, size-capped while streaming,
  and stored under a random name; downloads re-check the caller against the parent ticket.
- Login and guest endpoints are rate limited per address.
- Every meaningful transition, including every external action, is written to `audit_events`.

## Known limitations

- **SMS and WhatsApp have no provider adapters.** The data model, channel selection and
  delivery records exist, but only email has a real transport (SMTP), and it is off by
  default. An external assignee's guest link is recorded rather than sent until a
  provider is configured — a resolver can copy the link from the ticket in the meantime.
- **Rate limiting is in-process.** It is per-uvicorn-worker, so the effective limit is
  the configured value times the worker count. Move it to Redis before running the API
  on more than one host.
- **No SLA warning job.** SLA state is computed on read and shown throughout the UI, but
  nothing proactively emits `sla.warning`; that needs a scheduled task.
- **Roles are a fixed set** (`requester`, `resolver`, `approver`, `admin`) stored as a
  column rather than a table. Adding a role is a code change, not configuration.
- **Analytics are computed in Python** over the filtered ticket set. Fine at council
  scale; it would need SQL aggregation at hundreds of thousands of tickets.
- **Attachments are stored on local disk**, so the API is not horizontally scalable
  without shared storage.
- **No automated frontend tests.** TypeScript runs in strict mode with unused-symbol
  checks, and the build is verified, but there is no component or E2E browser suite.
- **Only the tickets grid uses AG Grid so far.** Approvals, the user directory and
  subtasks are still bespoke lists; their field configurations can be edited on the
  Table layout page but nothing reads them yet.
- **Translation coverage is uneven.** The shell, navigation, display menu, grid
  columns, domain vocabulary (statuses, priorities, roles, SLA) and the table-layout
  page are translated. Body copy on the longer pages — new ticket, ticket detail,
  categories, workflows, settings, the guest workspace — is still Hebrew-only and
  falls back to Hebrew in Arabic and English.
- **AG Grid is 1 MB** of the bundle. It is split into its own chunk, but pages that
  do not show a grid still pay for it on a warm cache only.

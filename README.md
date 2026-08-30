# MunicipOS Helpdesk

A municipal service desk for internal registered users and external subtask collaborators.

**Stack:** React + TypeScript (Vite) · Python (FastAPI + SQLAlchemy 2) · PostgreSQL 16.

## Core workflow
- Registered users only can log in, create tickets and see their own tickets.
- Categories define primary resolver, escalation resolver and approval thresholds.
- Approval can be triggered by estimated cost, estimated work hours, or request type (fault/new service).
- Resolver may transfer a ticket to another resolver, including another category.
- Ticket lifecycle: New -> Assigned -> Viewed -> In progress / subtasks -> Resolved or Rejected -> Reopened.
- Resolver may create one or more subtasks for internal or external people.
- External subtasks use a scoped token link. The token is valid while the subtask is open and stops working when resolved/closed.
- External assignee can comment, upload files, update status and resolve the subtask.
- Full audit history is retained.

## Local development

### 1. Database
```bash
docker compose up -d     # Postgres 16 on localhost:5433
```
PostgreSQL is required — the app refuses to start on any other `DATABASE_URL`.

### 2. Backend
```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # Linux/macOS: .venv/bin/pip
cp .env.example .env                                # then set ADMIN_PASSWORD
.venv/Scripts/python -m app.init_db                 # create tables
.venv/Scripts/python -m app.seed --demo             # admin + categories + demo accounts
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```
API docs: http://127.0.0.1:8000/docs

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

`--demo` creates `user@buqata.muni.il` and `resolver@buqata.muni.il` with password
`password123`. It is refused when `ENV=production`.

## Schema changes
Tables are created with `python -m app.init_db`, which only ever adds missing tables —
it will not alter or drop an existing column. Any change to `models.py` after the first
production deploy needs a real migration (see "Known gaps").

## Production deploy — support.buqata.muni.il
See [deploy/](deploy/). Target is an Ubuntu host running the same pattern as
novandgon.kortexd.com: source in `/opt/municipos-helpdesk`, uvicorn under systemd on
`127.0.0.1:8071`, nginx terminating TLS with Let's Encrypt and serving `frontend/dist`.

First run on the server:
```bash
sudo -u postgres createuser municipos --pwprompt
sudo -u postgres createdb  municipos --owner municipos
cp backend/.env.example backend/.env    # ENV=production, JWT_SECRET, DATABASE_URL, ADMIN_PASSWORD
certbot --nginx -d support.buqata.muni.il
sudo bash deploy/deploy.sh
```
Subsequent updates: sync source, re-run `deploy/deploy.sh`.

`JWT_SECRET` is mandatory when `ENV=production` — generate with `openssl rand -hex 32`.

## Known gaps
- **No migrations.** `init_db` creates missing tables only; adopt Alembic before the schema changes in production.
- **Attachments cannot be downloaded.** Upload endpoints write to `UPLOAD_DIR`, but no route serves the files back, and uploads are not size- or type-limited.
- **No notification delivery.** The data model records a `delivery_channel` per external subtask, but no email/SMS/WhatsApp adapter exists, so external assignees never receive their token link automatically — a resolver must copy `guest_url` manually.
- **No rate limiting** on `/api/auth/login`.
- **No automated tests.**

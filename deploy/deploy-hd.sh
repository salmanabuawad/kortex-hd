#!/usr/bin/env bash
# Server-side deploy/update for the separate instance at support.kortexd.com/hd.
# Its own database, uploads and port; the support.buqata.muni.il instance
# (deploy.sh) is not touched.
# Run as root on the Ubuntu host after syncing source to /opt/municipos-helpdesk-hd.
#
# First run only, before this script:
#   sudo -u postgres createuser municipos_hd --pwprompt
#   sudo -u postgres createdb  municipos_hd --owner municipos_hd
#   cp backend/.env.example backend/.env && edit it: ENV=production, JWT_SECRET,
#     DATABASE_URL, ADMIN_PASSWORD, FRONTEND_URL=https://support.kortexd.com,
#     PUBLIC_BASE_URL=https://support.kortexd.com/hd,
#     UPLOAD_DIR=/opt/municipos-helpdesk-hd/backend/uploads
set -euo pipefail

APP_DIR=/opt/municipos-helpdesk-hd
BACKEND=$APP_DIR/backend
FRONTEND=$APP_DIR/frontend
PORT=8073
BASE=/hd/

if [ ! -f "$BACKEND/.env" ]; then
  echo "missing $BACKEND/.env — copy .env.example and fill it in first" >&2
  exit 1
fi

echo "==> Backend: venv + deps"
cd "$BACKEND"
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip -q
./.venv/bin/pip install -r requirements.txt -q

echo "==> Backend: database migrations"
./.venv/bin/alembic upgrade head

echo "==> Backend: seed reference data + admin (idempotent, no demo accounts)"
./.venv/bin/python -m app.seed

echo "==> Frontend: build under $BASE"
cd "$FRONTEND"
npm ci --silent || npm install --silent
VITE_API_URL=${BASE}api npm run build -- --base=$BASE

mkdir -p "$APP_DIR/public"
ln -sfn "$FRONTEND/dist" "$APP_DIR/public/hd"

echo "==> Permissions"
chown -R municipos:municipos "$APP_DIR"
chmod 600 "$BACKEND/.env"

echo "==> systemd service"
cp "$APP_DIR/deploy/municipos-hd-api.service" /etc/systemd/system/municipos-hd-api.service
systemctl daemon-reload
systemctl enable municipos-hd-api
systemctl restart municipos-hd-api

echo "==> nginx site"
cp "$APP_DIR/deploy/support.kortexd.com.nginx" /etc/nginx/sites-available/support.kortexd.com
ln -sf /etc/nginx/sites-available/support.kortexd.com /etc/nginx/sites-enabled/support.kortexd.com
nginx -t
systemctl reload nginx

echo "==> Done. Backend on 127.0.0.1:$PORT, site at https://support.kortexd.com$BASE"

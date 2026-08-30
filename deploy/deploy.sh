#!/usr/bin/env bash
# Server-side deploy/update for support.buqata.muni.il.
# Run as root on the Ubuntu host after syncing source to /opt/municipos-helpdesk.
#
# First run only, before this script:
#   sudo -u postgres createuser municipos --pwprompt
#   sudo -u postgres createdb  municipos --owner municipos
#   cp backend/.env.example backend/.env && edit it (ENV=production, JWT_SECRET, DATABASE_URL, ADMIN_PASSWORD)
#   certbot --nginx -d support.buqata.muni.il
set -euo pipefail

APP_DIR=/opt/municipos-helpdesk
BACKEND=$APP_DIR/backend
FRONTEND=$APP_DIR/frontend
PORT=8060

if [ ! -f "$BACKEND/.env" ]; then
  echo "missing $BACKEND/.env — copy .env.example and fill it in first" >&2
  exit 1
fi

echo "==> Backend: venv + deps"
cd "$BACKEND"
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip -q
./.venv/bin/pip install -r requirements.txt -q

echo "==> Backend: create tables"
./.venv/bin/python -m app.init_db

echo "==> Backend: seed admin + categories (idempotent, no demo accounts)"
./.venv/bin/python -m app.seed

echo "==> Frontend: build"
cd "$FRONTEND"
npm ci --silent || npm install --silent
npm run build

echo "==> Permissions"
chown -R www-data:www-data "$APP_DIR"
chmod 600 "$BACKEND/.env"

echo "==> systemd service"
cp "$APP_DIR/deploy/municipos-api.service" /etc/systemd/system/municipos-api.service
systemctl daemon-reload
systemctl enable municipos-api
systemctl restart municipos-api

echo "==> nginx site"
cp "$APP_DIR/deploy/support.buqata.muni.il.nginx" /etc/nginx/sites-available/support.buqata.muni.il
ln -sf /etc/nginx/sites-available/support.buqata.muni.il /etc/nginx/sites-enabled/support.buqata.muni.il
nginx -t
systemctl reload nginx

echo "==> Done. Backend on 127.0.0.1:$PORT"

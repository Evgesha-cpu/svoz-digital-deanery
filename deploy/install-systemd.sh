#!/bin/bash
set -euo pipefail
umask 027
stage=$(cd -- "$(dirname -- "$0")" && pwd)
test "$(id -u)" = 0
test -s "$stage/polza.env"
for target in /opt/svoz /etc/svoz /var/lib/svoz /etc/systemd/system/svoz.service /etc/caddy/sites.d/svoz.caddy; do
    if test -e "$target"; then printf 'Existing path: %s\n' "$target" >&2; exit 1; fi
done
systemctl is-active --quiet caddy
test -d /etc/caddy/sites.d
test -z "$(ss -H -ltn '( sport = :18080 )')"

install -d -m 0755 /opt/svoz
install -d -m 0700 /etc/svoz
install -m 0600 "$stage/polza.env" /etc/svoz/polza.env
python3 -m zipfile -e "$stage/svoz-deploy.zip" /opt/svoz
chmod -R a+rX /opt/svoz

cat > /etc/systemd/system/svoz.service <<'UNIT'
[Unit]
Description=SVOZ contest demo
After=network-online.target
Wants=network-online.target

[Service]
DynamicUser=yes
StateDirectory=svoz
StateDirectoryMode=0700
WorkingDirectory=/opt/svoz/svoz
EnvironmentFile=/etc/svoz/polza.env
Environment=SVOZ_DB=/var/lib/svoz/seed.sqlite3 SVOZ_SECURE_COOKIE=1 SVOZ_ISOLATED_DEMO=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 /opt/svoz/svoz/server.py --host 127.0.0.1 --port 18080
Restart=on-failure
RestartSec=3
MemoryMax=192M
CPUQuota=50%
TasksMax=64
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now svoz
for attempt in {1..15}; do
    if curl -fsS http://127.0.0.1:18080/health; then break; fi
    sleep 1
done
curl -fsS http://127.0.0.1:18080/health >/dev/null

site=/etc/caddy/sites.d/svoz.caddy
install -m 0644 /opt/svoz/svoz/deploy/Caddyfile "$site"
if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || ! systemctl reload caddy; then
    mv "$site" /opt/svoz/svoz.caddy.disabled
    systemctl reload caddy || true
    echo 'SVOZ Caddy route disabled after validation/reload failure.' >&2
    exit 1
fi
rm -f -- "$stage/polza.env"
printf '\nSVOZ service and Caddy route installed.\n'

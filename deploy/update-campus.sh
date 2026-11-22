#!/bin/bash
set -euo pipefail
umask 077
stage=$(cd -- "$(dirname -- "$0")" && pwd)
app=/opt/svoz/svoz
state=/var/lib/svoz
drop_dir=/etc/systemd/system/svoz.service.d
drop="$drop_dir/90-campus-demo.conf"
test "$(id -u)" = 0
test "$(systemctl show svoz -p WorkingDirectory --value)" = "$app"
test -d "$state"
test ! -e "$drop"
cd "$stage"
sha256sum -c SHA256SUMS

runtime=()
while read -r checksum file; do
    case "$file" in
        server.py|schema.sql|seed.py|polza.py|campus.py|web/index.html|web/app.js|web/styles.css|web/campus.js) runtime+=("$file");;
        tests/public_campus.py|tests/test_api.py) ;;
        *) printf 'Unexpected file: %s\n' "$file" >&2; exit 1;;
    esac
done < SHA256SUMS
test "${#runtime[@]}" -ge 5
backup=$(mktemp -d /opt/svoz/rollback-campus-XXXXXXXX)
generation="campus-${backup##*-}"
mkdir -m 0700 "$backup/files" "$backup/sqlite"
for file in "${runtime[@]}"; do
    if test -f "$app/$file"; then install -D -m 0600 "$app/$file" "$backup/files/$file"; fi
done

rollback() {
    trap - ERR
    systemctl stop svoz || true
    if test -f "$drop"; then mv "$drop" "$backup/campus.conf.disabled"; fi
    for file in "${runtime[@]}"; do
        if test -f "$backup/files/$file"; then
            install -m 0644 "$backup/files/$file" "$app/$file"
        elif test -f "$app/$file"; then
            mv "$app/$file" "$backup/${file//\//_}.disabled"
        fi
    done
    systemctl daemon-reload
    systemctl start svoz
}
healthy() {
    for attempt in {1..15}; do
        if curl -fsS http://127.0.0.1:18080/health >/dev/null 2>&1; then return 0; fi
        sleep 1
    done
    return 1
}

trap rollback ERR
systemctl stop svoz
cp -a "$state/." "$backup/sqlite/"
printf 'SQLite backup saved: %s\n' "$backup/sqlite"
for file in "${runtime[@]}"; do
    install -m 0644 "$stage/$file" "$app/$file.next"
    mv -f "$app/$file.next" "$app/$file"
done
install -d -m 0755 "$drop_dir"
printf '[Service]\nEnvironment=SVOZ_DB=/var/lib/svoz/%s/seed.sqlite3\n' "$generation" > "$drop"
systemctl daemon-reload
systemctl start svoz
healthy
SVOZ_TEST_URL=https://svoz.evgfactory.ru python3 "$stage/tests/public_campus.py" --before-restart "$backup/verification.json"
systemctl restart svoz
healthy
SVOZ_TEST_URL=https://svoz.evgfactory.ru python3 "$stage/tests/public_campus.py" --after-restart "$backup/verification.json"
trap - ERR
printf 'Campus installed. New demonstration generation: %s. Previous state and files: %s\n' "$generation" "$backup"

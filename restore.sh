#!/usr/bin/env bash
# Puts a backup in the database's place and starts the app on it. Run it next to docker-compose.yml and .env.
#
#   ./restore.sh BACKUP          this server's database becomes the backup
#   ./restore.sh --test BACKUP   the backup runs as an offline copy beside the app, which stays as it is
#
# BACKUP is a snapshot of niche_notes.db, gzipped or not.
set -euo pipefail

usage='usage: ./restore.sh [--test] BACKUP'
mode=real
if [ "${1:-}" = --test ]; then mode=test; shift; fi
backup=${1:?$usage}
[ -f "$backup" ] || { echo "No such file: $backup" >&2; exit 1; }
[ -f docker-compose.yml ] && [ -f .env ] || { echo "Run this next to docker-compose.yml and .env." >&2; exit 1; }

if [ $mode = test ]; then
  copy=restore-test
  compose=(docker compose -p nichenotes-restore-test -f docker-compose.yml -f $copy/compose.yml)
  # A copy from an earlier run goes first.
  if [ -d $copy ]; then "${compose[@]}" down; rm -rf $copy; fi
  data=$copy/data
  mkdir -p $data
  # With no way out of its network the copy sends no alerts, writes to no calendar and signs nobody in.
  cat > $copy/compose.yml <<EOF
services:
  app:
    ports: !reset []
    volumes: !override
      - ./$data:/data
    environment:
      PHX_HOST: localhost
    networks: [offline]
networks:
  offline:
    internal: true
EOF
else
  compose=(docker compose)
  data=data
  mkdir -p $data
fi
run() { "${compose[@]}" run --rm --no-deps -T "$@"; }

# Checked before anything is replaced, so a damaged backup leaves the server as it was.
case "$backup" in
  *.gz) gunzip -c "$backup" > $data/restore.db ;;
  *) cp "$backup" $data/restore.db ;;
esac
# The app runs as uid 1000, whoever runs this script.
run --user 0 app chown -R 1000:1000 /data
check=$(run app sqlite3 /data/restore.db 'pragma integrity_check' || true)
if [ "$check" != ok ]; then
  rm -f $data/restore.db*
  echo "The backup is damaged. $check" >&2
  exit 1
fi

if [ $mode = real ]; then
  "${compose[@]}" down
  if [ -e $data/niche_notes.db ]; then
    aside=$data/before-restore-$(date +%Y%m%d-%H%M%S)
    mkdir "$aside"
    mv $data/niche_notes.db* "$aside"/
    echo "The database that was here is now in $aside."
  fi
fi
mv $data/restore.db $data/niche_notes.db

echo "The backup holds:"
run app /app/bin/niche_notes eval NicheNotes.Release.restored
"${compose[@]}" up -d

if [ $mode = test ]; then
  ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$("${compose[@]}" ps -q app)")
  url=http://$ip:4000
else
  url=http://127.0.0.1:$(grep '^PORT=' .env | cut -d= -f2 | grep . || echo 4000)
fi
# The app only answers plain http when asked for localhost.
answers() { curl -fsS -m 2 -o /dev/null -H 'Host: localhost' "$url/"; }
for _ in $(seq 60); do answers 2>/dev/null && break; sleep 1; done
answers || { "${compose[@]}" logs --tail 30 app; echo "The app did not come up." >&2; exit 1; }

if [ $mode = real ]; then
  echo "Restored and running. Each device sends what the backup lacks the next time it opens the app."
else
  echo "The copy answers at $url, only from this machine."
  echo "To open a note that has a link, from your own computer:"
  echo "  ssh -L 4141:$ip:4000 $(hostname)"
  run app sqlite3 /data/niche_notes.db "select '  http://localhost:4141/s/' || link from docs where link is not null"
  echo "Stop and delete the copy:"
  echo "  ${compose[*]} down && rm -r $copy"
fi

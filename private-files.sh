#!/usr/bin/env bash
# Carries what git leaves out to another machine: the secrets and signing keys, the dev database, and Claude's
# global instructions and notes for this project. The zip holds them unencrypted, so move it privately and delete it
# once restored. Stop ./dev.sh first, so the database is closed.
#   ./private-files.sh save [zip]       from this checkout, to ~/niche-notes-private.zip by default
#   ./private-files.sh restore [zip]    from a fresh clone; it overwrites what is there
set -euo pipefail

action=${1:-}
zip=${2:-$HOME/niche-notes-private.zip}
[[ $action == save || $action == restore ]] || { echo "usage: $0 save|restore [zip]" >&2; exit 1; }

root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# Zip entry, then where it lives on this machine.
places=()
for file in .env .guest-cookie tauri/updater.key \
    tauri/gen/android/release.keystore tauri/gen/android/keystore.properties \
    tauri/gen/android/app/google-services.json \
    server/data/dev.db server/data/dev.db-wal server/data/dev.db-shm; do
  places+=("repo/$file|$root/$file")
done
places+=("claude/CLAUDE.md|$HOME/.claude/CLAUDE.md")
# Claude names a project's folder after the checkout's path, so on another machine it has another name.
places+=("claude/memory|$HOME/.claude/projects/${root//[^a-zA-Z0-9]/-}/memory")

staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT

# Copies a file or a folder's contents, creating the destination.
copy_place() {
  if [[ -d $1 ]]; then
    mkdir -p "$2"
    cp -a "$1/." "$2"
  else
    mkdir -p "$(dirname "$2")"
    cp -a "$1" "$2"
  fi
}

if [[ $action == save ]]; then
  for place in "${places[@]}"; do
    entry=${place%%|*} path=${place#*|}
    if [[ ! -e $path ]]; then echo "not here, skipped: $path"; continue; fi
    copy_place "$path" "$staging/$entry"
    echo "saved $path"
  done
  rm -f "$zip"
  zip=$(realpath -m "$zip")
  (cd "$staging" && zip -qr "$zip" claude repo)
  echo "wrote $zip"
else
  unzip -q "$zip" -d "$staging"
  for place in "${places[@]}"; do
    entry=${place%%|*} path=${place#*|}
    [[ -e $staging/$entry ]] || continue
    copy_place "$staging/$entry" "$path"
    echo "restored $path"
  done
fi

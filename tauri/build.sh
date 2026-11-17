#!/bin/sh
# Builds the desktop app for the machine it runs on, with the commit count as its version, like the APK.
# Output: target/release/bundle
set -eu
cd "$(dirname "$0")"
# The server's host from the same .env the server reads, and the key that signs updates. A CI build sets both.
: "${PHX_HOST:=$(grep '^PHX_HOST=' ../.env | cut -d= -f2-)}" "${TAURI_SIGNING_PRIVATE_KEY:=updater.key}"
: "${PHX_HOST:?set PHX_HOST in .env}"
export PHX_HOST TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD=
# tauri.release.conf.json holds what only this build has: the app's own name and identifier, its `nichenotes://`
# links and its updates. Any other build is "Niche Notes Dev" on the dev server, so the two run side by side and a
# test build never takes the real app's links or touches what it stored.
cargo tauri build --ci --config tauri.release.conf.json \
  --config "{\"version\":\"$(git rev-list --count HEAD).0.0\"}" "$@"

#!/usr/bin/env bash
# Phoenix on :4100, Vite on :5173 and the desktop app. Open http://localhost:5173; /auth/login signs in a dev
# user, and /auth/login?as=wife signs in a second one for trying sharing.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# A config change needs a Phoenix restart, and a stale Vite would push the new one to another port.
lsof -ti :4100 -ti :5173 | xargs kill 2>/dev/null || true

# Connect Google Calendar needs the Google client from the repo's .env, and the Android app's alerts the Firebase
# account. The rest of that file is prod's.
set -a; source <(grep -E '^(GOOGLE|FIREBASE)_' "$ROOT/.env" 2>/dev/null); set +a

# +Bi has Phoenix ignore Ctrl-C and stop on the kill below instead, which closes the database. One it did not
# close looks like a restored backup, and every device then sends all its notes again.
(cd "$ROOT/server" && mix ecto.create --quiet && mix ecto.migrate --quiet &&
  ELIXIR_ERL_OPTIONS=+Bi exec mix phx.server) &
# The desktop app for this machine. On macOS it is an app bundle, since macOS shows an alert under an app's own
# name only for a bundle. In WSL it is the Windows app, which opens on the Windows desktop. It opens Vite's page,
# so it waits for Vite.
if [ -n "${WSL_DISTRO_NAME:-}" ]; then
  build=(--no-bundle --runner cargo-xwin --target x86_64-pc-windows-msvc)
  app=target/x86_64-pc-windows-msvc/debug/niche-notes.exe
elif [ "$(uname)" = Darwin ]; then
  build=(--bundles app)
  app="target/debug/bundle/macos/Niche Notes Dev.app/Contents/MacOS/niche-notes"
else
  build=(--no-bundle)
  app=target/debug/niche-notes
fi
(cd "$ROOT/tauri" && cargo tauri build --debug "${build[@]}" &&
  until curl -so /dev/null localhost:5173; do sleep 1; done &&
  exec "$app") &
trap 'kill 0' EXIT

cd "$ROOT/client" && npm run dev

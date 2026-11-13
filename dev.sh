#!/usr/bin/env bash
# Phoenix on :4000 and Vite on :5173. Open http://localhost:5173; /auth/login signs in a dev user,
# and /auth/login?as=wife signs in a second one for trying sharing.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# A config change needs a Phoenix restart, and a stale Vite would push the new one to another port.
lsof -ti :4000 -ti :5173 | xargs kill 2>/dev/null || true

# Connect Google Calendar needs the Google client from the repo's .env. The rest of that file is prod's.
set -a; source <(grep '^GOOGLE_' "$ROOT/.env" 2>/dev/null); set +a

(cd "$ROOT/server" && mix ecto.create --quiet && mix ecto.migrate --quiet && exec mix phx.server) &
trap 'kill 0' EXIT

cd "$ROOT/client" && npm run dev

#!/usr/bin/env bash
# Phoenix on :4000 and Vite on :5173. Open http://localhost:5173; /auth/login signs in a dev user,
# and /auth/login?as=wife signs in a second one for trying sharing.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

(cd "$ROOT/server" && mix ecto.create --quiet && mix ecto.migrate --quiet && exec mix phx.server) &
trap 'kill 0' EXIT

cd "$ROOT/client" && npm run dev

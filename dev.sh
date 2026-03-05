#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Start Postgres (waits until healthy before returning)
docker compose -f "$ROOT/docker-compose.dev.yml" up -d --wait

# Migrate (create DB first if it doesn't exist yet)
cd "$ROOT/server"
mix ecto.create --quiet 2>/dev/null || true
mix ecto.migrate --quiet

# Start Phoenix in the background
mix phx.server &
PHOENIX_PID=$!

# Kill Phoenix when this script exits (Ctrl+C or error)
trap 'kill $PHOENIX_PID 2>/dev/null' EXIT

# Start Vite in the foreground
cd "$ROOT/client" && npm run dev

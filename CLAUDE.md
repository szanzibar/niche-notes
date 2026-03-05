# niche-notes — Claude Context

## What this is

A self-hosted, offline-first collaborative notes and tasks app for family use (2-3 people).
Replacing Amplenote. See `docs/spec.md` for full requirements.

## Core Value: Simplicity

**Simplicity above all else.** This is the primary design constraint.

- Write the simplest code that works. Prefer boring, readable solutions over clever ones.
- Don't add abstractions until they're needed by at least two real cases.
- Don't add error handling, features, or config for hypothetical future requirements.
- When in doubt, do less. A smaller codebase is a better codebase.
- This serves 2-3 family members. Don't architect for scale we'll never need.
- No premature optimization. No over-engineering. No defensive coding against scenarios that can't happen.

## Tech Stack

### Backend (`server/`)
- Elixir 1.17+ / OTP 27, Phoenix 1.7
- Phoenix Channels for WebSocket real-time sync
- Ecto + PostgreSQL 16
- Assent for OIDC auth (Pocket ID integration)
- Plug.Session for cookie sessions

### Frontend (`client/`)
- React 18 + TypeScript, Vite
- Capacitor 6 (Android APK, Electron desktop)
- TipTap v2 (WYSIWYG editor)
- Y.js + y-indexeddb (offline-first CRDT for rich notes)
- Dexie.js (offline task queue)
- Tailwind CSS + Radix UI (headless accessible primitives)
- Zustand (client state), TanStack Query (server state)

### Deployment
- Docker Compose: `db` (Postgres) + `app` (Phoenix serves React build)
- Android: sideloaded APK
- Desktop: Electron via Capacitor

## Common Commands

```bash
# Backend
cd server
mix deps.get
mix ecto.setup
mix phx.server          # http://localhost:4000

# Frontend
cd client
npm install
npm run dev             # http://localhost:5173

# Docker
docker compose up -d    # starts db + app in production mode
docker compose down

# Database
mix ecto.migrate
mix ecto.rollback

# Capacitor (after npm run build)
npx cap sync
npx cap open android    # opens Android Studio
npx cap open electron   # opens Electron
```

## Project Structure

```
niche-notes/
├── CLAUDE.md           # ← you are here
├── docker-compose.yml
├── server/             # Elixir Phoenix app
│   └── lib/
│       ├── niche_notes/         # domain contexts
│       └── niche_notes_web/     # web layer (channels, controllers, router)
├── client/             # React + Capacitor
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── sync/        # Y.js provider, task offline queue
│       ├── native/      # Capacitor plugin abstractions
│       └── stores/
└── docs/
    ├── spec.md
    ├── data-model.md
    └── adr/
```

## Architecture Decisions

**Why Phoenix Channels (not LiveView):** Offline-first requires the app to work disconnected. LiveView requires a live server connection.

**Why Y.js (not custom sync):** CRDT handles concurrent offline edits automatically. The Phoenix Channel is just a relay + persistence layer — no CRDT logic needed server-side.

**Why Capacitor (not PWA, not Flutter):** PWA Background Sync is unreliable. Flutter can't use Y.js or TipTap. Capacitor wraps our React app in a native container, giving us native SQLite, local notifications, and app distribution — while keeping one JS codebase.

**Why Radix UI + Tailwind (not shadcn/ui):** shadcn/ui is overused and visually associated with AI-generated apps. Radix gives us accessible headless primitives; we style everything ourselves with our neo-brutalist design system.

**Why local notifications only (not server push):** The app is offline-first and has all task data locally. `@capacitor/local-notifications` schedules OS alarms directly — no Firebase, no ntfy, no external services.

## UI Design System

Direction: **Neo-brutalist** — bold, direct, not the typical rounded-gray-card AI aesthetic.

- Borders: solid 2px `#111` on interactive elements
- Shadows: solid offset `4px 4px 0 #111` — not blurred
- Radius: square (0px) or a single consistent small value (4px), never mixed
- Colors: off-white `#FAFAF8` base, near-black `#111` text, one bold accent (TBD)
- Typography: Space Grotesk — not Inter
- No gradients, no glass, no transparency, no skeleton loaders

## Key Files to Read for Context

- `docs/spec.md` — full feature requirements
- `docs/data-model.md` — database schema
- `server/lib/niche_notes_web/channels/` — sync architecture
- `client/src/sync/` — Y.js provider and task sync

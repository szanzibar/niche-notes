# niche-notes

A self-hosted, offline-first notes app for a family of two or three, replacing Amplenote. The family jots notes and lists on their phones and edits the same shopping list at the same time. Requirements are in [docs/spec.md](docs/spec.md), the schema in [docs/data-model.md](docs/data-model.md), decisions in [docs/adr/](docs/adr/), and the checklist in [docs/todo.md](docs/todo.md).

## How we work here

The architecture and writing standards in `~/.claude/CLAUDE.md` apply in full. Two of them weigh even more here:

- **Family scale.** Two or three users and a few thousand notes. A mechanism that only pays off at SaaS scale is wrong here, so name the ceiling in a one-line comment and move on.
- **MVP first.** We ship the smallest version the family uses daily, then add what real use asks for. A feature that is not in docs/spec.md does not get built, and scaffolding for a later feature gets cut.

Read the task and every file it touches before writing code. For anything beyond a small fix, propose a short plan first.

## Stack

Versions live in `.tool-versions`, `server/mix.exs` and `client/package.json`, not here.

- `server/`: Elixir and Phoenix with Ecto on SQLite. Phoenix Channels relay and persist Y.js updates. Assent handles OIDC login against Pocket ID, and the session is a cookie.
- `client/`: React with TypeScript and Vite. TipTap for editing, Y.js for the document model and sync, Dexie for the local update log, Tailwind and Radix UI for the interface.
- `android/`: a Trusted Web Activity, so Chrome renders the server's app under our icon; a WebView cannot log in with Pocket ID passkeys (ADR 002). On the desktop the browser installs the PWA. Native code goes in `android/` only for what the web cannot do, such as widgets.
- Deployment: a push to `main` publishes `ghcr.io/szanzibar/niche-notes:latest` from GitHub Actions; the server runs it with `docker-compose.yml`, an `.env` and a `data/` directory for the SQLite file. Phoenix serves the built client from `server/priv/static`.

## Commands

```bash
./dev.sh                     # migrate, Phoenix on :4000, Vite on :5173
cd server && mix test        # also mix compile --warnings-as-errors, mix format
cd client && npm run build   # tsc then vite, writes to server/priv/static
cd client && npm run e2e     # Playwright against its own Phoenix (:4199) and Vite (:5199)
```

Every major user flow has an e2e test in `client/e2e`. A change to a flow updates or adds one.

Steven keeps the running task list in a note on the prod server and ticks items himself as he checks them.
Read it from the repo root with `curl -H "Authorization: Bearer $(grep TASKS_TOKEN .env | cut -d= -f2-)"
https://$(grep PHX_HOST .env | cut -d= -f2-)/api/widget`. That token is a widget token, so it reads only that one note.

In dev, `/auth/login` signs in a local user without Pocket ID, and `/auth/login?as=<name>` signs in another.

## Architecture rules

- **Y.js is the sync layer.** Each note is a Y.Doc, and so is each user's tree. Edits apply locally first, then the channel relays the binary update and stores it. The server may read and edit a document too, as one more Y.js client whose edits land in the same log. See [ADR 001](docs/adr/001-yjs-everywhere.md).
- **The device holds everything the UI needs.** Offline is the normal state, so a screen that has to wait for the server before it can act is a bug. Sharing is the one exception.
- **Local first, server for what no device can do.** Everything a person does in the app runs on the device. The server holds auth, sharing and the update log, plus work that has to happen while every app is closed or that talks to another service, such as widgets, reminders and calendar sync. The protocol is in [docs/data-model.md](docs/data-model.md).
- **Content is shared, placement is private.** A note's text has one owner and a share list. Where it sits in a tree is each person's own business. See [ADR 004](docs/adr/004-sharing-is-content-not-placement.md).

## Layout

```
server/lib/niche_notes/        Accounts, Docs, schemas, release migrator
server/lib/niche_notes_web/    router, controllers, channels, auth plug
client/src/sync/               local store, channels, tree helpers, React hooks
client/src/components/         tree, note editor, toolbar, dialogs
client/src/lib/                API client and types
android/                       Trusted Web Activity launcher, build.sh runs gradle in the Android SDK image
icon/                          vector app icon and the script that renders every size
docs/                          spec, data model, ADRs, todo
```

## Design system

Neo-brutalist: bold and direct, not the rounded gray card look.

- Borders are solid 2px `#111`. Shadows are solid offsets, `4px 4px 0 #111`, never blurred.
- Corners are square, or one small radius used everywhere.
- Off-white `#FAFAF8` base, near-black `#111` text, coral red `#FF4F3B` accent. Dark mode flips the neutrals through `light-dark()` on the same tokens; the accent is the user's setting.
- Space Grotesk for type.
- Icons over words. A button shows an icon, with its name as `aria-label` and `title` (`IconButton`). Words only where no icon reads clearly, such as Restore or Delete forever.
- The accent marks what is on or chosen: a pinned or shared note, an active tool, the selection, a highlight.
- No gradients, glass, transparency or skeleton loaders.
- Tokens are CSS variables in `client/src/index.css`, mapped to Tailwind classes (`bg-bg`, `text-ink`, `text-ink-muted`, `bg-accent`, `border-border`, `shadow-brutal`).
- Radix UI headless primitives, styled by hand. Not shadcn/ui.

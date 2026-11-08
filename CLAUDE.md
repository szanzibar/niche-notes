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
- `electron/` and `client/android/`: shells that load the app from the server. Nothing app-specific lives in them.
- Deployment: one Docker container with a volume for the SQLite file. Phoenix serves the built client from `server/priv/static`.

## Commands

```bash
./dev.sh                     # migrate, Phoenix on :4000, Vite on :5173
cd server && mix test        # also mix compile --warnings-as-errors, mix format
cd client && npm run build   # tsc then vite, writes to server/priv/static
```

In dev, `/auth/login` signs in a local user without Pocket ID, and `/auth/login?as=<name>` signs in another.

## Architecture rules

- **Y.js is the sync layer.** Each note is a Y.Doc, and so is each user's tree. Edits apply locally first, then the channel relays the binary update and stores it. The server never reads a document. See [ADR 001](docs/adr/001-yjs-everywhere.md).
- **The device holds everything the UI needs.** Offline is the normal state, so a screen that has to wait for the server before it can act is a bug. Sharing is the one exception.
- **The server stays thin.** Auth, one socket, an update log, and who may open which doc. Logic goes in the client, where the data is. The protocol is in [docs/data-model.md](docs/data-model.md).
- **Content is shared, placement is private.** A note's text has one owner and a share list. Where it sits in a tree is each person's own business. See [ADR 004](docs/adr/004-sharing-is-content-not-placement.md).

## Layout

```
server/lib/niche_notes/        Accounts, Docs, schemas, release migrator
server/lib/niche_notes_web/    router, controllers, channels, auth plug
client/src/sync/               local store, channels, tree helpers, React hooks
client/src/components/         tree, note editor, toolbar, dialogs
client/src/lib/                API client and types
electron/                      desktop shell
docs/                          spec, data model, ADRs, todo
```

## Design system

Neo-brutalist: bold and direct, not the rounded gray card look.

- Borders are solid 2px `#111`. Shadows are solid offsets, `4px 4px 0 #111`, never blurred.
- Corners are square, or one small radius used everywhere.
- Off-white `#FAFAF8` base, near-black `#111` text, coral red `#FF4F3B` accent.
- Space Grotesk for type.
- No gradients, glass, transparency or skeleton loaders.
- Tokens are CSS variables in `client/src/index.css`, mapped to Tailwind classes (`bg-bg`, `text-ink`, `text-ink-muted`, `bg-accent`, `border-border`, `shadow-brutal`).
- Radix UI headless primitives, styled by hand. Not shadcn/ui.

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
- `tauri/`: the apps for Android, macOS and Windows, a Tauri window on the server's app. On a desktop it stays in the tray. Its Rust holds only what the web cannot do there: the login hand-off from the default browser, alerts over the socket, since its webviews have no Web Push, and the self-update (ADR 002 and 006 amendments). The Android app's Kotlin and Java in `tauri/gen/android` hold its widgets, its Firebase alerts, the keyboard a widget raises and its self-update. The page never calls the shell. Only `tauri/build.sh` builds the real app. Every other build is `Niche Notes Dev` on the dev server with its own identifier, so it runs beside the installed app and never takes its links or touches what it stored. Browsers still install the PWA.
- Deployment: a push to `main` publishes `ghcr.io/szanzibar/niche-notes:latest` from GitHub Actions, and the APK and the desktop app when `tauri/` changed; the server runs it with `docker-compose.yml`, an `.env` and a `data/` directory for the SQLite file. Phoenix serves the built client from `server/priv/static`.

## Commands

```bash
./dev.sh                     # migrate, Phoenix on :4100, Vite on :5173, the desktop app built and opened on Vite's page
cd server && mix test        # also mix compile --warnings-as-errors, mix format
cd client && npm run build   # tsc then vite, writes to server/priv/static
cd client && npm run e2e     # Playwright against its own Phoenix (:4199) and Vite (:5199)
```

Every major user flow has an e2e test in `client/e2e`. A change to a flow updates or adds one. The Mac app runs on Safari's engine, so the suite also runs with `-- --browser=webkit` before a desktop release.

Steven keeps the running task list in a note on the prod server, shared by the guest link in `.env` as
`PUBLIC_DEV_TASK_LIST`. Read it from the repo root with
`NOTES_LINK=$(grep PUBLIC_DEV_TASK_LIST .env | cut -d= -f2-) node client/scripts/note.mjs show ""`, and tick an item
once it is done with `check "" "<item text>"`.

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
tauri/                         the apps: window, login hand-off, alerts, self-update; build.sh builds the desktop app, android.sh the APK
tauri/gen/android/             the Android app's widgets, Firebase alerts and update check
icon/                          vector app icon and the script that renders every size
docs/                          spec, data model, ADRs, todo
docker-compose.restore-test.yml  runs a backup as an offline copy beside the app (README)
```

## Design system

Neo-brutalist: bold and direct, not the rounded gray card look.

- Flat. Solid 2px `#111` borders frame the bars, dialogs, popovers and fields, and nothing casts a shadow.
- Corners are square, or one small radius used everywhere.
- Near-black `#111` text on a page and tree tinted with the theme's color, coral `#FF4F3B` unless the user picks another. The color fills the note header, and Dark mode flips the neutrals through `light-dark()` on the same tokens.
- A fill of the color takes the theme's own text color (`text-on-accent`), and the color as text or a thin line on the page takes `text-accent-ink`, so pale themes stay readable.
- Space Grotesk for type.
- Icons over words. A button shows an icon, with its name as `aria-label` and `title` (`IconButton`). Words only where no icon reads clearly, such as Restore or Delete forever. A control has no box around it: a word button is underlined (`Button`), and among choices the chosen one is filled with the accent.
- No explanations on screen. A control says what it does, and a section's details sit behind an info icon beside its name.
- The accent marks what is on or chosen: a pinned or shared note, an active tool, the selection, a highlight. It never decorates, so a section gets no colored bar.
- A note looks the same wherever it is listed (`NoteTitle`): its color stripe, title, pin, filled share icon and owner. The tree indents it under its parent, and search adds the matched text under it.
- A section is a label of small grey capitals under a 2px rule, as Recent, Trash and the due list's days are. One that folds adds a chevron and its count.
- Before styling something new, reuse the look of the nearest thing of its kind: a listed note, a section, a choice, a drop line.
- No gradients, glass, transparency or skeleton loaders.
- Tokens are CSS variables in `client/src/index.css`, mapped to Tailwind classes (`bg-bg`, `bg-tint`, `text-ink`, `text-ink-muted`, `bg-accent`, `text-on-accent`, `text-accent-ink`, `border-border`).
- Radix UI headless primitives, styled by hand. Not shadcn/ui.

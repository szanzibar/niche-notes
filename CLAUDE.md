# niche-notes

A self-hosted, offline-first notes app for a family of two or three, replacing Amplenote. The family jots notes and lists on their phones and edits the same shopping list at the same time. Requirements are in [docs/spec.md](docs/spec.md), the schema in [docs/data-model.md](docs/data-model.md), decisions in [docs/adr/](docs/adr/), and the checklist in [docs/todo.md](docs/todo.md).

## How we work here

The architecture and writing standards in `~/.claude/CLAUDE.md` apply in full. Two of them weigh even more here:

- **Family scale.** Two or three users and a few thousand notes. A mechanism that only pays off at SaaS scale is wrong here, so name the ceiling in a one-line comment and move on.
- **MVP first.** We ship the smallest version the family uses daily, then add what real use asks for. A feature that is not in docs/spec.md does not get built, and scaffolding for a later feature gets cut.

Read the task and every file it touches before writing code. For anything beyond a small fix, propose a short plan first.

## Stack

Versions live in `mise.toml`, `server/mix.exs` and `client/package.json`, not here.

- `server/`: Elixir and Phoenix with Ecto on SQLite. Phoenix Channels relay and persist Y.js updates. Assent handles OIDC login against Pocket ID, and the session is a cookie.
- `client/`: React with TypeScript and Vite. TipTap for editing, Y.js for the document model and sync, Dexie for the local update log, Tailwind and Radix UI for the interface.
- `tauri/`: the apps for Android, macOS, Windows and Linux, a Tauri window on the server's app. On a desktop it stays in the tray. Its Rust holds only what the web cannot do there: the login hand-off from the default browser, alerts over the socket, since its webviews have no Web Push, and the self-update (ADR 002 and 006 amendments). The Android app's Kotlin and Java in `tauri/gen/android` hold its widgets, its Firebase alerts, the keyboard a widget raises and its self-update. The page never calls the shell. Only `tauri/build.sh` builds the real app. Every other build is `Niche Notes Dev` on the dev server with its own identifier, so it runs beside the installed app and never takes its links or touches what it stored. Browsers still install the PWA.
- Deployment: a push to `main` publishes `ghcr.io/szanzibar/niche-notes:latest` from GitHub Actions, and the APK and the desktop app when `tauri/` changed; the server runs it with `docker-compose.yml`, an `.env` and a `data/` directory for the SQLite file. Phoenix serves the built client from `server/priv/static`.

## Commands

```bash
./dev.sh                     # migrate, Phoenix on :4100, Vite on :5173, the desktop app built and opened on Vite's page
cd server && mix test        # also mix compile --warnings-as-errors, mix format
cd client && npm run build   # tsc then vite, writes to server/priv/static
cd client && npm run e2e     # Playwright against its own Phoenix (:4199) and Vite (:5199)
cd client && npm run e2e:app # the same servers with the desktop app over WebDriver, in Docker
```

The browsers in `client/e2e` never load the apps' shell, so `client/e2e-app` covers what the shell does to the page and runs before an app release.

Every major user flow has an e2e test in `client/e2e`. A change to a flow updates or adds one. The Mac app runs on Safari's engine, so the suite also runs with `-- --browser=webkit` before a desktop release. On Linux, which lacks the libraries Playwright's WebKit is built against, the browser runs in Playwright's image:

```bash
cd client && v=$(node -p "require('@playwright/test/package.json').version") &&
  docker run -d --rm --name playwright --network host --init --user pwuser mcr.microsoft.com/playwright:v$v-noble \
    npx -y playwright@$v run-server --port 3000 --host 127.0.0.1
PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:3000/ npm run e2e -- --browser=webkit
```

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

## Design

The family is mostly not technical and mostly on phones, so every screen has to work at a glance and on a first visit. Steven uses it most, so it also has to stay quick for someone who knows it by heart. These rules keep both true, and they keep the app looking like one thing as features pile up.

**Words and icons.**
- A bar shows bare icons, since people see it every day and learn it once. The bars are the tree's header and footer, the note's header and the editor toolbar. Each icon still names itself in `aria-label` and `title` (`IconButton`), which a desktop shows on hover.
- A menu shows an icon and its name on every row (`MenuItem`), because a phone has no hover, and a menu is where people look when they don't know an icon.
- An action that deletes or signs out has a name in words and lives in a menu, a dialog or the trash, never as a bare icon on a bar. The toolbar's edits at the cursor are the exception, since Undo takes them back at once.
- No helper text. A control's name says what it does, a status shows as a short fact ("Blocked on this device."), and a section's details sit behind an info icon beside its name (`Info`).
- A setting with several answers is one choice among words, with the chosen one filled with the accent, like Appearance in Settings or Show · Hide · Delete for checked tasks. Two switches that can't both be on are one choice.

**Words.** Everything a person reads, widgets, alerts and the calendar included, uses the app's nouns: a note, a task (a line with a checkbox), a task list, the trash. Where a menu holds more than one delete, each one names its object ("Delete note", "Delete checked"). Code and comments keep their own terms, such as `line` and `taskItem`.

**One of each.** Before adding anything, find the nearest thing of its kind and reuse it. If nothing fits, ask before inventing a look.
- A note wherever it is listed: `NoteTitle`, with its color stripe, title, pin, filled share icon and owner. The tree indents it under its parent, and search adds the matched text under it.
- A section: a label of small grey capitals under a 2px rule, as Recent, Trash, the due list's days and the menu's Checked tasks are. One that folds adds a chevron and its count.
- A word action: `Button`, underlined, with no box around it.
- A choice: `Button` with `aria-pressed`.
- A menu row: `MenuItem`.
- A box a button opens: `Popover`, beside that button. It keeps focus in the note, so the phone's keyboard stays up.
- An icon: an SVG in `icons.tsx` on its 24-unit grid and stroke, never a typed character such as ← or ✕.
- A drag: the drop line with its square, and the note or line it goes into outlined.

**Look.** Neo-brutalist: bold and direct, not the rounded gray card look.
- Flat. Solid 2px `#111` borders frame the bars, dialogs, popovers and fields, and nothing casts a shadow.
- Corners are square, or one small radius used everywhere.
- Near-black `#111` text on a page and tree tinted with the theme's color, coral `#FF4F3B` unless the user picks another. The color fills the note header, and Dark mode flips the neutrals through `light-dark()` on the same tokens.
- A fill of the color takes the theme's own text color (`text-on-accent`), and the color as text or a thin line on the page takes `text-accent-ink`, so pale themes stay readable.
- The accent marks what is on or chosen: a pinned or shared note, an active tool, the selection, a highlight. It never decorates, so a section gets no colored bar.
- Space Grotesk for type.
- No gradients, glass, transparency or skeleton loaders. The one exception is the dimmer behind a dialog.
- Tokens are CSS variables in `client/src/index.css`, mapped to Tailwind classes (`bg-bg`, `bg-tint`, `text-ink`, `text-ink-muted`, `bg-accent`, `text-on-accent`, `text-accent-ink`, `border-border`).
- Radix UI headless primitives, styled by hand. Not shadcn/ui.

Before calling a UI change done, screenshot it at phone and desktop width beside its neighbors.

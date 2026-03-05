# niche-notes — Work Tracking

## Phase 1: Foundation (MVP — web only)

### Server
- [x] Phoenix 1.8 bootstrapped (`mix phx.new --no-live --no-mailer --no-dashboard --no-gettext --binary-id`)
- [x] Remove dead LiveView / asset pipeline scaffold (core_components, layouts, page_controller, esbuild/tailwind config)
- [x] `mix.exs` — remove phoenix_live_view, esbuild, tailwind, heroicons; add assent, req
- [x] Database migrations — users, notebooks, notebook_members, notes, tasks
- [x] Domain contexts — Accounts, Notebooks, Notes, Tasks
- [x] OIDC auth — Assent + AuthController (login / callback / logout)
- [x] RequireAuth plug
- [x] REST API controllers — NotebookController, NoteController, TaskController
- [x] `GET /api/me` — MeController
- [x] Phoenix Channels — UserSocket, NoteChannel, NotebookChannel
- [x] `mix ecto.setup` + `mix phx.server` smoke test
- [x] Dev auth bypass — `GET /auth/login` auto-signs-in without Pocket ID in dev
- [ ] Auth end-to-end test (Pocket ID redirect → callback → session)

### Client
- [x] Vite + React 18 + TypeScript bootstrapped
- [x] Tailwind v4 with `@tailwindcss/vite`, Space Grotesk font
- [x] CSS design tokens (`--accent`, `--bg`, `--ink`, `--shadow-brutal`, etc.)
- [x] Base UI components — Button, Card, Input, Badge
- [x] `src/lib/types.ts` — shared TypeScript types
- [x] `src/lib/api.ts` — fetch wrapper + typed API calls
- [x] `src/stores/auth.ts` — Zustand auth store
- [x] App.tsx — auth bootstrap, routes
- [x] NotebooksPage — list + create dialog
- [x] NotebookPage — notes list or task list depending on notebook type
- [x] NotePage — TipTap WYSIWYG editor + Y.js sync
- [x] TasksView — task list with checkboxes, add/delete
- [x] Vite proxy config for dev (`/api`, `/auth`, `/socket` → `localhost:4000`)
- [x] `npm run build` output wired into Phoenix `priv/static`

---

## Phase 2: Real-time Sync (Y.js + Phoenix Channels)

- [x] Install y.js, y-indexeddb, @tiptap/react, @tiptap/starter-kit, @tiptap/extension-collaboration, phoenix
- [x] Replace textarea in NotePage with TipTap + Y.js provider
- [x] `client/src/sync/useNoteSync.ts` — Y.js Phoenix Channel hook (connect, join, send/receive updates)
- [x] NoteChannel relay — receive `yjs_update`, persist to `ydoc_state`, broadcast to others
- [x] On channel join, send full `ydoc_state` blob to new client

---

## Phase 3: Offline-First

- [ ] y-indexeddb for note persistence (survives page reload while offline)
- [ ] Dexie.js task mutation queue — buffer creates/updates/deletes while offline
- [ ] Drain queue on reconnect
- [ ] Conflict resolution policy documented

---

## Phase 4: Native (Capacitor)

- [ ] `npx cap init` + add `@capacitor/core`, `@capacitor/android`, `@capacitor/electron`
- [ ] `@capacitor/local-notifications` — schedule task reminders on-device
- [ ] Android APK build + sideload test
- [ ] Electron desktop build test

---

## Backlog / Nice-to-have

- [ ] Note search (full-text via `content_text`)
- [ ] Notebook sharing UI (add/remove members)
- [ ] Task recurrence (rrule parsing + `next_occurrence_at` update)
- [ ] Dark mode (CSS variable swap)
- [ ] CalDAV export (tasks)

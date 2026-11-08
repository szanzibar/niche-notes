# niche-notes — v1 checklist

## Server
- [x] Swap Postgres for SQLite, drop dead scaffold deps
- [x] Tables: users, docs, doc_shares, doc_updates
- [x] Tree doc created with the user
- [x] `doc:<id>` channel: join with since, create on first join, update relay
- [x] `user:<id>` channel: shares_changed
- [x] `/api/users`, `/api/shares`, share add and remove
- [x] Dev login as named test users
- [x] Tests: access refused, join returns updates since, first join creates, share grants access
- [x] Dockerfile and single-container compose, release migrates on boot

## Client
- [x] Local store: Dexie updates table, Y.Doc registry, channel per doc, outbox flush on join
- [x] Tree page: nested notes, new note, move to, delete or remove, Shared with me, online dot, sign out
- [x] Note page: title, TipTap body, toolbar, share dialog
- [x] Checked items crossed out
- [x] Responsive: list and note side by side on desktop, one at a time on phones
- [x] Service worker and manifest

## Native
- [x] Capacitor Android project pointing at the server
- [x] Electron shell with mac and Windows build config

## Still to do by hand
- [ ] Deploy: fill `.env`, register the OIDC client in Pocket ID, `docker compose up -d` behind TLS
- [ ] Sign in once as each family member so they show up in the share picker
- [ ] Android: set the server and Pocket ID hosts in `client/capacitor.config.ts`, build the APK in Android Studio, try passkey login in the WebView
- [ ] Desktop: set the url in `electron/config.json`, `npm run build:mac` / `build:win`, try passkey login in Electron
- [ ] Try the phone keyboard with the bottom toolbar on a real device

## Later
- Markdown export
- Share a note with its current children
- Manual ordering and drag and drop
- Compaction of doc_updates and of the local table
- Search
- Trash view and undelete

# niche-notes — checklist

## V1 core, local — complete 2026-11-09

Built 2026-11-08, polished through 2026-11-09 from Steven's in-app task list: title focus, Enter/Tab to body, + on rows, drag and drop with sibling and child drop lines and a touch grip, ownership labels, persistent undo, live unshare, server-first pushes, trash with Restore, Delete forever, Leave and a 30-day client-side sweep, live carets, snapshot compaction decided by the server, read-only trashed notes, list buttons that act on the cursor's own level, search over everything including the trash, pins, shared notes landing at the top of the recipient's tree, settings for highlight color, appearance and density, a phone header whose dots reveal the action row, and a conflict spec that replays two people shopping offline. Every flow has a Playwright test in `client/e2e` (`npm run e2e` from `client/`); the server has ExUnit tests (`mix test` from `server/`).

Steven keeps the running task list in the app itself, in the note "niche note task list". Read it with `node scripts/note.mjs show "task list"` from `client/` and tick items with `check` when they are done.

## Before the apps

The Android and desktop apps load the web app from the server, so they are useless until the server has an address, and every build bakes that address in.

The server is a home server: a push to `main` makes GitHub Actions publish `ghcr.io/szanzibar/niche-notes:latest`, and `the server's directory` holds only `docker-compose.yml`, `.env` and `data/`. Watchtower pulls new images on its daily pass; `docker compose pull && docker compose up -d` does it now. Caddy terminates TLS for `notes.example.com` and proxies to the container on 127.0.0.1:4040. The hourly backup snapshots the SQLite file into `_db_dumps` like the other backups, and the live file is excluded from rclone.

- [x] Caddy entry, backup hook, compose and `.env` on the server (2026-11-10)
- [x] First image published by the Publish Container workflow, package made public, the server pulls it (2026-11-10)
- [x] Pocket ID client registered and the production login proven in a browser: redirect, passkey, cookie session, name arrives in the ID token (2026-11-10)
- [ ] Steven's wife signs in once, so she exists to share with
- [x] App icon: `icon/icon.svg` is the vector source and `icon/render.sh` writes the PWA icons, the Android mipmaps and `electron/build/icon.png` (2026-11-10)

## Apps: local builds first, then the same in Actions

Android is a Trusted Web Activity (ADR 002 amendment): Chrome renders the site under our icon, because Pocket ID refuses passkeys from a WebView. `android/build.sh` runs gradle in `ghcr.io/cirruslabs/android-sdk:36`, signed with `android/release.keystore` and `android/keystore.properties`, both outside git. The signing certificate's fingerprint is published in `client/public/.well-known/assetlinks.json`; Chrome only drops its address bar once that file is live on the server.

- [ ] Back up `android/release.keystore` and `android/keystore.properties` in the password manager; a lost key means a new app identity and no in-place updates
- [x] APK installs and runs on Steven's phone (2026-11-10)
- [ ] With the assetlinks deploy live, check on the phone: no address bar, offline start after the first launch, bottom toolbar with the keyboard
- [ ] GitHub Actions on a `v*` tag: the same gradle command in the same image, keystore and passwords from secrets, APK attached to the release
- [ ] Hide the address bar during login too: Caddy serves the same assetlinks on `auth.example.com` and the launcher lists it in `ADDITIONAL_TRUSTED_ORIGINS`
- [x] Desktop decided 2026-11-10: the installed PWA from Chrome or Edge; Electron removed

## Later

- Android home-screen widget, first v2 item. Native code in `android/` next to the launcher. It needs two things the TWA does not have: its own login (the session cookie lives in Chrome, so a browser-based handoff that trades a one-time code for a token) and plain data to show, since the server stores only Y.js bytes. The client would publish a plain rendition of the chosen notes to the server; ticking from the widget would go back the same way.
- Markdown export
- Share a note with its current children
- Remember the cursor position per note

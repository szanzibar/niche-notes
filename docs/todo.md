# niche-notes — checklist

## V1 core, local

Built 2026-11-08. QOL rounds 2026-11-09: title focus, Enter/Tab to body, + on rows, drag and drop with sibling and child zones, ownership labels, persistent undo, live unshare, server-first pushes, trash bin with 30-day purge, live carets, drag overlay with an indentation-aware drop line, trash pinned to the panel bottom, mixed checkbox and bullet nesting, snapshot compaction of the update log, read-only view of trashed notes, list buttons that act on the cursor's own level, search with keyboard navigation, pins, shared notes landing at the top of the recipient's tree, touch drag handles, settings with a highlight color, opening a note focuses its text, a conflict spec that replays two people shopping offline, compaction decided by the server (busy or a day idle), moved notes land where the drop line showed. Every major flow has a Playwright test in `client/e2e`; run `npm run e2e` from `client/`.

Steven keeps the running task list in the app itself, in the note "niche note task list". Read it with `node scripts/note.mjs show "task list"` from `client/` and tick items with `check` when they are done.

- [ ] Steven and spouse use it daily from `./dev.sh` and list what's missing or awkward
- [ ] Try the phone layout in a narrow browser window: tree, note, toolbar, drag with a long press
- [ ] Decide on the next rough edges from real use before touching the apps

## After v1: apps and deployment

None of this needs Android Studio. Builds run in CI or a container.

- [ ] GitHub Action: `./gradlew assembleDebug` in `client/android` with JDK 17 and the Android SDK action, upload the APK
- [ ] GitHub Action: electron-builder on a macOS runner for the dmg and a Windows runner for the installer
- [ ] Set the server and Pocket ID hosts in `client/capacitor.config.ts` and `electron/config.json`
- [ ] Deploy: fill `.env`, register the OIDC client in Pocket ID, `docker compose up -d` behind TLS
- [ ] Sign in once as each family member so they show up in the share picker
- [ ] Passkey login inside the Android WebView and inside Electron
- [ ] Phone keyboard with the bottom toolbar on a real device

## Later

- Markdown export
- Share a note with its current children
- Search

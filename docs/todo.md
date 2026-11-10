# niche-notes — checklist

## V1 core, local — complete 2026-11-09

Built 2026-11-08, polished through 2026-11-09 from Steven's in-app task list: title focus, Enter/Tab to body, + on rows, drag and drop with sibling and child drop lines and a touch grip, ownership labels, persistent undo, live unshare, server-first pushes, trash with Restore, Delete forever, Leave and a 30-day client-side sweep, live carets, snapshot compaction decided by the server, read-only trashed notes, list buttons that act on the cursor's own level, search over everything including the trash, pins, shared notes landing at the top of the recipient's tree, settings for highlight color, appearance and density, a phone header whose dots reveal the action row, and a conflict spec that replays two people shopping offline. Every flow has a Playwright test in `client/e2e` (`npm run e2e` from `client/`); the server has ExUnit tests (`mix test` from `server/`).

Steven keeps the running task list in the app itself, in the note "niche note task list". Read it with `node scripts/note.mjs show "task list"` from `client/` and tick items with `check` when they are done.

## Before the apps

The Android and desktop apps load the web app from the server, so they are useless until the server has an address, and every build bakes that address in.

- [ ] Commit and push what is uncommitted; the build workflows need the repo on GitHub
- [ ] Pick the host and domain for the server and for Pocket ID; everything below takes the URL from one place
- [ ] Deploy once: fill `.env`, register the OIDC client in Pocket ID, `docker compose up -d` behind TLS, sign in as each family member
- [ ] Prove the production login path in a plain browser before any shell: Pocket ID redirect, passkey, cookie session
- [ ] An app icon (one 1024 px square) for the Android mipmaps and the desktop installers

## Apps: local builds first, then the same scripts in Actions

Each target gets one script that runs the same way on a laptop and in CI, so the workflow only calls it.

- [ ] `scripts/build-android.sh`: `./gradlew assembleRelease` inside a Docker image with JDK 17 and the Android SDK, server URL and Pocket ID host passed in, signed with a keystore we generate once and keep as a secret
- [ ] `electron/`: `electron-builder --mac` locally for the dmg; the Windows installer is built on a Windows runner because electron-builder needs Wine to cross-build it from macOS
- [ ] Passkey login inside the Android WebView (`allowNavigation` must include the Pocket ID host) and inside Electron
- [ ] Phone keyboard with the bottom toolbar on a real device
- [ ] GitHub Actions on a tag: the Android script in its container, electron-builder on macOS and Windows runners, artifacts attached to the release
- [ ] Decide on signing: Android keystore yes; macOS notarization only if Steven has an Apple developer account, otherwise right-click to open; Windows unsigned

## Later

- Markdown export
- Share a note with its current children
- Remember the cursor position per note

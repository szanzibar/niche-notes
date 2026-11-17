# niche-notes — checklist

## V1 core, local — complete 2026-11-09

Built 2026-11-08, polished through 2026-11-09 from Steven's in-app task list: title focus, Enter/Tab to body, + on rows, drag and drop with sibling and child drop lines and a touch grip, ownership labels, persistent undo, live unshare, server-first pushes, trash with Restore, Delete forever, Leave and a 30-day client-side sweep, live carets, snapshot compaction decided by the server, read-only trashed notes, list buttons that act on the cursor's own level, search over everything including the trash, pins, shared notes landing at the top of the recipient's tree, settings for highlight color, appearance and density, a phone header whose dots reveal the action row, and a conflict spec that replays two people shopping offline. Every flow has a Playwright test in `client/e2e` (`npm run e2e` from `client/`); the server has ExUnit tests (`mix test` from `server/`).

Steven keeps the running task list in a prod note; CLAUDE.md says how to read it.

## Before the apps

The Android and desktop apps load the web app from the server, so they are useless until the server has an address, and every build bakes that address in.

The server is a home server: a push to `main` makes GitHub Actions publish `ghcr.io/szanzibar/niche-notes:latest`, and the server's directory holds only `docker-compose.yml`, `.env` and `data/`. Watchtower pulls new images on its daily pass, and right away once the publish workflow can reach its update hook; `docker compose pull && docker compose up -d` does it by hand. Caddy terminates TLS for `PHX_HOST` and proxies to the container on 127.0.0.1:4040. An hourly backup snapshots the SQLite file, and the live file is excluded from the offsite sync.

- [x] Caddy entry, backup hook, compose and `.env` on the server (2026-11-10)
- [x] First image published by the Publish Container workflow, package made public, the server pulls it (2026-11-10)
- [x] Pocket ID client registered and the production login proven in a browser: redirect, passkey, cookie session, name arrives in the ID token (2026-11-10)
- [ ] Steven's wife signs in once, so she exists to share with
- [x] Watchtower's update hook behind Caddy at `/watchtower/`, its URL as the repository variable `WATCHTOWER_URL` and its token as the secret `WATCHTOWER_TOKEN`, so a push to `main` deploys within minutes (2026-11-12)
- [x] App icon: `icon/icon.svg` is the vector source and `icon/render.sh` writes the PWA icons, the Android mipmaps and `electron/build/icon.png` (2026-11-10)

## Apps: local builds first, then the same in Actions

Android is a Trusted Web Activity (ADR 002 amendment): Chrome renders the site under our icon, because Pocket ID refuses passkeys from a WebView. `android/build.sh` runs gradle in `ghcr.io/cirruslabs/android-sdk:36`, signed with `android/release.keystore` and `android/keystore.properties`, both outside git. The server publishes the signing certificate's fingerprint from `ANDROID_CERT_SHA256` at `/.well-known/assetlinks.json`; Chrome only drops its address bar once that is live.

- [x] `android/release.keystore` and `android/keystore.properties` backed up in the password manager (2026-11-10)
- [x] APK installs and runs on Steven's phone (2026-11-10)
- [x] On the phone with assetlinks live: no address bar, offline start after the first launch, bottom toolbar with the keyboard (2026-11-10)
- [x] `.github/workflows/android.yml` builds on a push to `main` that touches `android/`, or by hand, and publishes the APK as release `android-<commit count>`
- [x] Secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PROPERTIES` added (2026-11-10)
- [x] First release built and published by the workflow on a push to main (2026-11-10)
- [x] The app downloads a newer release and offers it on the next launch, tested on Steven's phone (2026-11-12)
- [x] Desktop decided 2026-11-10: the installed PWA from Chrome or Edge; Electron removed

## v2: widgets

Several home-screen widgets, each showing a whole note Steven picks, read-only; a tap opens the note in the app. The picker is the tree on `/widget/:id`, where choosing a note hands it to the app through an `intent://` link. The server reads notes with y_ex (ADR 001 amendment, proved on real data 2026-11-10). Android 12 is the minimum.

- [x] Picker hand-off: the tree in pick mode, `WidgetActivity` for adding, reconfiguring and receiving the pick, the widget showing the picked title (2026-11-10)
- [x] Server: y_ex turns a note into title and lines; a widget token from the session; an endpoint a widget reads its note from (2026-11-11)
- [x] The widget shows the whole note as a scrolling list, refreshes every 30 minutes and from a button (2026-11-11)
- [x] ADR 005 for how widgets sign in (2026-11-11)
- [x] Steven tries the widget on his phone: re-pick widgets added before tokens existed, see the lines, refresh, tap to open the note, reconfigure it, and see it offer the picker again once its note is deleted (2026-11-12)
- [x] A widget's header wears its note's color, the picker's All notes shows the tree, and the text and boxes no longer depend on the home screen's fonts (2026-11-15)
- [x] Two kinds of widget, a note and all notes, both 2×3 when added (2026-11-16)
- [x] A widget opens its note in the running app with the keyboard up. Its links are `/?n=<id>`, since Chrome hands a link to the open page only when that page sits under the link's directory, and Chrome raises the keyboard only on a page someone has tapped (2026-11-16)
- [x] A widget raises the keyboard from a closed app too, which is the usual case since back closes the app. Android raises it for an app that comes forward with the cursor in a text, so `RaiseKeyboard` covers the new page for a moment and brings the app forward again (2026-11-16)
- [ ] Calendar links still load a new page, since the calendar starts the app in its own task, so they open without the keyboard
- [x] Widget text keeps its size on every redraw: sizes are dp scaled by the font size setting, since a home screen's first draw read sp as if at the phone's physical density. The bundled font is gone, since a home screen never loads an app's fonts in a widget (2026-11-16)
- [ ] On Samsung with a downloaded system font, some rows of a newly added widget draw in another face until its first refresh; only text drawn into images in the app would avoid it
- [ ] Leaving the app refreshes the widgets, through Chrome's tab-hidden signal to the launcher; untested on the phone, since Android may freeze the app before the signal arrives
- Later: instant refresh through Firebase Cloud Messaging, if 30 minutes and the refresh on leaving feel stale

## v3: dates and alerts

Dates, repeats and a time on checkbox lines, alerts through Web Push (ADR 006), and a Niche Notes calendar in each person's Google account (ADR 007). Google Tasks sync is not wanted.

- [x] Dates, repeats and the date box, the alert pass and the calendar feed, tested in the browser and on the server (2026-11-12)
- [ ] On Steven's phone: an alert arrives at 9:00 for a date-only line and at the time of a timed one, a tap opens the note, Done ticks the line or moves a repeating one, and Snooze 1 hour moves it
- [x] Dates typed into a checkbox line, tested in the browser (2026-11-16)
- [ ] On Steven's phone: a typed date is marked when the keyboard corrects or suggests the word instead of typing it, and it turns into the date when the app is left right after
- [ ] Connect Google Calendar on Steven's phone and his wife's: a Niche Notes calendar appears and follows edits within a minute
- Later: two-way sync, if someone edits events in Google Calendar instead of the note

## Restore

A backup restores by putting it in an empty `data/` and starting the app, which recognizes it and starts a new generation (ADR 010, amended 2026-11-16).

- [ ] Steven runs the README's offline copy on the server with a backup fetched from the off-site copy
- [ ] One restore for real on a spare server, with a phone that holds newer edits than the backup

## Tauri apps

Decided 2026-11-17: the desktop gets a real app for macOS and Windows, a Tauri window on the server that sits in the tray. Android moves onto the same Tauri project if a day on Steven's phone shows it works as well as the TWA, since one toolchain for every app is worth a lot to us. The installed PWA keeps working, and guest links still open in a browser.

The design, which becomes ADR amendments once the spike passes:

- **The window loads `https://<host>`**, baked in at build time like the APK's. The cookie, service worker, IndexedDB and deploy-on-push stay as they are. Bundling the build is out, because a service worker can't register on Tauri's bundled origins on macOS and Android, and our `SameSite=Lax` cookie would not reach the server from one.
- **A passkey can't work in a webview, so the Pocket ID page opens in the default browser.** `/auth/login` still runs in the window, so the window's session holds the OIDC state and Sign out's `select_account` works unchanged. The shell opens every other host in the default browser, which is where the redirect to Pocket ID goes. Pocket ID returns that browser to `/auth/callback`. The browser has no OIDC state, so the callback hands its query to the app as `nichenotes://callback?…`, and the shell loads `/auth/callback?…&app=1` in the window, where the state matches. A link that another app catches is useless to it, since only the window's session can finish the login.
- **The page never calls the shell.** The shell acts on navigation and links only, so the page stays the same web app in every browser and shell. Calls from a remote page with a service worker also fail on Windows after a restart, an open Tauri bug.
- **Alerts come from the tray, over the socket.** Closing the window ends the webview and leaves a small tray process, which starts at login. It holds a channel to the server and counts as one more subscription, so every alert the server sends reaches it as it is sent, a due line and a shared note alike. An alert sent while the computer is off or asleep goes nowhere, since the phone gets it too and nobody wants stale alerts on coming back. A hidden window can't hold the socket instead, because a hidden webview is suspended after about five minutes and Tauri can prevent that only on macOS. Firebase has no desktop client.
- **Updates** come from Tauri's updater, which checks Tauri's own key, so there is no Apple or Microsoft certificate. The Mac build is ad-hoc signed and the Windows installer unsigned. A Mac asks for Open Anyway in System Settings once, Windows shows SmartScreen once, and Smart App Control has to be off.

Server first, since the app signs in through it:

- [x] A callback whose `state` its session never asked for hands its query to `nichenotes://callback`, on a page whose one button opens the app again. With `app=1` it never hands over, so a bad link only reloads the notes. `/auth/google/callback` does the same as `nichenotes://google/callback`, since Google's page opens in the browser too (2026-11-17)
- [x] The session cookie is plain in dev, since WebKit refuses a `Secure` cookie on `http://localhost`. So the suite runs with `--browser=webkit` and a Tauri window can sign in to the dev server (2026-11-17)

Spike, in a scratch directory outside the repo and thrown away, on macOS 27.2 against a local server (2026-11-17):

- [x] Login: the shell cancels the redirect to another host, the window's session still takes the login's state, and a `nichenotes://` link finishes the callback in the window
- [x] Offline: with the server stopped, the app starts with the tree and a note
- [x] Update: an ad-hoc signed build replaces itself from a throwaway release and starts again, with nothing blocking it
- [x] Alert: a notification reaches Notification Center from the tray with the window closed, as a banner once notifications are allowed
- [x] Session: the tray reads the window's session cookie, through a hidden window when the app's own is closed, and gets a token from `/api/me` with it
- [x] Memory: 95 MB with the window open, and 35 MB for the tray two minutes after it closes

The app, in `tauri/`, tested on macOS against a local server and compiled for Windows without ever running there (2026-11-17):

- [x] The window on the server, one instance, remembering its size and place. Other hosts and links that ask for a new window open in the default browser
- [x] `nichenotes://callback` and `nichenotes://google/callback` finish a login in the window. On Windows the link arrives as an argument to a second process
- [x] Closing the window leaves the tray icon and, on a Mac, takes the app out of the Dock. A click on the icon or opening the app again shows the window, the tray's menu has Quit, ⌘Q quits too, and the app starts at login
- [x] A connected tray is one more subscription. It joins `alerts:<user id>` with its time zone, `Push.subscriptions/1` returns it beside the Web Push ones, and `Push.send/2` sends its alert down the socket. `Reminders`, sharing and the other senders stay as they are
- [x] The tray connects with a token from `/api/me`, which it fetches with the window's session cookie, so there is no second credential. It reads the cookie when the app starts and whenever the window loads a page, since signing in and out both load one, so alerts work right after the first login
- [x] The tray reconnects after a sleep or a lost network, and shows each alert as a notification
- [x] Settings hides Alerts on a device without Web Push, since the button there can't turn anything on (2026-11-17)
- [x] `icon/render.sh` writes the Tauri icons too, the Mac's as the rounded square macOS expects and the menu bar's as the three lines alone
- [x] The app updates itself while its window is closed, so it never restarts under someone typing: when it starts at login, when the window closes, and once a day. It starts again in the tray
- [x] `./dev.sh` builds the desktop app as a bundle and starts it on the dev server, since macOS shows an alert under an app's own name only for a bundle. Only `tauri/build.sh` builds `Niche Notes`, with `tauri.release.conf.json`. Every other build is `Niche Notes Dev` with its own identifier, so the two run side by side and a test build never touches what the real app stored. The dev app takes no `nichenotes://` links and never updates itself, so Connect Google Calendar is tried in the browser there (2026-11-17)

Left for Steven, who has the passkey, the eyes and the Windows machine:

- [ ] `tauri/updater.key` goes into the password manager and into the repository as the secret `TAURI_SIGNING_PRIVATE_KEY`, before the push, or the first build fails
- [ ] Login against production: the Pocket ID page opens in the browser, the passkey works there, and the window comes back signed in. After Sign out the next login asks which account
- [ ] A click on an alert's banner opens the window on that line. Without the click reaching the app it only opens the window
- [ ] Typing with autocorrect, dragging a tree row and dragging a list line, also onto a note in the tree, all work in the window
- [ ] On Windows: the app installs and signs in, Settings shows no Alerts, an alert shows from the tray, and an update leaves the app in the tray instead of opening its window

Releases:

- [x] `.github/workflows/desktop.yml` builds on a push to `main` that touches `tauri/`, or by hand, on macOS and Windows runners, with the commit count as the version like the APK. It has never run, since it needs the push
- [x] Every build replaces the files of one `desktop` release, which is made as not the latest, because the Android app looks for its update in `releases/latest`
- [ ] The first run passes on both runners, and `releases/latest` is still the newest APK
- [ ] Steven installs it on the Mac and on Windows, and an update arrives by itself
- Later: an Intel Mac build, if someone has one

WebKit, since the Mac app runs on Safari's engine (2026-11-17):

- [x] The eight flows that failed on WebKit were the tests, not the app. Six pressed Home or End, which scroll the page on a Mac in Safari's engine, so the tests press ⌘ with an arrow there. The link test also left its link with a key just after the toolbar gave the cursor back, which ProseMirror undoes for 200 ms when the cursor lands at the start of the note, so it clicks instead. A line dragged onto a tree note needs one more move over the row before the drop. The tap beside a dated line fails only with a touch screen on Safari's engine, which the Mac app doesn't have
- [x] The four touch tests that drive Chrome DevTools, the tap beside a dated line and the three widget hand-off tests skip on WebKit (`phoneOnly`), and the suite runs on WebKit before a desktop release. There 99 pass and 8 skip, and all 107 pass on Chrome

- [x] Docs: amendments to ADR 002 and ADR 006, the spec's Native and alerts lines, the data model's alerts channel and callback, the README's Apps, and the stack, commands and layout in CLAUDE.md (2026-11-17)

Then Android, a day on Steven's phone with the same Tauri project. It needs a Firebase project from Steven. Android moves to Tauri if all five hold, and stays the TWA otherwise:

- [ ] The bottom toolbar sits above the keyboard
- [ ] Back goes from a note to the tree, then leaves the app
- [ ] Login goes through Chrome and comes back
- [ ] Our widget Java works dropped into the project as it is
- [ ] A Firebase alert arrives with the app closed

- Later: Done and Snooze on a desktop alert, a global shortcut for a new note, a Linux build, and background sync on Android, which a webview of our own makes possible

## Later

- Markdown export

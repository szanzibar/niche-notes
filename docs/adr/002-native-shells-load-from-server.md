# ADR 002: Capacitor on Android, Electron on desktop, both loading the app from the server

Accepted 2026-11-08, replacing the March 2026 version.

The shells load `https://<our host>` instead of bundling the build, because then cookies and the Pocket ID redirect work unchanged and a UI change reaches every device with the next deploy. A service worker caches the shell so the apps start offline after the first launch.

Capacitor for Android because it gives us an APK around the same web build with nothing to rewrite. Plain Electron for macOS and Windows because the shell is one window that loads a URL, and the Capacitor Electron packages are either abandoned or months old. Tauri would be one toolchain for all three but puts Safari's engine under the macOS app while the others run Chromium, and one engine everywhere means one set of quirks.

A PWA alone was rejected because Steven wants real apps from day one.

## Amendment 2026-11-10: Android is a Trusted Web Activity, not a Capacitor WebView

Pocket ID accepts passkeys only from its own web origin. A WebView signs the passkey challenge with the app's origin (`android:apk-key-hash:…`), so Pocket ID rejects every login, and its maintainers closed the request for extra origins as not planned ([pocket-id#1845](https://github.com/pocket-id/pocket-id/issues/1845)). A Trusted Web Activity sidesteps that: Chrome itself renders the server's site full screen under our launcher icon, so passkeys, the cookie session and the service worker are the browser's own. The APK in `android/` is android-browser-helper's `LauncherActivity` plus the icon. `/.well-known/assetlinks.json` on the server names the APK's signing certificate, which is what lets Chrome drop its address bar.

Electron is gone. Its passkey support on macOS needs an Apple-signed app, and the installed PWA from Chrome or Edge already gives a windowed desktop app with passkeys, offline and notifications. The TWA stays as the native shell because v2 wants home-screen widgets, which only native code can provide, and that code will live next to the launcher in `android/`.

## Amendment 2026-11-17: the desktop gets a Tauri app

The desktop gets a real app for macOS and Windows, a Tauri window on the server that stays in the tray, because an installed PWA shows no alerts once it is closed and Tauri can carry the Android app later, which makes one toolchain for every app. The installed PWA keeps working, and guest links still open in a browser. Electron was ruled out again: it has no Web Push either, and its updater needs an Apple-signed app. Safari's engine sits under the Mac app, which is why the e2e suite runs on WebKit before a desktop release.

The window loads `https://<host>`, baked in at build time like the APK's, so the cookie, the service worker, IndexedDB and deploy-on-push stay as they are. Bundling the build is out, because a service worker can't register on Tauri's bundled origins on macOS and Android, and our `SameSite=Lax` cookie would not reach the server from one.

A passkey can't work in a webview, so the Pocket ID page opens in the default browser. `/auth/login` still runs in the window, so the window's session holds the OIDC state and Sign out's `select_account` works unchanged. The shell opens every other host in the default browser, which is where the redirect to Pocket ID goes. Pocket ID returns that browser to `/auth/callback`, whose session never asked for that `state`. So the callback hands its query to the app as `nichenotes://callback?…`, and the shell loads `/auth/callback?…&app=1` in the window, where the state matches. A link that another app catches is useless to it, since only the window's session can finish the login. Google's consent for the calendar goes the same way.

The page never calls the shell. The shell acts on navigation and links only, so the page stays the same web app in every browser and shell. Calls from a remote page with a service worker also fail on Windows after a restart, an open Tauri bug.

Updates come from Tauri's updater, which checks Tauri's own key, so there is no Apple or Microsoft certificate. The Mac build is ad-hoc signed and the Windows installer unsigned. A Mac asks for Open Anyway in System Settings once, Windows shows SmartScreen once, and Smart App Control has to be off. The app updates only while its window is closed, so it never restarts under someone typing. Every build replaces the files of one `desktop` release, so the app finds its update at an address that never changes, and that release is never the latest one, where the Android app looks for its APK.

On macOS 27.2 the app takes 95 MB with its window open. Two minutes after the window closes, WebKit's helpers have gone and the tray is left with 35 MB.

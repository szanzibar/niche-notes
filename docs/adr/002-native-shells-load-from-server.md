# ADR 002: Capacitor on Android, Electron on desktop, both loading the app from the server

Accepted 2026-11-08, replacing the March 2026 version.

The shells load `https://<our host>` instead of bundling the build, because then cookies and the Pocket ID redirect work unchanged and a UI change reaches every device with the next deploy. A service worker caches the shell so the apps start offline after the first launch.

Capacitor for Android because it gives us an APK around the same web build with nothing to rewrite. Plain Electron for macOS and Windows because the shell is one window that loads a URL, and the Capacitor Electron packages are either abandoned or months old. Tauri would be one toolchain for all three but puts Safari's engine under the macOS app while the others run Chromium, and one engine everywhere means one set of quirks.

A PWA alone was rejected because Steven wants real apps from day one.

## Amendment 2026-11-10: Android is a Trusted Web Activity, not a Capacitor WebView

Pocket ID accepts passkeys only from its own web origin. A WebView signs the passkey challenge with the app's origin (`android:apk-key-hash:…`), so Pocket ID rejects every login, and its maintainers closed the request for extra origins as not planned ([pocket-id#1845](https://github.com/pocket-id/pocket-id/issues/1845)). A Trusted Web Activity sidesteps that: Chrome itself renders the server's site full screen under our launcher icon, so passkeys, the cookie session and the service worker are the browser's own. The APK in `android/` is android-browser-helper's `LauncherActivity` plus the icon. `/.well-known/assetlinks.json` on the server names the APK's signing certificate, which is what lets Chrome drop its address bar.

Electron is gone. Its passkey support on macOS needs an Apple-signed app, and the installed PWA from Chrome or Edge already gives a windowed desktop app with passkeys, offline and notifications. The TWA stays as the native shell because v2 wants home-screen widgets, which only native code can provide, and that code will live next to the launcher in `android/`.

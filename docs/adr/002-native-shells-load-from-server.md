# ADR 002: Capacitor on Android, Electron on desktop, both loading the app from the server

Accepted 2026-11-08, replacing the March 2026 version.

The shells load `https://<our host>` instead of bundling the build, because then cookies and the Pocket ID redirect work unchanged and a UI change reaches every device with the next deploy. A service worker caches the shell so the apps start offline after the first launch.

Capacitor for Android because it gives us an APK around the same web build with nothing to rewrite. Plain Electron for macOS and Windows because the shell is one window that loads a URL, and the Capacitor Electron packages are either abandoned or months old. Tauri would be one toolchain for all three but puts Safari's engine under the macOS app while the others run Chromium, and one engine everywhere means one set of quirks.

A PWA alone was rejected because Steven wants real apps from day one.

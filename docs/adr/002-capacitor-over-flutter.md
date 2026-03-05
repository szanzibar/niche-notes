# ADR 002: Capacitor over Flutter / PWA

## Status
Accepted

## Context

Need Android, macOS, and Windows apps from a single codebase, alongside a web app. Requirements:
- True offline-first with reliable local storage
- OS-level local notifications (not PWA Background Sync)
- Wife-friendly WYSIWYG editor
- Real-time collaborative sync via Y.js

Options considered:
1. **PWA** — simplest, but Background Sync unreliable, no native SQLite, limited notification support
2. **Flutter** — excellent native feel, but Y.js is a JS library (incompatible with Dart), WYSIWYG editors in Flutter are immature
3. **React Native** — web is a second-class citizen, painful to share code with a web app
4. **Capacitor** — wraps a React web app in a native container

## Decision

Use **Capacitor 6** to wrap the React app for native platforms.

- Same React/TypeScript codebase runs on web, Android (APK), and desktop (Electron)
- TipTap and Y.js work natively — they run in a WebView inside the Capacitor container
- `@capacitor-community/sqlite` provides reliable on-device SQLite (vs IndexedDB)
- `@capacitor/local-notifications` provides true OS-level alarms (work when app is closed)
- `@capacitor/network` for reliable online/offline detection

## Consequences

- Electron apps are ~100MB — acceptable for a personal app, can swap for Tauri later if needed
- Android APK is sideloaded (no Play Store) — fine for a family app
- The `native/` directory in the client contains thin abstractions over Capacitor plugins so the rest of the app doesn't need to know if it's running in a browser or native container
- Build process: `npm run build` → `npx cap sync` → `npx cap open android` (or electron)

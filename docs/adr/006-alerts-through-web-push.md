# ADR 006: Alerts go through Web Push, and calendars read a feed

Accepted 2026-11-12.

An alert has to arrive while every app is closed, so the server sends it. We use Web Push rather than Firebase Cloud Messaging, because Chrome hands a site's notifications to our Android app, which shows them as its own. That way the server needs no Firebase project or Google account, and the same alerts reach the desktop app. The signing key comes from `SECRET_KEY_BASE`, so there is nothing to set up.

A line's date is wall-clock time, such as `2026-11-14T15:30`, and each device subscribes with its time zone. Each device then alerts at the line's time, or at 9:00 when it has none, in its own zone. The server keeps every dated line in memory, rereads the notes that changed once a minute, and alerts everyone on a note. Ticking a repeating line moves its date on the device, and an alert's Done button works out the next date in the service worker, which shares the app's code, and asks the server to set it. The server reads the rule too, so a repeating line alerts on each of its days until someone ticks it, and one missed day doesn't silence the next. Chrome allows two buttons on a web notification, so an alert has Done and Snooze 1 hour.

Calendars first subscribed to an iCalendar feed. ADR 007 replaced it with events written through the Google Calendar API.

## Amendment 2026-11-17: the desktop app's alerts come over the socket

The desktop app's webviews have no Web Push, and Firebase has no desktop client. So the app joins the `alerts:<user id>` channel with its time zone and counts as one more subscription while it stays connected: every alert the server sends reaches it as it is sent, a due line and a shared note alike. The app holds the socket itself, in Rust, because a hidden webview is suspended after about five minutes and Tauri can prevent that only on macOS. It signs in with the window's session cookie, so there is no second credential.

An alert sent while the computer is off or asleep goes nowhere, since the phone gets it too and nobody wants stale alerts on coming back. A click on a desktop alert opens the note at its line. It has no Done or Snooze yet.

## Amendment 2026-11-18: the Android app on Tauri gets its alerts through Firebase

A webview of our own has no Web Push, so the Android app on Tauri subscribes with its Firebase token, and the server sends its alerts through Firebase Cloud Messaging as the service account in `FIREBASE_SERVICE_ACCOUNT`. The server sends only data and the app draws each alert itself, so every alert shows on its own and a tap opens the note at its line. It has no Done or Snooze yet. The TWA keeps Web Push.

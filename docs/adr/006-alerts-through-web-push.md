# ADR 006: Alerts go through Web Push, and calendars read a feed

Accepted 2026-11-12.

An alert has to arrive while every app is closed, so the server sends it. We use Web Push rather than Firebase Cloud Messaging, because Chrome hands a site's notifications to our Android app, which shows them as its own. That way the server needs no Firebase project or Google account, and the same alerts reach the desktop app. The signing key comes from `SECRET_KEY_BASE`, so there is nothing to set up.

A line's date is wall-clock time, such as `2026-11-14T15:30`, and each device subscribes with its time zone. Each device then alerts at the line's time, or at 9:00 when it has none, in its own zone. The server keeps every dated line in memory, rereads the notes that changed once a minute, and alerts everyone on a note. Repeats live only on the device: ticking a repeating line moves its date there, and an alert's Done button works out the next date in the service worker, which shares the app's code, and asks the server to set it. Chrome allows two buttons on a web notification, so an alert has Done and Snooze 1 hour.

Calendars subscribe to a private address that serves every dated line as an iCalendar feed, with no Google sign-in. Google refreshes a subscribed calendar about once a day, and its Android app can't subscribe at all, so Settings opens Google Calendar's page for adding it. If that turns out too slow, writing events through the Google Calendar API is the next step up. The address carries a token that never expires, for the same reasons as a widget's (ADR 005).

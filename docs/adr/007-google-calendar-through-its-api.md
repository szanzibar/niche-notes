# ADR 007: Each person's dated lines go to a Niche Notes calendar in their Google account

Accepted 2026-11-13. Replaces the calendar feed in ADR 006.

A subscribed feed didn't work for the family. Google refreshes one about once a day, and its Android app can't add one, so each phone needed a browser detour and a hidden Sync switch. Instead, each person connects Google Calendar once from Settings, and the server makes a Niche Notes calendar in their own account. It holds every dated checkbox line they can open, the same set the feed served.

The grant is `calendar.app.created`, which reaches only calendars this app made. Google counts it as non-sensitive, so the consent screen shows no unverified-app warning. The app is published, because a grant from an app in testing expires after a week. The server keeps the refresh token encrypted with `SECRET_KEY_BASE`, since database backups leave the server.

Sync goes one way. Once a minute the server compares each person's dated lines with what it last wrote, and talks to Google only when they differ. It then lists the calendar and adds and deletes events. Each event carries a key made from everything it says, so a changed line is one delete and one add. An edit made in Google Calendar stays until its line changes, so the calendar says edits belong in Niche Notes, and each event links to its line. Two-way sync waits until someone actually edits events in Google.

A timed line lasts half an hour, in the time zone of the device that connected. Events carry no reminders, since the app's own alerts have Done and Snooze.

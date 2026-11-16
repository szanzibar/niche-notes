# Data model

SQLite, one file. The server stores who owns what and a log of Y.js updates. It reads a document only for work no device can do, as one more Y.js client (ADR 001).

## Tables

- **users** — one row per person, created on first Pocket ID login: `id`, `sub` (OIDC subject, unique), `name`, `email`. A guest who came in through a note's link has `sub` `guest:<uuid>` and a generated name (ADR 008).
- **docs** — a Y.js document: `id` (uuid, chosen by the client), `owner_id`, `link` (the token in a note's share link, unique, null while it has none). A user's tree has `id == owner_id` and is created with the user. Every other doc is a note.
- **doc_shares** — `doc_id`, `user_id`, unique together. One row grants full access to one note.
- **push_subscriptions** — one row per device that allowed alerts: `endpoint` (the push service's address, the key), `user_id`, `p256dh`, `auth` and the device's `time_zone`. Every launch writes it again, and a push service that no longer knows the device deletes it.
- **google_calendars** — one row per person who connected Google Calendar: `user_id` (the key), `calendar_id` of the Niche Notes calendar the app made, the Google `email`, the `refresh_token` encrypted with `SECRET_KEY_BASE`, and the `time_zone` of the device that connected, used until a device with alerts on reports one (ADR 007).
- **doc_updates** — `id` (autoincrement, the sequence number), `doc_id`, `update` (Y.js binary), `inserted_at`. One row per edit, until the server folds a doc's rows into one (see the sync protocol).
- **generation** — one row: `id`, the name of this copy of the update log, and `open`, set while the app runs. A database still open at start is a backup or what a crash left, and gets a new `id` (ADR 010).

Access rule, used by every channel join and share endpoint: a user may open a doc if they own it or a share row names them.

## Documents

**Tree doc**, one per user, id = user id.
- `nodes`: Y.Map keyed by note id, value `{ parent: note id | null, order: number, pinned?: boolean, collapsed?: boolean, leftAt?: number }`. `collapsed` hides the row's children on all of the user's devices. `leftAt` is set when the user puts someone else's note in their trash; it only ever touches their own tree. Siblings sort pinned first, then by `order` descending. A new note gets the current time, so it lands on top. A note someone shared gets its node, at the top, from whichever of the user's devices hears of it first, and only once that device's tree has caught up with the server on its current connection. A tree that is behind can't tell a note with no node from one another device placed, and Y.js may keep either of two values written without knowing of each other. A drop keeps the note's pin state and writes only that note, with an order between its new neighbours, since a device that is behind would write back old parents for every sibling it touched. Its group is renumbered only when two orders tie.
- `settings`: Y.Map of per-user preferences, `accent` (a hex color), `theme`, whether search covers the trash (`searchTrash`, unless false) and checked lines (`searchChecked`, only when true), and the length in minutes last picked for a timed line (`duration`). Living in the tree doc, they sync to every device with no server change. Density stays in each device's `localStorage`.

**Note doc**
- `meta`: Y.Map with `title: string`, `deleted: boolean`, `deletedAt: number`, `hideChecked: boolean` and `deleteChecked: boolean`. The app sets one of the last two at a time, and if both are set, delete wins.
- `content`: Y.XmlFragment bound to the TipTap editor. A checkbox line (`taskItem`) carries `checked`, and when it has a date, `due` and maybe `repeat`, and with a time maybe `duration` in minutes. `due` is wall-clock time, `2026-11-14` or `2026-11-14T15:30`, and `repeat` is an iCalendar rule in the shapes the date box writes: `FREQ=WEEKLY;BYDAY=MO,TH`, `FREQ=MONTHLY;BYDAY=1SU,-1SU` or `FREQ=MONTHLY;BYMONTHDAY=15`, and `FREQ=YEARLY`, each with an optional `INTERVAL`. A line's `due` is always one of its rule's days.

Deleting a note sets `deleted`, so it syncs like any edit and vanishes for everyone shared on it, while the owner's placement stays so Restore puts it back where it was. Notes deleted together share one `deletedAt` or `leftAt`, which is how Restore and Delete forever find the rest of them. The rows stay until the owner empties it from the trash or thirty days pass, when the owner's client calls the purge endpoint.

## Sync protocol

Socket at `/socket`, authenticated by the token that `/api/me` returns.

**`doc:<id>` channel**
- Join with `{ since }`. Reply `{ updates: [[seq, base64], ...], seq, owner_id }`: every update after `since`, the last `seq` sent (or `since` if none) and who owns the doc. A doc that does not exist is created, owned by the joiner, unless the joiner is a guest. A doc the joiner cannot access refuses the join.
- Before a join reads the log, the server folds it into one row when it has more than a few dozen rows, or more than one row and no change for a day. The row is a plain merge of the others, stored under the last one's `seq`, so `since` keeps its meaning and nobody re-downloads what they have. Nothing a device sends removes rows (ADR 010).
- Push `update` `{ update: base64 }`. Reply `{ seq }`. The server stores it and broadcasts `update` `{ seq, update }` to the other clients on the topic.
- Push `awareness` `{ update: base64 }` for cursors and names (y-protocols awareness). Relayed to the other clients, never stored.
- A channel checks access when it joins, so the server ends the channel of someone the note is taken away from, by unsharing or by turning its link off.

**`user:<id>` channel**, own id only.
- Join with `{ after }`, the `seq` from the client's last catch-up. Reply `{ changed: [doc id, ...], seq, generation }`: the user's notes with rows after `after`, the newest of those rows (or `after` if none), and the log's generation.
- Push `pull` `{ docs: [[id, since], ...] }`. Reply `{ docs: [[id, owner_id, seq, [[seq, base64], ...]], ...] }`, like a doc join for each note the user can open. Unlike a join, it leaves out notes the user can't open and never creates one.
- The server pushes `changed` `{ doc }` to every member of a note when one of its rows is stored, and `shares_changed` when a share involving the user changes, after which the client refetches `/api/shares`.

**Client side.** One IndexedDB table of updates, each row tagged with its server `seq` once known. On join the client sends the `seq` from its last join reply, applies what comes back, then pushes every row that has no `seq` yet. `since` advances only on a join reply, because that is the only moment the client knows it holds everything up to a number. Live broadcasts are applied but do not advance it, and duplicates are skipped by `seq`. A join reply is applied as one Y.js transaction, so a note opened on a new device appears whole. When its own log of a doc has grown past a few dozen rows, the client folds them into one the same way.

A device remembers the generation it last saw. When a join names another, the server was restored from a backup, which may lack rows the device holds and numbers its new rows from where the backup ended. The device then marks every row unsent, starts every cursor over and reloads, so it sends what the backup lacks and reads the rest again (ADR 010).

A launch loads only the user's tree, and a note loads when it opens and stays for the session. The client keeps a copy of each note's `meta` and plain text in IndexedDB, with its checked lines' text apart, which the tree and search read, so a note that isn't open costs no memory beyond that copy. Notes that aren't open sync by `pull`: the ones a join reply names, then each one a `changed` push names, and a note shared with the user that has no copy yet. A pull folds the note's rows into one and redoes its copy. The cursor `after` advances only once every note a join reply named is pulled, the same way `since` does. A note with rows the server hasn't acknowledged loads at launch, so they go out.

## REST

Cookie session, JSON. The API answers only requests from the app's own pages, by their `Sec-Fetch-Site`, because other sites under the same domain count as the cookie's own site.

- `GET /api/me`
- `GET /api/users` — everyone, for the share picker, with `guest` set for link guests. A guest gets only the owners of the notes they were let into
- `GET /api/shares` — every share on a doc the user owns or is named on: `doc_id`, `user_id`, `owner_id`
- `DELETE /api/docs/:id` — owner only, and only a note the server's own copy has in the trash: removes the doc and its updates and shares for good
- `POST /api/docs/:id/shares` `{ user_id }` — owner only, never the tree doc. Each device of the recipient's with alerts on gets a push saying who shared the note
- `DELETE /api/docs/:id/shares/:user_id` — the owner for anyone, or a recipient for themselves
- `GET`, `PUT`, `DELETE /api/docs/:id/link` — owner only: `{ link }`, creating it on `PUT`. `DELETE` drops the guests it let in
- `GET /s/:link` — signs in a visitor without a session as a new guest, shares the note with whoever opened it, and redirects to the note. 404 once the link is off
- `GET /api/docs/:id/widget_token` — anyone who can open the note: `{ token }` for a widget (ADR 005)
- `GET /api/widget` — no session; the widget token as `Authorization: Bearer`. `{ title, color, ink, rows }`, where `color` and `ink` are the note's header color and its text color for the token's user. For a note, one row per paragraph, heading, list item or table row: `{ line, text, depth }`, with `checked` on a checkbox item and `heading` on a heading. Checked items are left out when the note hides or deletes them, and blank lines stay except at either end. For the user's own tree, one row per note as their tree draws it: `{ line, depth, note }`. 404 once the note is in the trash or no longer shared, 401 for any other token
- `GET /api/push_key` — the public key a device subscribes to alerts with (ADR 006)
- `PUT /api/push_subscriptions` `{ subscription, time_zone }` — this device's push subscription, as the browser gives it
- `PATCH /api/docs/:id/line` `{ due, text, checked: true }` or `{ due, text, move_to }` — an alert's Done or Snooze: changes the first unchecked line with that date and text, and broadcasts the change to the doc's channel. 404 once no line matches
- `GET /api/google_calendar` — `{ email }`, the Google account holding the user's Niche Notes calendar, or `null`
- `DELETE /api/google_calendar` — deletes the Niche Notes calendar and Google's grant
- `GET /auth/google?time_zone=` and `GET /auth/google/callback` — Google's consent, then the Niche Notes calendar is made in that time zone. Both need a session, and a guest's doesn't count
- `GET /auth/login`, `GET /auth/callback`, `DELETE /auth/logout`

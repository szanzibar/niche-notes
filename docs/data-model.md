# Data model

SQLite, one file. The server stores who owns what and a log of Y.js updates. It reads a document only for work no device can do, as one more Y.js client (ADR 001).

## Tables

- **users** — one row per person, created on first Pocket ID login: `id`, `sub` (OIDC subject, unique), `name`, `email`.
- **docs** — a Y.js document: `id` (uuid, chosen by the client), `owner_id`. A user's tree has `id == owner_id` and is created with the user. Every other doc is a note.
- **doc_shares** — `doc_id`, `user_id`, unique together. One row grants full access to one note.
- **doc_updates** — `id` (autoincrement, the sequence number), `doc_id`, `update` (Y.js binary), `inserted_at`. One row per edit, until a client folds a doc's rows into one snapshot (see the sync protocol).

Access rule, used by every channel join and share endpoint: a user may open a doc if they own it or a share row names them.

## Documents

**Tree doc**, one per user, id = user id.
- `nodes`: Y.Map keyed by note id, value `{ parent: note id | null, order: number, pinned?: boolean, leftAt?: number }`. `leftAt` is set when the user puts someone else's note in their trash; it only ever touches their own tree. Siblings sort pinned first, then by `order` descending. A new note gets the current time, so it lands on top. A drop next to a sibling takes that sibling's pin state and renumbers the whole group it lands in, so orders never tie.
- `settings`: Y.Map of per-user preferences, currently `accent` (a hex color). Living in the tree doc, they sync to every device with no server change.

**Note doc**
- `meta`: Y.Map with `title: string`, `deleted: boolean` and `deletedAt: number`.
- `content`: Y.XmlFragment bound to the TipTap editor.

Deleting a note sets `deleted`, so it syncs like any edit and vanishes for everyone shared on it, while the owner's placement stays so Restore puts it back where it was. The rows stay until the owner empties it from the trash or thirty days pass, when the owner's client calls the purge endpoint.

## Sync protocol

Socket at `/socket`, authenticated by the token that `/api/me` returns.

**`doc:<id>` channel**
- Join with `{ since }`. Reply `{ updates: [[seq, base64], ...], seq, owner_id, compact }`: every update after `since`, the last `seq` sent (or `since` if none), who owns the doc, and whether the client should send a snapshot: the doc has more than a few dozen rows, or more than one row and no change for a day. A doc that does not exist is created, owned by the joiner. A doc the joiner cannot access refuses the join.
- Push `update` `{ update: base64 }`. Reply `{ seq }`. The server stores it and broadcasts `update` `{ seq, update }` to the other clients on the topic.
- Push `awareness` `{ update: base64 }` for cursors and names (y-protocols awareness). Relayed to the other clients, never stored.
- Push `snapshot` `{ update: base64, upto }`: the doc's whole state as one update, from a client that holds every row up to `upto`. The server replaces the doc's rows up to `upto` with the snapshot, stored under `upto` itself, so `since` keeps its meaning and nobody re-downloads what they have.

**`user:<id>` channel**, own id only. The server pushes `shares_changed` when a share involving the user changes, and the client refetches `/api/shares`.

**Client side.** One IndexedDB table of updates, each row tagged with its server `seq` once known. On join the client sends the `seq` from its last join reply, applies what comes back, then pushes every row that has no `seq` yet. `since` advances only on a join reply, because that is the only moment the client knows it holds everything up to a number. Live broadcasts are applied but do not advance it, and duplicates are skipped by `seq`. A join reply is applied as one Y.js transaction, so a note opened on a new device appears whole. When the join reply asks for it, or its own local log has grown past a few dozen rows, the client sends a snapshot and folds its own rows the same way.

The client also keeps a copy of each note's `meta` in IndexedDB, so a launch draws the whole tree before any note loads. The notes then load one at a time, so the note on screen waits behind one load at most.

## REST

Cookie session, JSON.

- `GET /api/me`
- `GET /api/users` — everyone, for the share picker
- `GET /api/shares` — every share on a doc the user owns or is named on: `doc_id`, `user_id`, `owner_id`
- `DELETE /api/docs/:id` — owner only, removes the doc and its updates and shares for good
- `POST /api/docs/:id/shares` `{ user_id }` — owner only, never the tree doc
- `DELETE /api/docs/:id/shares/:user_id` — the owner for anyone, or a recipient for themselves
- `GET /auth/login`, `GET /auth/callback`, `DELETE /auth/logout`

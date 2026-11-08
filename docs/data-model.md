# Data model

SQLite, one file. The server stores who owns what and a log of Y.js updates. It never reads a document.

## Tables

- **users** — one row per person, created on first Pocket ID login: `id`, `sub` (OIDC subject, unique), `name`, `email`.
- **docs** — a Y.js document: `id` (uuid, chosen by the client), `owner_id`. A user's tree has `id == owner_id` and is created with the user. Every other doc is a note.
- **doc_shares** — `doc_id`, `user_id`, unique together. One row grants full access to one note.
- **doc_updates** — `id` (autoincrement, the sequence number), `doc_id`, `update` (Y.js binary). Append only. One row per edit batch; compaction is a later feature.

Access rule, used by every channel join and share endpoint: a user may open a doc if they own it or a share row names them.

## Documents

**Tree doc**, one per user, id = user id.
- `nodes`: Y.Map keyed by note id, value `{ parent: note id | null, order: number }`. `order` is the creation time, so newest sorts first.

**Note doc**
- `meta`: Y.Map with `title: string` and `deleted: boolean`.
- `content`: Y.XmlFragment bound to the TipTap editor.

Deleting a note sets `deleted`, so it syncs like any edit and vanishes for everyone shared on it. The rows stay on disk.

## Sync protocol

Socket at `/socket`, authenticated by the session cookie.

**`doc:<id>` channel**
- Join with `{ since }`. Reply `{ updates: [[seq, base64], ...], seq }`: every update after `since`, and the last `seq` sent (or `since` if none). A doc that does not exist is created, owned by the joiner. A doc the joiner cannot access refuses the join.
- Push `update` `{ update: base64 }`. Reply `{ seq }`. The server stores it and broadcasts `update` `{ seq, update }` to the other clients on the topic.

**`user:<id>` channel**, own id only. The server pushes `shares_changed` when a share involving the user changes, and the client refetches `/api/shares`.

**Client side.** One IndexedDB table of updates, each row tagged with its server `seq` once known. On join the client sends the `seq` from its last join reply, applies what comes back, then pushes every row that has no `seq` yet. `since` advances only on a join reply, because that is the only moment the client knows it holds everything up to a number. Live broadcasts are applied but do not advance it, and duplicates are skipped by `seq`.

## REST

Cookie session, JSON.

- `GET /api/me`
- `GET /api/users` — everyone, for the share picker
- `GET /api/shares` — every share on a doc the user owns or is named on: `doc_id`, `user_id`, `owner_id`
- `POST /api/docs/:id/shares` `{ user_id }` — owner only, never the tree doc
- `DELETE /api/docs/:id/shares/:user_id` — owner only
- `GET /auth/login`, `GET /auth/callback`, `DELETE /auth/logout`

# niche-notes — Data Model

## Tables

### users
Synced from Pocket ID on first login. One row per family member.

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| sub | text | UNIQUE — OIDC subject claim from Pocket ID |
| name | text | Display name |
| email | text | Optional, from OIDC claims |
| inserted_at | timestamptz | |
| updated_at | timestamptz | |

### notebooks
Top-level container. Either a "notes" or "tasks" type.

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| title | text | Display name |
| type | text | `"notes"` or `"tasks"` |
| owner_id | uuid | FK → users |
| inserted_at | timestamptz | |
| updated_at | timestamptz | |

### notebook_members
Per-notebook sharing. Owner is NOT in this table — ownership is via `notebooks.owner_id`.

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| notebook_id | uuid | FK → notebooks |
| user_id | uuid | FK → users |
| role | text | `"viewer"` or `"editor"` |
| inserted_at | timestamptz | |

### notes
Rich text notes. Content stored as Y.js CRDT binary state.

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| notebook_id | uuid | FK → notebooks (type must be "notes") |
| title | text | |
| ydoc_state | bytea | Latest Y.js document state (merged binary). Clients merge this with their local state on connect. |
| content_text | text | Plaintext snapshot for search (extracted from Y.js doc on save) |
| inserted_at | timestamptz | |
| updated_at | timestamptz | |

### tasks
Structured tasks in a task notebook.

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| notebook_id | uuid | FK → notebooks (type must be "tasks") |
| title | text | |
| notes | text | Optional description (plain text) |
| completed_at | timestamptz | null = incomplete. Set when user checks off the task. |
| due_at | timestamptz | Optional due date/time |
| rrule | text | RFC 5545 recurrence rule string, e.g. `FREQ=DAILY` or `FREQ=WEEKLY;BYDAY=MO,WE,FR` |
| next_occurrence_at | timestamptz | Precomputed next occurrence date (for sorting/display). Computed client-side using rrule JS library, stored on server. |
| inserted_at | timestamptz | |
| updated_at | timestamptz | |

## Notes on Sync

### Rich notes (Y.js CRDT)
- `ydoc_state` is a binary blob — the merged Y.js document state
- When a client connects to a note's Phoenix Channel, the server sends the current `ydoc_state`
- Client merges server state with its local Y.js doc (Y.js handles conflict resolution)
- When the client makes edits, it sends binary Y.js update deltas to the channel
- Server merges the delta into `ydoc_state` and broadcasts the delta to other clients
- Clients receiving the broadcast apply the delta to their local doc

### Tasks (optimistic + broadcast)
- No CRDT — simpler last-write-wins per field
- Client sends create/update/delete to Phoenix Channel
- Server applies and broadcasts to notebook members
- Offline: mutations queued locally with status `"pending"`, replayed on reconnect in order
- Conflict resolution: `updated_at` timestamp, last writer wins per field

## Indexes

```sql
-- Fast notebook member lookups
CREATE INDEX ON notebook_members (notebook_id);
CREATE INDEX ON notebook_members (user_id);

-- Fast note listing
CREATE INDEX ON notes (notebook_id);

-- Fast task listing, sorted by due date
CREATE INDEX ON tasks (notebook_id);
CREATE INDEX ON tasks (notebook_id, completed_at) WHERE completed_at IS NULL;
CREATE INDEX ON tasks (next_occurrence_at) WHERE next_occurrence_at IS NOT NULL;
```

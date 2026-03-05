# ADR 001: Y.js for offline-first rich note sync

## Status
Accepted

## Context

Rich notes need to be editable offline and sync without data loss when multiple family members edit the same note concurrently (e.g., one person offline on their phone, another online on their laptop).

Options considered:
1. **Last-write-wins** — simplest, but loses concurrent changes
2. **Operational Transforms (OT)** — complex to implement correctly, requires server coordination
3. **Y.js CRDT** — conflict-free by design, works offline natively, integrates with TipTap

## Decision

Use **Y.js** for rich note sync.

- Y.js is a proven CRDT library used in production by Notion, Loom, and others
- Native integration with TipTap via `@tiptap/extension-collaboration`
- `y-indexeddb` provides local persistence — notes load instantly from local storage
- The Phoenix Channel acts as a simple relay: receives binary Y.js update deltas, persists the merged state, broadcasts to other clients
- No CRDT logic needed server-side — Phoenix is just a relay + storage layer
- Automatic conflict resolution — concurrent offline edits merge correctly

## Consequences

- Server stores `ydoc_state` as a binary blob (opaque to the server — fine)
- Full-text search requires extracting plaintext from Y.js doc on save (`content_text` field)
- Y.js updates are binary — the Phoenix Channel sends/receives raw binary frames
- On native (Capacitor), `y-indexeddb` can be replaced with a SQLite-backed provider for more reliable local storage

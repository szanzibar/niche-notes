# niche-notes — Product Spec

## Problem

Replacing Amplenote. Pain points with Amplenote:
- Proprietary freemium — no desire to pay a subscription
- Sync has been delayed and has caused data loss
- Ugly, complex, cumbersome

## Goals

- Offline-first: works without internet, syncs when connection returns
- Real-time collaboration: wife and husband editing the same shopping list at the grocery store on spotty 5G
- Self-hosted: Docker Compose, runs on home server or any VPS
- Wife-approved: usable by a non-technical person, WYSIWYG editor
- Simple: fewer features done well, not more features done poorly

## Users

2-3 family members. No public access. Auth via Pocket ID (self-hosted OIDC with passkeys).

## Platforms

- Web browser (primary development/testing target)
- Android app (Capacitor, sideloaded APK)
- macOS desktop (Capacitor + Electron)
- Windows desktop (Capacitor + Electron)

---

## Features

### Notebooks

Notebooks are the top-level container. Two types:

**Notes notebooks** — contain rich text notes (WYSIWYG).
**Task notebooks** — contain structured tasks.

A notebook can be private (owner only) or shared with specific family members (viewer or editor role).

UI: sidebar list of notebooks, click to open.

### Rich Notes

A note lives inside a Notes notebook. Features:
- WYSIWYG editor (TipTap v2) — bold, italic, headings, bullet lists, numbered lists
- Inline checkboxes (task list items that can be checked/unchecked within the note body)
- Title (first line or explicit title field)
- Created/updated timestamps
- Real-time sync when online (Y.js CRDT — concurrent edits merge automatically)
- Full offline editing — changes sync when connection returns

What a rich note is NOT:
- Not a task tracker (no due dates, no recurrence — use a Task notebook for that)
- No file attachments (v1)

### Task Lists

A Task notebook contains a flat list of tasks. Features:

**Basic tasks:**
- Title
- Optional notes (plain text)
- Completion: tap to complete, completed tasks disappear from the active list
- Can be un-completed (they return)

**Advanced tasks:**
- Due date
- Recurrence rule (RFC 5545 RRULE — daily, weekly, on specific days, custom)
- When a recurring task is completed, the next occurrence is automatically created
- Local OS notifications (scheduled on-device via `@capacitor/local-notifications`)

Task sync:
- Optimistic updates (changes appear immediately in UI)
- Phoenix Channel broadcasts changes to all notebook members in real-time
- Offline: changes queued locally, replayed on reconnect (last-write-wins per task field)

### Sharing

Per-notebook sharing:
- Owner can invite other family members by user account
- Roles: viewer (read-only) or editor (can create/edit/complete tasks and notes)
- Owner can revoke access

### Notifications

- Scheduled entirely on-device — no server involvement
- `@capacitor/local-notifications` schedules OS alarms
- On app open or sync: reschedules notifications for all upcoming tasks
- On task completion: computes next occurrence (if recurring), reschedules
- Works on locked screen, app closed

### Auth

- OIDC via Pocket ID (self-hosted, passkeys only — fingerprint on Android, Touch ID on Mac)
- No passwords in niche-notes itself
- Cookie session after OIDC callback
- Family members get accounts by the admin (owner) registering them in Pocket ID

---

## Out of Scope (v1)

- File attachments
- Images in notes
- CalDAV/iCal sync
- Server-push collaboration notifications ("wife updated your list while you were offline")
- iOS support
- Search (planned for v2)
- Public sharing or link-based access

---

## Non-functional Requirements

- Simplicity: prefer simple code and simple UX over features
- Offline-first: the app must be fully functional without internet
- Self-hosted: no external services required (no Firebase, no AWS, no subscriptions)
- Wife-approved: a non-technical person should be able to use it without explanation

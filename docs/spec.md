# niche-notes — v1 spec

## Problem

Amplenote is a paid subscription, its sync has lost data, and it is cluttered. We want a scratch pad for a family of two or three: pop open a phone, jot a note or a list, find it later, and edit the same shopping list together.

## What v1 does

- **Notes in a tree.** Any note can hold notes. There are no folders and no notebooks. New notes go on top.
- **One editor.** A title field and a body with headings, bold, italic, strikethrough, bullet lists, numbered lists and checkbox lists. A checked item is crossed out. A tap toolbar does all of this on every platform, and markdown shortcuts work too (`- `, `1. `, `[] `, `# `).
- **Private by default.** A note is visible only to its owner until the owner shares it with a specific person. Sharing grants full edit access to that note only, not to its children.
- **Your tree is yours.** Sharing a note does not move it. The other person sees it under "Shared with me" and can place it anywhere in their own tree.
- **Offline first.** Everything except sharing works without a connection: create, edit, move and delete, including notes shared with you. Changes merge when the connection returns.
- **Real time.** Two people editing one note see each other's keystrokes.
- **Native.** An Android app, macOS and Windows apps, and the web app, all loading the same build from the server.
- **Self-hosted.** One Docker container and one SQLite file. Login through Pocket ID passkeys. A person can be shared with once they have logged in.

## Not in v1

Markdown export, sharing a note with its children, reordering notes by hand, drag and drop, search, images and attachments, iOS, view-only sharing, a trash view, storage compaction.

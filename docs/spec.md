# niche-notes — v1 spec

## Problem

Amplenote is a paid subscription, its sync has lost data, and it is cluttered. We want a scratch pad for a family of two or three: pop open a phone, jot a note or a list, find it later, and edit the same shopping list together.

## What v1 does

- **Notes in a tree.** Any note can hold notes. There are no folders and no notebooks. New notes go on top. Every row has a + for a note inside it. Drag a note onto the middle of another to nest it, onto its top or bottom edge to sit next to it, or onto the header to bring it back to the top. A line shows where it will land, indented the way it will be. On a touch screen every row has a grip that drags at once; anywhere else a long press does it.
- **Pins.** A pinned note sits above its siblings, at the top level or inside its parent. Pins are ordered among themselves by dragging, and a note dropped among pinned notes is pinned too.
- **Search.** The box at the top of the tree filters as you type, title matches first, then text, each with the words around the hit. Trashed notes are included and marked. Arrow keys and Enter open a result on a keyboard. It works offline, since every note is on the device.
- **One editor.** A title field and a body with headings, bold, italic, strikethrough, bullet lists, numbered lists and checkbox lists. A checked item is crossed out. A tap toolbar does all of this on every platform, and markdown shortcuts work too (`- `, `1. `, `[] `, `# `). Opening a note puts the cursor in it: an empty title first, otherwise the end of the text. Enter or Tab moves from the title into the body. Undo history stays with the note while the app is open.
- **Private by default.** A note is visible only to its owner until the owner shares it with a specific person. Sharing grants full edit access to that note only, not to its children.
- **Your tree is yours.** Sharing a note does not move it. It appears at the top of the other person's tree, under their pins, and they drag it wherever they like. A note someone else owns shows their name wherever it appears, and its header says who shared it instead of offering Share, and a Leave button in place of Delete moves it to their own trash, where Restore brings it back and Leave for good drops the share for them alone. The owner's note is never touched.
- **Offline first.** Everything except sharing works without a connection: create, edit, move and delete, including notes shared with you. Changes merge when the connection returns. A crossed-out cloud in the header says when the server can't be reached.
- **Real time.** Two people editing one note see each other's keystrokes, and each other's cursor with a name on it.
- **Trash, not confirmations.** Delete is one tap. The note goes to a Trash section at the bottom of the tree, where it can be read but not edited, restored, or deleted forever. Anything in the trash for thirty days is deleted for good, by the client the next time it starts, so no server job is involved.
- **Settings.** A highlight color from a palette, light, dark or follow-the-device appearance, and a compact, default or large density. All follow the user to every device.
- **Phone layout.** The note header keeps the title, shows a people icon when the note is shared either way, and the dots reveal the usual action row under the title. The search box always shows a clear button while it has text.
- **Native.** An Android app and the web app, which Chrome and Edge install as a desktop app, all loading the same build from the server.
- **Self-hosted.** One Docker container and one SQLite file. Login through Pocket ID passkeys. A person can be shared with once they have logged in.

## Not in v1

Markdown export, sharing a note with its children, images and attachments, iOS, view-only sharing.

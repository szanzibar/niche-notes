# ADR 001: Y.js for note text and for the tree

Accepted 2026-11-08, replacing the March 2026 version.

Y.js because the shopping list gets edited by two people at once on spotty data, and a CRDT merges that without a server round trip or conflict copies. The server relays and stores binary updates and never reads one, which keeps it to a few hundred lines.

The tree is a Y.Doc too, one per user, so creating, moving and deleting notes works offline. It holds placement only. Titles and text live in each note's own doc, so a shared note has one title for everyone.

Markdown files were rejected as the store because a CRDT cannot be rebuilt from a text file, and file sync merges by line and loses one side. Markdown stays the export format, later.

## Amendment 2026-11-10: the server may read documents

"Never reads one" said more than the decision needed. What we want is local first: every screen works from the device's own copy. Widgets, reminders and calendar sync have to work while every app is closed, so the server reads and edits notes for them with y_ex, the Elixir binding to the Rust port of Y.js. It works like any other client: it loads a note from the update log, and its change goes back into the log and the channel as a normal update. Devices merge it like a collaborator's edit, and nothing in the sync protocol changes. A trial on real data read a TipTap note and ticked an item that the client's Y.js applied cleanly.

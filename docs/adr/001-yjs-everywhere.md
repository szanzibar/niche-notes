# ADR 001: Y.js for note text and for the tree

Accepted 2026-11-08, replacing the March 2026 version.

Y.js because the shopping list gets edited by two people at once on spotty data, and a CRDT merges that without a server round trip or conflict copies. The server relays and stores binary updates and never reads one, which keeps it to a few hundred lines.

The tree is a Y.Doc too, one per user, so creating, moving and deleting notes works offline. It holds placement only. Titles and text live in each note's own doc, so a shared note has one title for everyone.

Markdown files were rejected as the store because a CRDT cannot be rebuilt from a text file, and file sync merges by line and loses one side. Markdown stays the export format, later.

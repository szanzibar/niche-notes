# ADR 004: Sharing a note shares its content, never its place in a tree

Accepted 2026-11-08.

A note has content, which can be shared, and a placement in each person's tree, which is private. Sharing adds one row on the server and changes nobody's tree. The recipient's own client drops the note at the top of their tree, and they move it wherever they like. This is how Drive treats a shared file, and it is what Steven described wanting: keep my organization, let her keep hers.

Sharing a note with its children was dropped from v1 because it forces a shared tree, and a shared tree needs conflict rules, server knowledge of structure and online-only moves. Single-note sharing needs none of that. If folder sharing is wanted later, the small version is "also share the current children", a loop over single shares.

Only the owner shares and deletes. Everyone shared on a note edits it. No view-only role.

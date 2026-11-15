# ADR 009: A note loads when it opens

Accepted 2026-11-15.

A note loads into memory, with its own channel, only when someone opens it, because years of notes reach about 10,000 and loading them all doesn't fit on a phone. Measured with every note loaded at launch, 1,000 notes took 45 seconds to sync on a new device and held about 100 MB, about 0.1 MB a note. 3,000 notes took 11 minutes and 310 MB. An opened note stays loaded until the app closes, so its undo history lasts the session.

The tree and search read a copy of each note's meta and plain text that the client keeps in IndexedDB. Notes that aren't open keep that copy current through the user's channel. Its join names the notes that changed since a cursor, and the server pings the channel whenever a row lands in any of the user's notes. The client pulls those rows in batches and folds each note's log into one row. Asking the server which notes changed after one update id takes 6 ms for 3,000 notes from nothing, and well under a millisecond after a normal reconnect.

Polling every few minutes would be simpler, but a shared shopping list would then lag on the other phone. A ping costs one broadcast per member for each stored row.

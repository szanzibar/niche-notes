# ADR 008: A note's link signs its visitor in as a guest

Accepted 2026-11-14.

A note can have a link that lets anyone edit it without an account, mostly from a phone's browser. Opening the link signs the visitor in as a guest: a user whose `sub` is `guest:<uuid>`, named like "Teal Otter", with the note shared to them. So a guest gets the whole app, including live edits, cursors and offline, with no second way into a note to build or secure. A generated name means nobody types one before they can start.

The link is a random token in `docs.link`. Turning it off clears the token and drops the shares of the guests it let in, so they lose the note at once. Someone with an account who opened it keeps the note, since the owner can see and unshare them by name.

Anyone holding the link can edit until it is turned off, and turning it on again makes a new one. A guest's session lasts a year like anyone's, and a guest who signs out can't get back in without the link. Guest accounts stay in `users` for good, which at our size is a few rows a year.

## Amendment 2026-11-15: a guest has that note and nothing else

"The whole app" gave a guest more than a link is meant to: everyone's names, notes of their own without limit, and sharing those into our trees, all still theirs after the link was turned off. A guest now opens only the notes a link let them into, plus their own tree, which holds where those notes sit. They are told only who owns those notes, they create and import nothing, and they connect no calendar. Live edits, cursors, alerts and offline work as before.

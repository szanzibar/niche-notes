# ADR 008: A note's link signs its visitor in as a guest

Accepted 2026-11-14.

A note can have a link that lets anyone edit it without an account, mostly from a phone's browser. Opening the link signs the visitor in as a guest: a user whose `sub` is `guest:<uuid>`, named like "Teal Otter", with the note shared to them. So a guest gets the whole app, including live edits, cursors and offline, with no second way into a note to build or secure. A generated name means nobody types one before they can start.

The link is a random token in `docs.link`. Turning it off clears the token and drops the shares of the guests it let in, so they lose the note at once. Someone with an account who opened it keeps the note, since the owner can see and unshare them by name.

Anyone holding the link can edit until it is turned off, and turning it on again makes a new one. A guest's session lasts a year like anyone's, and a guest who signs out can't get back in without the link. Guest accounts stay in `users` for good, which at our size is a few rows a year.

# ADR 010: A restored server starts a new generation, and devices send their notes again

Accepted 2026-11-15.

A backup is older than what the devices hold. A device asks for the rows after the last number it saw, and sends only rows the server never acknowledged. After a restore it would miss new rows stored under numbers it has already seen, and keep to itself whatever the backup lacks. So the log has a name, its generation, which each device remembers. `restore.sh` gives the restored log a new one. A device that sees it change marks every row unsent, starts its cursors over and reloads. Y.js merges what the server already has, so the server ends up with everything any device held, and the backup's age costs nothing a device still holds.

The server folds its own log, and nothing a device sends removes rows. Devices used to send the folded snapshot, which let a device with an old copy, or anyone signed in, replace the server's rows. The fold is a plain merge of the rows and not the rebuilt document, because rebuilding drops an edit that waits on a row the log lacks, which is the state a restore leaves. On a copy of our notes with each note's first row taken out, rebuilding lost data in 46 of 75 notes and the merge in none. The price is that deleted text stays in a note's row.

Emptying the trash needs the server's own copy of the note to be in the trash, since a device with an old copy once purged a live note.

Known and accepted: the launch after a restore loads every note at once, which ADR 009 measured at 45 seconds for 1,000 notes. Sharing lives only on the server, so shares, links and people added since the backup are gone. A note that was both made and shared since the backup belongs to whoever's device reconnects first.

## Amendment 2026-11-16: the app recognizes a backup by itself

`restore.sh` is gone, because the tool for a crisis has to be simpler than a script. The app marks its database open while it runs and clears the mark when it stops. A database still marked at start is a backup taken while the app ran, or what a crash left, and it gets the new generation with no step from us. Restoring is putting the snapshot in an empty `data/` and starting the app.

A crash looks the same as a restore, so after one every device sends its notes again. That costs a slow launch and loses nothing. Known and accepted: a copy made while the app is stopped carries no mark. Our hourly snapshot only meets that in the seconds a deploy takes, and the README says how to mark such a copy by hand.

A database from before the mark starts out marked, so older backups restore the same way. The first start on this version therefore renames the live log once.

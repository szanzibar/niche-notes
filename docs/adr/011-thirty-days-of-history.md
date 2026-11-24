# ADR 011: The server keeps thirty days of each note's versions

Accepted 2026-11-24.

A note keeps a version for each 10 minutes of the last 30 days, because an edit synced from another phone or another person is on every device at once, and so is a mistake. History in the note's menu shows them, and Restore writes one back.

The versions live in the update log instead of a separate history table, because the log already holds each edit once. The fold keeps every row from the last 20 minutes, merges rows up to 30 days old into one row per 10 minutes of their `inserted_at`, and merges older rows into one. A merged row keeps its last row's id, so `since` keeps its meaning, and its newest row's time, so folding it again leaves it in the same 10 minutes. The merge is still the plain one ADR 010 explains. A join folds only when one query finds 10 minutes holding more than one row. On a copy of the dev log, the first fold took 14,883 rows to 6,650 and changed no note's contents, and 8,700 joins with nothing to fold took 1.6 seconds in all.

An active note keeps at most 6 rows an hour plus the last 20 minutes of keystrokes, about 500 rows for a month of 3 hours a day.

The client builds each version itself, as the merge of the rows up to it, because the endpoint then sends the log once and moving between versions needs no request. Restore is an ordinary edit, so it syncs, works on a shared note and becomes a version itself.

Known and accepted: history starts at this deploy, since the old fold had already merged everything before it into one row per note. Rows don't record who made them, so History shows when and not who. History needs a connection.

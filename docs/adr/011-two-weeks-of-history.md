# ADR 011: The server keeps two weeks of each note's versions, finer the newer they are

Accepted 2026-11-24.

A note keeps versions thinning with age, because a big mistake gets noticed and restored within minutes, and later the point is only getting back a major revision or the text before a select-all-and-replace. Backups cover a catastrophe. By a row's age, the fold keeps one row per minute for 20 minutes, per 10 minutes to a day, per hour to two days and per UTC day to two weeks, and merges anything older into one row. History in the note's menu shows them, and Restore writes one back.

The versions live in the update log instead of a separate history table, because the log already holds each edit once. A merged row keeps its last row's id, so `since` keeps its meaning, and its newest row's time, so folding it again leaves it in its bucket. Each bucket is named by its size and its index, so a minute and the 10 minutes starting at the same time stay apart. The merge is still the plain one ADR 010 explains. A join folds only when one query finds a bucket holding more than one row.

An active note keeps at most about 20 + 144 + 24 + 12 + 1 ≈ 200 rows, and typically far fewer.

The client builds each version itself, as the merge of the rows up to it, because the endpoint then sends the log once and moving between versions needs no request. Restore is an ordinary edit, so it syncs, works on a shared note and becomes a version itself.

Known and accepted: history starts at this deploy, since the old fold had already merged everything before it into one row per note. A note not opened for two weeks has no history, since its next join folds everything older into one row. Days are UTC days, so a day's version can end in the evening. Rows don't record who made them, so History shows when and not who. History needs a connection.

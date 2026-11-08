# ADR 003: SQLite instead of Postgres

Accepted 2026-11-08.

SQLite because one Phoenix node writes a few megabytes of updates for three people, and a home server backup should be one file. Postgres earns its container with concurrent writers or big tables, and we have neither. Phoenix supports SQLite out of the box.

Backup is `sqlite3 .backup` on a schedule, or Litestream for continuous off-site copies.

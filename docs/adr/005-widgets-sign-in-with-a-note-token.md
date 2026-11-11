# ADR 005: A widget signs in with a token for one note

Accepted 2026-11-11.

A widget reads its note from the server, because the notes on a phone live in Chrome's storage, which our app cannot read, and a widget cannot run the web app. The widget has no session of its own, so when you pick a note, the web app asks the server for a token and hands it over with the pick.

The token is the user and the note, signed with `SECRET_KEY_BASE`. Every read checks that the user can still open the note and that it is not in the trash, so unsharing or deleting cuts a widget off at once. That is why the token never expires: an expiring one would only blank widgets until their note was picked again.

A leaked token reads one note, read-only, for as long as its user can. The server keeps no list of tokens, so one cannot be cancelled alone. Changing `SECRET_KEY_BASE` cancels them all and signs everyone out. For a family on their own phones that is enough.

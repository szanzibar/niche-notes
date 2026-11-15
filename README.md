# niche-notes

A self-hosted, offline-first notes app for a family. One Docker container, one SQLite file, Pocket ID login. See [docs/spec.md](docs/spec.md) for what it does and [docs/adr/](docs/adr/) for why.

## Run it

```bash
cp .env.example .env     # fill in the values
mkdir data               # the container runs as uid 1000 and needs to own it
docker compose up -d     # serves on 127.0.0.1:$PORT, put a TLS proxy in front
```

The image is published by GitHub Actions on every push to `main`. The database is `data/niche_notes.db`,
owned by your user, so any SQLite backup tool on the host can snapshot it.

In Pocket ID, register an OIDC client with redirect URI `https://<PHX_HOST>/auth/callback`.

## Back up and restore

Back up three things: `.env`, `docker-compose.yml`, and a snapshot of `data/niche_notes.db` taken with SQLite's
own backup, such as `sqlite3 data/niche_notes.db ".backup copy.db"`. A plain copy of the live file may not
restore. `SECRET_KEY_BASE` in `.env` signs every session, so with the same `.env` and address nobody signs in
again. Logins also need your Pocket ID, which has its own data to back up.

To restore, put `docker-compose.yml`, `.env` and [restore.sh](restore.sh) in one directory on a server with Docker
and curl, then run:

```bash
./restore.sh nichenotes.db          # or a .db.gz
```

It checks the backup, moves a database that is already there to `data/before-restore-<time>/`, and starts the
app. Each device then sends whatever the backup lacks the next time it opens the app, so nothing a device still
holds is lost ([ADR 010](docs/adr/010-a-restore-starts-a-new-generation.md)). Shares and links made after the
backup are on no device, so they have to be made again.

To try a backup while the app keeps running:

```bash
./restore.sh --test nichenotes.db
```

The copy runs beside the app on a Docker network with no way out, so it sends no alerts, writes to no calendar
and signs nobody in. The script prints each person's note count and the notes edited last, and says how to open a
note that has a link. To look at another note, give it a link in the copy first, with the id from the note's
address:

```bash
docker compose -p nichenotes-restore-test -f docker-compose.yml -f restore-test/compose.yml \
  exec app sqlite3 /data/niche_notes.db "update docs set link = 'look' where id = '<id>'"
```

Then open `/s/look` on the copy.

## Develop

```bash
./dev.sh                 # Phoenix :4000 + Vite :5173
cd server && mix test
cd client && npm run build   # writes into server/priv/static
```

Dev sign-in needs no Pocket ID: `/auth/login` signs you in, `/auth/login?as=wife` signs in a second user.

## Apps

- **Android.** A Trusted Web Activity: Chrome renders the server's app under the launcher icon, which is the
  only way Pocket ID passkeys work in an Android app. `android/build.sh` builds the signed APK inside the Android
  SDK Docker image, for the server in `.env`'s `PHX_HOST` and with `ANDROID_APP_ID` as its id. The server's `.env`
  also needs `ANDROID_CERT_SHA256`, the signing key's fingerprint, so Chrome opens the site without an address
  bar. A push to `main` that touches `android/` publishes the signed APK as a GitHub release, using the keystore
  from two repository secrets and `PHX_HOST` and `ANDROID_APP_ID` from repository variables. Installed apps
  download a newer release by themselves and offer it on their next launch. The first update asks to allow
  installing unknown apps.
- **Desktop.** Open the site in Chrome or Edge and choose Install. Passkeys, offline and notifications work there
  as in the browser.

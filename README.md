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

Back up three things: `.env`, `docker-compose.yml`, and a snapshot of `data/niche_notes.db` taken while the app
runs, with SQLite's own backup, such as `sqlite3 data/niche_notes.db ".backup copy.db"`. A plain copy of the
live file may not restore. `SECRET_KEY_BASE` in `.env` signs every session, so with the same `.env` and address
nobody signs in again. Logins also need your Pocket ID, which has its own data to back up.

To restore, give the app an empty `data/` with the snapshot in it:

```bash
docker compose down
mv data data.old                                      # skip on a new server
mkdir data && cp nichenotes.db data/niche_notes.db    # owned by uid 1000, like the container
docker compose up -d
```

Never copy a snapshot over a database that is there, because SQLite would apply the old one's leftover `-wal`
file to it.

The app sees that it didn't close this database itself and tells every device to send its notes again, so
nothing a device still holds is lost ([ADR 010](docs/adr/010-a-restore-starts-a-new-generation.md)).
`docker compose logs app` says so, with each person's note count and the notes edited last. Shares and links made
after the backup are on no device, so they have to be made again. A copy made while the app was stopped doesn't
look like a backup to the app, so mark it before the start:
`sqlite3 data/niche_notes.db "update generation set open = 1"`.

To look at a backup while the app keeps running:

```bash
mkdir restore-test && cp nichenotes.db restore-test/niche_notes.db
docker compose -p restore-test -f docker-compose.yml -f docker-compose.restore-test.yml up -d
docker compose -p restore-test logs app               # what the backup holds
```

The copy has no way out of its network, so it sends no alerts, writes to no calendar and signs nobody in. A note
that has a link still opens: tunnel to port 4000 of the address that
`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' restore-test-app-1` prints, and
open `/s/<link>` on `localhost` there. Delete the copy with the same `docker compose` flags and `down`, then
`rm -r restore-test`.

## Develop

```bash
./dev.sh                 # Phoenix :4100 + Vite :5173 + the desktop app, which needs cargo install tauri-cli
cd server && mix test
cd client && npm run build   # writes into server/priv/static
```

Dev sign-in needs no Pocket ID: `/auth/login` signs you in, `/auth/login?as=wife` signs in a second user.

The desktop app that `./dev.sh` builds and starts is `Niche Notes Dev`, with its own identifier, so it runs beside
the installed app.

`pwsh ./private-files.ps1 save` zips what git leaves out, such as `.env`, the signing keys and the dev database, and
`restore` puts it in place in another clone.

## Apps

- **Android.** The Tauri project's Android app: the site in its own window, with widgets, and alerts through
  Firebase. Login opens Pocket ID in the default browser, as on the desktop. `tauri/android.sh` builds the APK
  inside a Docker image with the Android SDK, for the server in `.env`'s `PHX_HOST` and with `ANDROID_APP_ID` as
  its id. It needs Firebase's `google-services.json` in `tauri/gen/android/app`, and it is signed with
  `tauri/gen/android/keystore.properties` when that is there. A push to `main` that touches `tauri/` publishes the
  signed APK as a GitHub release, using the keystore and Firebase settings from three repository secrets and
  `PHX_HOST` and `ANDROID_APP_ID` from repository variables. Installed apps download a newer release by themselves
  and offer it on their next launch. The first update asks to allow installing unknown apps. The server's
  `FIREBASE_SERVICE_ACCOUNT` sends its alerts.
- **Desktop.** A Tauri app for macOS on Apple silicon and for Windows: the site in its own window, which stays in
  the tray for alerts, starts at login and updates itself. Install `niche-notes-mac.dmg` or
  `niche-notes-windows-setup.exe` from the repository's `desktop` release. Neither carries a paid certificate, so
  a Mac asks for Open Anyway in System Settings once, and Windows shows SmartScreen once and needs Smart App
  Control off. Login opens Pocket ID in the default browser, since a passkey can't work in the app's window. A
  push to `main` that touches `tauri/` builds both for the `PHX_HOST` repository variable and publishes them,
  signed for updates with the `TAURI_SIGNING_PRIVATE_KEY` secret. `tauri/build.sh` builds the same on the machine
  it runs on, with the key in `tauri/updater.key`. Keep that key safe, because an installed app only takes
  updates signed with it.
- **Web.** Chrome and Edge also install the site as an app. Passkeys, offline and notifications work there as in
  the browser.

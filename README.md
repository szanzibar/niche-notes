# niche-notes

A self-hosted, offline-first notes app for a family. One Docker container, one SQLite file, Pocket ID login. See [docs/spec.md](docs/spec.md) for what it does and [docs/adr/](docs/adr/) for why.

## Run it

```bash
cp .env.example .env     # fill in the values
docker compose up -d     # serves on :4000, put a TLS proxy in front
```

Data lives in the `data` volume as `/data/niche_notes.db`. Back it up with
`docker compose exec app sqlite3 /data/niche_notes.db ".backup /data/backup.db"` and copy the file out,
or run Litestream against the same path.

In Pocket ID, register an OIDC client with redirect URI `https://<PHX_HOST>/auth/callback`.

## Develop

```bash
./dev.sh                 # Phoenix :4000 + Vite :5173
cd server && mix test
cd client && npm run build   # writes into server/priv/static
```

Dev sign-in needs no Pocket ID: `/auth/login` signs you in, `/auth/login?as=wife` signs in a second user.

## Apps

All three shells load the app from your server, so a deploy updates every device.

- **Android.** Edit `url` and `allowNavigation` in `client/capacitor.config.ts`, then
  `cd client && npm run build && npx cap sync && npx cap open android` and build the APK in Android Studio.
- **macOS and Windows.** Edit `electron/config.json`, then `cd electron && npm install && npm run build:mac` or `npm run build:win`.
  Installers land in `electron/dist/`.

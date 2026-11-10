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

## Develop

```bash
./dev.sh                 # Phoenix :4000 + Vite :5173
cd server && mix test
cd client && npm run build   # writes into server/priv/static
```

Dev sign-in needs no Pocket ID: `/auth/login` signs you in, `/auth/login?as=wife` signs in a second user.

## Apps

All three shells load the app from your server, so a deploy updates every device.

- **Android.** A Trusted Web Activity: Chrome renders the server's app under the launcher icon, which is the
  only way Pocket ID passkeys work in an Android app. `android/build.sh` builds the signed APK inside the Android
  SDK Docker image. Put the signing certificate's SHA-256 into `client/public/.well-known/assetlinks.json` and
  the server URL into `android/app/src/main/AndroidManifest.xml`.
- **macOS and Windows.** Edit `electron/config.json`, then `cd electron && npm install && npm run build:mac` or `npm run build:win`.
  Installers land in `electron/dist/`.

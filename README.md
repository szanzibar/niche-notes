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

- **Android.** A Trusted Web Activity: Chrome renders the server's app under the launcher icon, which is the
  only way Pocket ID passkeys work in an Android app. `android/build.sh` builds the signed APK inside the Android
  SDK Docker image, for the server in `.env`'s `PHX_HOST` and with `ANDROID_APP_ID` as its id. The server's `.env`
  also needs `ANDROID_CERT_SHA256`, the signing key's fingerprint, so Chrome opens the site without an address
  bar. A push to `main` that touches `android/` publishes the signed APK as a GitHub release, using the keystore
  from two repository secrets and `PHX_HOST` and `ANDROID_APP_ID` from repository variables.
- **Desktop.** Open the site in Chrome or Edge and choose Install. Passkeys, offline and notifications work there
  as in the browser.

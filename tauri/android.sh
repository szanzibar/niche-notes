#!/bin/sh
# Builds the Android app inside the toolchain image, so nothing Android gets installed on the machine, with the
# commit count as its version. With ANDROID_APP_ID from .env it is the real app, which updates itself from this
# repository's releases. Pass --debug for a debug build.
# Alerts need Firebase's google-services.json for the app, from the Firebase console, in gen/android/app, and a
# release is signed with gen/android/keystore.properties when it is there. Both stay out of git.
# Output: gen/android/app/build/outputs/apk
set -eu
cd "$(dirname "$0")"
: "${PHX_HOST:=$(grep '^PHX_HOST=' ../.env | cut -d= -f2-)}"
: "${PHX_HOST:?set PHX_HOST in .env}"
: "${ANDROID_APP_ID:=$(grep '^ANDROID_APP_ID=' ../.env 2>/dev/null | cut -d= -f2-)}"
: "${GITHUB_REPOSITORY:=$(git remote get-url origin | sed -E 's#.*github.com[:/]##; s#\.git$##')}"
count=$(git rev-list --count HEAD)
# Logins come back as nichenotes:// links, and widgets open the server's pages.
links='[{"scheme":["nichenotes"],"host":"callback"},{"scheme":["nichenotes"],"host":"google"},'"{\"scheme\":[\"https\"],\"host\":\"$PHX_HOST\"}]"
config="{\"version\":\"$count.0.0\",\"bundle\":{\"android\":{\"versionCode\":$count,\"minSdkVersion\":31}},\"plugins\":{\"deep-link\":{\"mobile\":$links}}}"
[ -n "${CI:-}" ] || export DOCKER_CONTEXT=desktop-linux
docker build -q --platform linux/amd64 -t nichenotes-tauri-android -f android.Dockerfile . >/dev/null
docker run --rm --platform linux/amd64 -v "$PWD:/project" -w /project \
  -e PHX_HOST="$PHX_HOST" -e ANDROID_APP_ID="$ANDROID_APP_ID" -e GITHUB_REPOSITORY="$GITHUB_REPOSITORY" \
  -v nichenotes-cargo-registry:/root/.cargo/registry -v nichenotes-gradle:/root/.gradle -v nichenotes-android-keys:/root/.android \
  -v nichenotes-tauri-android-target:/target -e CARGO_TARGET_DIR=/target \
  nichenotes-tauri-android cargo tauri android build --ci --apk --target aarch64 \
  --config tauri.release.conf.json --config "$config" "$@"

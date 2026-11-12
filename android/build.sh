#!/bin/sh
# Builds the signed release APK inside the Android SDK image, so nothing Android gets installed on the machine.
# Output: app/build/outputs/apk/release/app-release.apk
set -eu
cd "$(dirname "$0")"
# The server's host and the app's id, from the same .env the server reads.
setting() { grep "^$1=" ../.env | cut -d= -f2-; }
host=$(setting PHX_HOST) app_id=$(setting ANDROID_APP_ID)
: "${host:?set PHX_HOST in .env}" "${app_id:?set ANDROID_APP_ID in .env}"
# amd64 because Google ships aapt2 for x86_64 only; on Apple silicon it runs under Rosetta.
docker run --rm --platform linux/amd64 -v "$PWD:/project" -w /project -v nichenotes-gradle:/root/.gradle \
  -e VERSION="$(git rev-list --count HEAD)" -e PHX_HOST="$host" -e ANDROID_APP_ID="$app_id" \
  ghcr.io/cirruslabs/android-sdk:36 ./gradlew --no-daemon --quiet assembleRelease
ls -la app/build/outputs/apk/release/*.apk

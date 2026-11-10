#!/bin/sh
# Builds the signed release APK inside the Android SDK image, so nothing Android gets installed on the machine.
# Output: app/build/outputs/apk/release/app-release.apk
set -eu
cd "$(dirname "$0")"
# amd64 because Google ships aapt2 for x86_64 only; on Apple silicon it runs under Rosetta.
docker run --rm --platform linux/amd64 -v "$PWD:/project" -w /project -v nichenotes-gradle:/root/.gradle \
  -e VERSION_CODE="$(git rev-list --count HEAD)" -e VERSION_NAME="$(git describe --tags --always)" \
  ghcr.io/cirruslabs/android-sdk:36 ./gradlew --no-daemon --quiet assembleRelease
ls -la app/build/outputs/apk/release/*.apk

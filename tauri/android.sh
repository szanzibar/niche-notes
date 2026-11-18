#!/bin/sh
# Builds the Android app inside the toolchain image, so nothing Android gets installed on the machine, with the
# commit count as its version like the TWA's APK. Pass --debug for a debug build.
# Output: gen/android/app/build/outputs/apk
set -eu
cd "$(dirname "$0")"
: "${PHX_HOST:=$(grep '^PHX_HOST=' ../.env | cut -d= -f2-)}"
: "${PHX_HOST:?set PHX_HOST in .env}"
count=$(git rev-list --count HEAD)
# Logins come back as nichenotes:// links, and widgets open the server's pages.
links='[{"scheme":["nichenotes"],"host":"callback"},{"scheme":["nichenotes"],"host":"google"},'"{\"scheme\":[\"https\"],\"host\":\"$PHX_HOST\",\"appLink\":false}]"
config="{\"version\":\"$count.0.0\",\"bundle\":{\"android\":{\"versionCode\":$count,\"minSdkVersion\":31}},\"plugins\":{\"deep-link\":{\"mobile\":$links}}}"
export DOCKER_CONTEXT=desktop-linux
docker build -q --platform linux/amd64 -t nichenotes-tauri-android -f android.Dockerfile . >/dev/null
docker run --rm --platform linux/amd64 -v "$PWD:/project" -w /project -e PHX_HOST="$PHX_HOST" \
  -v nichenotes-cargo-registry:/root/.cargo/registry -v nichenotes-gradle:/root/.gradle \
  -v nichenotes-tauri-android-target:/target -e CARGO_TARGET_DIR=/target \
  nichenotes-tauri-android cargo tauri android build --ci --apk --target aarch64 \
  --config tauri.release.conf.json --config "$config" "$@"

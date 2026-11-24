#!/bin/sh
# Builds the desktop Dev app for the e2e servers' Vite on :5199 and serves it over WebDriver on :4444, inside the
# toolchain image so nothing gets installed on the machine. `npm run e2e:app` in client starts it.
set -eu
cd "$(dirname "$0")"
docker build -q -t nichenotes-app-e2e - < app-e2e.Dockerfile >/dev/null
# A run that Playwright had to kill leaves its container behind.
docker rm -f nichenotes-app-e2e >/dev/null 2>&1 || true
# The build works on a copy, so it leaves no root-owned files here.
exec docker run --rm --init --name nichenotes-app-e2e --network host -v "$PWD:/src:ro" \
  -v nichenotes-cargo-registry:/root/.cargo/registry -v nichenotes-app-e2e-target:/target -e CARGO_TARGET_DIR=/target \
  -e DISPLAY=:99 nichenotes-app-e2e sh -c 'mkdir /build && tar -C /src --exclude=./target --exclude=./gen -c . |
    tar -C /build -x && cd /build && ORIGIN=http://localhost:5199 cargo build && { Xvfb :99 & } &&
    exec dbus-run-session -- tauri-driver'

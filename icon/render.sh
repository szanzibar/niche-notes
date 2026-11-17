#!/bin/sh
# Renders every icon the web app, Android and the desktop app use from icon.svg. Needs rsvg-convert
# (brew install librsvg) and, for the desktop app, cargo tauri.
set -eu
cd "$(dirname "$0")"
render() { rsvg-convert --export-id "$1" -w "$2" -h "$2" icon.svg -o "$3"; }

render tile 192 ../client/public/icons/icon-192.png
render tile 512 ../client/public/icons/icon-512.png

res=../android/app/src/main/res
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  dir=$res/mipmap-${d%%:*} px=${d##*:}
  render tile "$px" "$dir/ic_launcher.png"
  render round "$px" "$dir/ic_launcher_round.png"
  render foreground $((px * 9 / 4)) "$dir/ic_launcher_foreground.png"
done

# The desktop app. Tauri packs each platform's sizes into one file.
tmp=$(mktemp -d)
render mac 1024 "$tmp/mac.png"
render tile 1024 "$tmp/windows.png"
for platform in mac windows; do cargo tauri icon "$tmp/$platform.png" -o "$tmp/$platform" >/dev/null 2>&1; done
cp "$tmp/mac/icon.icns" "$tmp/mac/icon.png" "$tmp/windows/icon.ico" ../tauri/icons/
render tray 44 ../tauri/icons/tray.png
rm -r "$tmp"

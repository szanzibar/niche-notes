#!/bin/sh
# Renders every icon the web app, Android and Electron use from icon.svg. Needs rsvg-convert (brew install librsvg).
set -eu
cd "$(dirname "$0")"
render() { rsvg-convert --export-id "$1" -w "$2" -h "$2" icon.svg -o "$3"; }

render tile 192 ../client/public/icons/icon-192.png
render tile 512 ../client/public/icons/icon-512.png

res=../client/android/app/src/main/res
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  dir=$res/mipmap-${d%%:*} px=${d##*:}
  render tile "$px" "$dir/ic_launcher.png"
  render round "$px" "$dir/ic_launcher_round.png"
  render foreground $((px * 9 / 4)) "$dir/ic_launcher_foreground.png"
done

mkdir -p ../electron/build
render mac 1024 ../electron/build/icon.png

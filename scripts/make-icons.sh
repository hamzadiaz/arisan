#!/usr/bin/env bash
# Derive favicon, Apple touch and PWA icons from the generated transparent logo.
# Home-screen icons are opaque (iOS fills transparency with black) on espresso #052e27,
# with the logo inside the maskable safe zone.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=public/assets/generated/logo.png
BG="#052e27"
mkdir -p public/icons

magick "$SRC" -trim +repage -resize 64x64 -background none -gravity center -extent 64x64 src/app/icon.png
# Tightly cropped mark for the header (the source has generous padding).
magick "$SRC" -trim +repage -resize 96x96 -background none -gravity center -extent 96x96 public/icons/logo-mark.png
for size in 180 192 512; do
  inner=$((size * 72 / 100))
  magick "$SRC" -trim +repage -resize "${inner}x${inner}" -background "$BG" -gravity center -extent "${size}x${size}" -alpha remove -alpha off "public/icons/icon-${size}.png"
done
mv public/icons/icon-180.png src/app/apple-icon.png
echo "icons written: src/app/icon.png public/icons/logo-mark.png src/app/apple-icon.png public/icons/icon-{192,512}.png"

#!/usr/bin/env bash
# Build assets/banner.gif from scripts/banner/banner.html.
# Uses headless Chrome's --virtual-time-budget for deterministic frame capture,
# then ffmpeg with palettegen for a tight GIF.
#
# Usage:  scripts/banner/build.sh
# Output: assets/banner.gif

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
HTML="$HERE/banner.html"
OUT="$ROOT/assets/banner.gif"
FRAMES_DIR="$HERE/.frames"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
WIDTH=1280
HEIGHT=320
FPS=16
DURATION_MS=5000   # 5 seconds = 80 frames @ 16fps
STEP_MS=$(( 1000 / FPS ))
FRAME_COUNT=$(( DURATION_MS / STEP_MS ))

if [[ ! -x "$CHROME" ]]; then
  echo "ERROR: Chrome not found at $CHROME" >&2; exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg required" >&2; exit 1
fi

rm -rf "$FRAMES_DIR"; mkdir -p "$FRAMES_DIR"

echo "Capturing $FRAME_COUNT frames at ${FPS}fps (${WIDTH}x${HEIGHT})..."
for (( i=0; i<FRAME_COUNT; i++ )); do
  t=$(( (i + 1) * STEP_MS ))
  printf "  frame %03d/%03d (t=%dms)\r" "$((i+1))" "$FRAME_COUNT" "$t"
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --no-sandbox \
    --force-device-scale-factor=1 \
    --window-size=${WIDTH},${HEIGHT} \
    --virtual-time-budget=$t \
    --screenshot="$FRAMES_DIR/frame_$(printf '%04d' $i).png" \
    "file://$HTML" \
    >/dev/null 2>&1
done
echo ""

echo "Encoding GIF with palettegen..."
PALETTE="$FRAMES_DIR/palette.png"
ffmpeg -y -loglevel error \
  -framerate $FPS -i "$FRAMES_DIR/frame_%04d.png" \
  -vf "fps=$FPS,scale=$WIDTH:$HEIGHT:flags=lanczos,palettegen=max_colors=64:stats_mode=full" \
  "$PALETTE"

ffmpeg -y -loglevel error \
  -framerate $FPS -i "$FRAMES_DIR/frame_%04d.png" \
  -i "$PALETTE" \
  -filter_complex "fps=$FPS,scale=$WIDTH:$HEIGHT:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" \
  -loop 0 \
  "$OUT"

# Cleanup
rm -rf "$FRAMES_DIR"

SIZE=$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")
SIZE_KB=$(( SIZE / 1024 ))
echo "Done: $OUT ($SIZE_KB KB)"

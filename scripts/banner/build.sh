#!/usr/bin/env bash
# Build banner.gif (graph-only loop) and social-preview.gif (branded) from
# their respective HTML sources in this directory.
#
# Usage:
#   scripts/banner/build.sh            # builds both
#   scripts/banner/build.sh banner     # builds just banner.gif
#   scripts/banner/build.sh preview    # builds just social-preview.gif
#
# Output: assets/banner.gif, assets/social-preview.gif

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [[ ! -x "$CHROME" ]]; then echo "ERROR: Chrome not found" >&2; exit 1; fi
if ! command -v ffmpeg >/dev/null 2>&1; then echo "ERROR: ffmpeg required" >&2; exit 1; fi

# build_gif <html> <output> <width> <height> <fps> <duration_ms> <max_colors>
build_gif() {
  local html="$1" out="$2" w="$3" h="$4" fps="$5" dur="$6" colors="$7"
  local step=$(( 1000 / fps ))
  local count=$(( dur / step ))
  local fdir; fdir="$(mktemp -d)"

  echo "[$out] Capturing $count frames at ${fps}fps (${w}x${h})..."
  for (( i=0; i<count; i++ )); do
    local t=$(( (i + 1) * step ))
    printf "  frame %03d/%03d (t=%dms)\r" "$((i+1))" "$count" "$t"
    "$CHROME" \
      --headless=new --disable-gpu --hide-scrollbars --no-sandbox \
      --force-device-scale-factor=1 \
      --window-size=${w},${h} \
      --virtual-time-budget=$t \
      --screenshot="$fdir/frame_$(printf '%04d' $i).png" \
      "file://$html" >/dev/null 2>&1
  done
  echo ""

  echo "[$out] Encoding GIF (max-colors=$colors)..."
  local pal="$fdir/palette.png"
  ffmpeg -y -loglevel error \
    -framerate $fps -i "$fdir/frame_%04d.png" \
    -vf "fps=$fps,scale=$w:$h:flags=lanczos,palettegen=max_colors=$colors:stats_mode=full" \
    "$pal"
  ffmpeg -y -loglevel error \
    -framerate $fps -i "$fdir/frame_%04d.png" \
    -i "$pal" \
    -filter_complex "fps=$fps,scale=$w:$h:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" \
    -loop 0 \
    "$out"

  rm -rf "$fdir"
  local size; size=$(stat -f%z "$out" 2>/dev/null || stat -c%s "$out")
  echo "[$out] Done — $(( size / 1024 )) KB"
}

TARGET="${1:-all}"

if [[ "$TARGET" == "all" || "$TARGET" == "banner" ]]; then
  # Graph-only banner: 6s loop, matches CSS animation cycle.
  # 12fps + 48-color palette keeps the file under ~1MB without visible loss
  # for this kind of sparse-points-on-dark-bg content.
  build_gif "$HERE/banner.html" "$ROOT/assets/banner.gif" 1280 320 12 6000 48
fi

if [[ "$TARGET" == "all" || "$TARGET" == "preview" ]]; then
  # Branded social preview: 5s one-shot
  build_gif "$HERE/social-preview.html" "$ROOT/assets/social-preview.gif" 1280 320 16 5000 64
fi

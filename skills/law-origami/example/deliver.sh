#!/bin/zsh
# deliver.sh : everything a finished film ships, from the project root.
#   zsh deliver.sh                  master + web + loop + poster + HTML player
#   WORKERS=4 POSTER_T=18.5 zsh deliver.sh
# Writes (slug = this folder's name, the same name tools/render.cjs uses):
#   exports/<slug>.mp4          master with sound (crf 16)
#   exports/<slug>-web.mp4      crf 23, no audio, +faststart, 1920 wide (and -1280.mp4 if the web file is > 15 MB)
#   exports/<slug>-loop.mp4     the last shot only (the seamless loop bar), no audio
#   exports/<slug>-poster.jpg   one frame from the final card (POSTER_T, default: middle of the last shot)
#   dist/<slug>.html            the self-contained player
set -e
cd "${0:A:h}"
SLUG=${PWD:t}
SLUG=${SLUG// /-}
export FILM_NO_NET=${FILM_NO_NET:-1}
mkdir -p exports dist

zsh tools/q.sh node tools/render.cjs --workers ${WORKERS:-2} --out exports/$SLUG.mp4
node tools/build.cjs

# frame range of the last shot and the poster time, read from src/timeline.js
read N0 N1 PT FPS < <(node -e "
const C = require('./tools/common.cjs');
const t = C.loadTimeline('src/timeline.js');
const fps = C.fps(t);
const s = t.shots[t.shots.length - 1];
const n0 = Math.round(s.start * fps), n1 = Math.round(s.end * fps) - 1;
const pt = process.env.POSTER_T ? Number(process.env.POSTER_T) : (s.start + s.end) / 2;
console.log(n0, n1, pt.toFixed(3), fps);
")

ffmpeg -hide_banner -loglevel error -y -i exports/$SLUG.mp4 -an -c:v libx264 -crf 23 -preset medium \
  -pix_fmt yuv420p -vf scale=1920:-2 -movflags +faststart exports/$SLUG-web.mp4
if [[ $(stat -f%z exports/$SLUG-web.mp4 2>/dev/null || stat -c%s exports/$SLUG-web.mp4) -gt 15000000 ]]; then
  ffmpeg -hide_banner -loglevel error -y -i exports/$SLUG.mp4 -an -c:v libx264 -crf 23 -preset medium \
    -pix_fmt yuv420p -vf scale=1280:-2 -movflags +faststart exports/$SLUG-1280.mp4
fi
ffmpeg -hide_banner -loglevel error -y -i exports/$SLUG.mp4 -an \
  -vf "select='between(n\,$N0\,$N1)',setpts=N/FRAME_RATE/TB" -r $FPS \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart exports/$SLUG-loop.mp4
ffmpeg -hide_banner -loglevel error -y -ss $PT -i exports/$SLUG.mp4 -frames:v 1 -q:v 2 exports/$SLUG-poster.jpg

ffmpeg -hide_banner -nostats -i exports/$SLUG.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -E '^\s+(I|Peak):' || true
ls -la exports dist

#!/bin/zsh
# deliver.sh : the delivery set from the rendered master. Run from anywhere, after `node tools/render.cjs`.
#   exports/<slug>-web.mp4   H.264 crf 23, no audio, +faststart (and <slug>-web-1280.mp4 if the web file > 15 MB)
#   exports/<slug>-loop.mp4  the last bar only (rendered on its own, one encode generation), no audio
#   exports/<slug>-poster.jpg  a fresh full-res still at POSTER_T (default 20.0 s)
#   dist/<slug>.html         the self-contained player
# <slug> is the project folder's name (the same rule tools/render.cjs and tools/build.cjs use).
set -e
cd "$(dirname "$0")/.."
S=$(basename "$PWD" | tr ' ' '-')
M=exports/$S.mp4
[[ -f $M ]] || { echo "no master $M - run: FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs"; exit 1; }
mkdir -p .tmp
ffmpeg -hide_banner -loglevel error -y -i $M -an -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart exports/$S-web.mp4
if [[ $(wc -c < exports/$S-web.mp4) -gt 15000000 ]]; then
  ffmpeg -hide_banner -loglevel error -y -i $M -an -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart exports/$S-web-1280.mp4
fi
# the loop window = the last bar of the timeline (bpm and duration read from src/timeline.js)
LOOP=($(node -e "global.FILM={};global.window=global;require('./src/timeline.js');const t=FILM.TIMELINE,b=240/t.bpm;console.log(t.duration-b,t.duration)"))
FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs --from ${LOOP[1]} --to ${LOOP[2]} --silent --crf 16 --out .tmp/loop-src.mp4 >/dev/null
ffmpeg -hide_banner -loglevel error -y -i .tmp/loop-src.mp4 -an -c:v copy -movflags +faststart exports/$S-loop.mp4
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --times ${POSTER_T:-20.0} --out .tmp/poster.png >/dev/null
ffmpeg -hide_banner -loglevel error -y -i .tmp/poster.png -q:v 2 exports/$S-poster.jpg
FILM_NO_NET=1 node tools/build.cjs >/dev/null
ls -la exports dist

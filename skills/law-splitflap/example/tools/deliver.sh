#!/bin/zsh
# deliver.sh : the delivery list from the rendered master (run after `node tools/render.cjs`).
#   exports/<slug>-web.mp4   no audio, crf 23, faststart, 1920 wide (plus -web-1280.mp4 when > 15 MB)
#   exports/<slug>-loop.mp4  the last bar, rendered on its own, no audio (the seamless loop)
#   exports/<slug>-poster.jpg a fresh full-res still of the settled card at the loop start (POSTER_T overrides)
#   dist/<slug>.html         the self-contained player
# <slug> is the project folder's name, the same name tools/render.cjs gives the master.
set -e
cd "$(dirname "$0")/.."
S=$(basename "$PWD")
M=exports/$S.mp4
[[ -f $M ]] || { echo "no master $M (run: FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs)"; exit 1; }
# the loop bar = the last bar of the timeline
read DUR BAR <<<"$(node -e "global.FILM={};require('vm').runInThisContext(require('fs').readFileSync('src/timeline.js','utf8'));const t=FILM.TIMELINE;console.log(t.duration, 240/t.bpm)")"
FROM=$(node -e "console.log($DUR-$BAR)")
mkdir -p .tmp
ffmpeg -hide_banner -loglevel error -y -i $M -an -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart exports/$S-web.mp4
SZ=$(wc -c < exports/$S-web.mp4 | tr -d ' ')
if (( SZ > 15000000 )); then
  ffmpeg -hide_banner -loglevel error -y -i $M -an -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart exports/$S-web-1280.mp4
fi
# one encode generation for the loop: render the bar alone, then copy its video stream without audio
FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs --from $FROM --to $DUR --silent --crf 16 --out .tmp/loop-src.mp4 >/dev/null
ffmpeg -hide_banner -loglevel error -y -i .tmp/loop-src.mp4 -an -c:v copy -movflags +faststart exports/$S-loop.mp4
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --times ${POSTER_T:-$FROM} --out .tmp/poster.png >/dev/null
ffmpeg -hide_banner -loglevel error -y -i .tmp/poster.png -q:v 2 exports/$S-poster.jpg
FILM_NO_NET=1 node tools/build.cjs >/dev/null
ls -la exports dist

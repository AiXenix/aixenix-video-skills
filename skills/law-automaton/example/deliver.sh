#!/bin/zsh
# deliver.sh : render the master and the delivery set. Run from anywhere; it works in its own folder.
#   exports/<slug>.mp4         master with sound (crf 16)
#   exports/<slug>-web.mp4     crf 23, no sound, +faststart, 1920 wide (+ <slug>-1280.mp4 when > 15 MB)
#   exports/<slug>-loop.mp4    the last shot (the seamless loop bar), no sound
#   exports/<slug>-poster.jpg  one frame (POSTER_AT seconds, default 7.3 = the cam stack)
#   dist/<slug>.html           the self-contained player
# The slug is the folder name. Env: WORKERS (render browsers, default 2), POSTER_AT, FFMPEG.
set -e
cd "${0:A:h}"
SLUG=${PWD:t}
FF=${FFMPEG:-ffmpeg}
export FILM_NO_NET=1
zsh tools/q.sh node tools/render.cjs --workers ${WORKERS:-2}
M=exports/$SLUG.mp4
read LOOP_FROM LOOP_LEN <<< "$(node -e "const C=require('./tools/common.cjs');const t=C.loadTimeline('src/timeline.js');const s=t.shots[t.shots.length-1];console.log(s.start, s.end-s.start)")"
$FF -hide_banner -loglevel error -y -i $M -an -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -movflags +faststart -vf scale=1920:-2 exports/$SLUG-web.mp4
if [[ $(stat -f%z exports/$SLUG-web.mp4 2>/dev/null || stat -c%s exports/$SLUG-web.mp4) -gt 15728640 ]]; then
  $FF -hide_banner -loglevel error -y -i $M -an -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -movflags +faststart -vf scale=1280:-2 exports/$SLUG-1280.mp4
fi
$FF -hide_banner -loglevel error -y -i $M -ss $LOOP_FROM -t $LOOP_LEN -an -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart exports/$SLUG-loop.mp4
$FF -hide_banner -loglevel error -y -ss ${POSTER_AT:-7.3} -i $M -frames:v 1 -q:v 2 exports/$SLUG-poster.jpg
node tools/build.cjs
$FF -hide_banner -i $M -af ebur128=peak=true -f null - 2>&1 | grep -E '^ +I:|Peak:' | tail -2
ls -la exports dist

#!/bin/zsh
# deliver.sh : render the master and every deliverable from the current source.
#   zsh deliver.sh            run from the project root (the folder that holds src/ and tools/)
# Writes exports/<slug>.mp4 (master with sound, crf 16), <slug>-web.mp4 (crf 23, no sound, faststart),
# <slug>-web-1280.mp4, <slug>-loop.mp4 (the last bar, no sound), <slug>-poster.jpg and dist/<slug>.html.
# <slug> is the project folder's name. Needs ffmpeg on PATH (or FFMPEG=/path/to/ffmpeg).
set -e
cd "${0:A:h}"
SLUG=${PWD:t}
FF=${FFMPEG:-ffmpeg}
export FILM_NO_NET=1
# the poster time and the loop start come from the timeline (last bar = loop; poster in its middle)
read FPS DUR BPM <<< "$(node -e "global.FILM={};require('vm').runInNewContext(require('fs').readFileSync('src/timeline.js','utf8'),{FILM:global.FILM});const t=FILM.TIMELINE;console.log(t.fps||24,t.duration,t.bpm)")"
BAR=$(node -e "console.log(240/$BPM)")
LOOP_F=$(node -e "console.log(Math.round(($DUR-$BAR)*$FPS))")
END_F=$(node -e "console.log(Math.round($DUR*$FPS))")
POSTER_T=$(node -e "console.log(($DUR-$BAR/2).toFixed(3))")
mkdir -p exports
zsh tools/q.sh node tools/check.cjs
zsh tools/q.sh node tools/render.cjs --workers 3
$FF -v error -y -i exports/$SLUG.mp4 -an -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart exports/$SLUG-web.mp4
$FF -v error -y -i exports/$SLUG.mp4 -an -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart exports/$SLUG-web-1280.mp4
$FF -v error -y -i exports/$SLUG.mp4 -an -vf "trim=start_frame=$LOOP_F:end_frame=$END_F,setpts=PTS-STARTPTS" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart exports/$SLUG-loop.mp4
zsh tools/q.sh node tools/snap.cjs --times $POSTER_T --out .frames/poster.png
$FF -v error -y -i .frames/poster.png -q:v 2 exports/$SLUG-poster.jpg
node tools/build.cjs
$FF -hide_banner -nostats -i exports/$SLUG.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:" | tail -2
ls -la exports dist

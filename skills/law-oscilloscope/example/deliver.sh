#!/bin/zsh
# deliver.sh : render the master and every delivery file into exports/. Run from anywhere:
#   zsh deliver.sh                 SLUG defaults to the project folder name
#   SLUG=my-ad POSTER_T=20 zsh deliver.sh
# Needs ffmpeg on PATH and tools/node_modules (npm --prefix tools ci; npx --prefix tools playwright install chromium).
set -e
cd "${0:A:h}"
SLUG=${SLUG:-${PWD:t}}
POSTER_T=${POSTER_T:-20.0}   # a frame of the final card
LOOP_FROM=${LOOP_FROM:-616}  # first frame of the last bar (bar 11 of 12, 56 frames per bar at 30 fps)
LOOP_N=${LOOP_N:-56}
export FILM_NO_NET=1
mkdir -p exports .tmp/audio .frames/poster

# 1. master (crf 16) with the engine's 192k audio, then the soundtrack re-muxed at 320k AAC:
#    the audio IS the X-Y picture, a higher bitrate keeps it drawable on a real oscilloscope.
zsh tools/q.sh node tools/render.cjs --workers ${WORKERS:-3} --out exports/$SLUG.mp4
zsh tools/q.sh node tools/audio/render-audio.cjs --out .tmp/audio/score.wav
ffmpeg -hide_banner -loglevel error -y -i exports/$SLUG.mp4 -i .tmp/audio/score.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 320k -ar 48000 -ac 2 -movflags +faststart exports/$SLUG.tmp.mp4
mv exports/$SLUG.tmp.mp4 exports/$SLUG.mp4

# 2. web (crf 23, silent, faststart, 1920 wide; a 1280 copy too when over 15 MB)
ffmpeg -hide_banner -loglevel error -y -i exports/$SLUG.mp4 -an -c:v libx264 -preset medium -crf 23 \
  -pix_fmt yuv420p -vf scale=1920:-2 -movflags +faststart exports/$SLUG-web.mp4
if [[ $(stat -f%z exports/$SLUG-web.mp4 2>/dev/null || stat -c%s exports/$SLUG-web.mp4) -gt 15000000 ]]; then
  ffmpeg -hide_banner -loglevel error -y -i exports/$SLUG.mp4 -an -c:v libx264 -preset medium -crf 23 \
    -pix_fmt yuv420p -vf scale=1280:-2 -movflags +faststart exports/$SLUG-web-1280.mp4
fi

# 3. the seamless last bar (silent)
ffmpeg -hide_banner -loglevel error -y -i exports/$SLUG.mp4 -an \
  -vf "select='between(n\,$LOOP_FROM\,$((LOOP_FROM + LOOP_N - 1)))',setpts=N/30/TB" -r 30 -frames:v $LOOP_N \
  -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -movflags +faststart exports/$SLUG-loop.mp4

# 4. poster and the self-contained HTML player
zsh tools/q.sh node tools/snap.cjs --times $POSTER_T --out .frames/poster/poster.png
ffmpeg -hide_banner -loglevel error -y -i .frames/poster/poster.png -q:v 2 exports/$SLUG-poster.jpg
node tools/build.cjs
ls -la exports dist

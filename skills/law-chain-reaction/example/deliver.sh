#!/bin/zsh
# deliver.sh : render the master and every deliverable of this film from the project root.
#   zsh deliver.sh            (slug = folder name; set SLUG=... to override)
# Writes exports/<slug>.mp4 (master, crf 16, with sound), exports/<slug>-web.mp4 (crf 23, no sound,
# +faststart), exports/<slug>-1280.mp4 (only if the web file is over 15 MB), exports/<slug>-loop.mp4
# (the last bar, no sound), exports/<slug>-poster.jpg and dist/<slug>.html.
# Needs ffmpeg on PATH (or FFMPEG=/path/to/ffmpeg). WORKERS=3 parallel render pages by default.
set -e
cd "$(dirname "$0")"
SLUG=${SLUG:-$(basename "$PWD")}
FF=${FFMPEG:-ffmpeg}
export FILM_NO_NET=1
mkdir -p exports dist
zsh tools/q.sh node tools/check.cjs
zsh tools/q.sh node tools/render.cjs --workers ${WORKERS:-3} --crf 16 --out exports/$SLUG.mp4
$FF -hide_banner -loglevel error -y -i exports/$SLUG.mp4 -an -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -movflags +faststart exports/$SLUG-web.mp4
if [ $(stat -f%z exports/$SLUG-web.mp4 2>/dev/null || stat -c%s exports/$SLUG-web.mp4) -gt 15728640 ]; then
  $FF -hide_banner -loglevel error -y -i exports/$SLUG.mp4 -an -vf scale=1280:-2 -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -movflags +faststart exports/$SLUG-1280.mp4
fi
# the last bar is the seamless loop: frames (duration - bar) * fps .. end
read F0 F1 <<<"$(node -e "global.FILM={};require('./src/timeline.js');const t=FILM.TIMELINE;const fps=t.fps||30,bar=240/t.bpm;console.log(Math.round((t.duration-bar)*fps),Math.round(t.duration*fps)-1)")"
$FF -hide_banner -loglevel error -y -i exports/$SLUG.mp4 -an -vf "select='between(n\,$F0\,$F1)',setpts=N/30/TB" -r 30 -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart exports/$SLUG-loop.mp4
# poster: a frame of the end card (POSTER_T seconds, default 17.6)
$FF -hide_banner -loglevel error -y -ss ${POSTER_T:-17.6} -i exports/$SLUG.mp4 -frames:v 1 -q:v 2 exports/$SLUG-poster.jpg
node tools/build.cjs --out dist/$SLUG.html
$FF -hide_banner -i exports/$SLUG.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -E '^\s+(I|Peak):' || true
echo "delivered: exports/$SLUG{.mp4,-web.mp4,-loop.mp4,-poster.jpg}, dist/$SLUG.html"

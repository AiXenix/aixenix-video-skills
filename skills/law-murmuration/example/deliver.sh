#!/bin/zsh
# deliver.sh : transcodes from the master (run tools/render.cjs first). The slug is the folder name,
# exactly as tools/render.cjs names exports/<slug>.mp4.
#   web      crf 23, no audio, +faststart, 1920 wide (plus a 1280 version when the 1920 one is > 15 MB)
#   loop     the last bar without audio (LOOP_FRAMES, default 80 = one bar at 90 bpm and 30 fps)
#   poster   one frame of the final card (POSTER_T seconds, default 19.4)
set -e
cd "$(dirname "$0")"
S=$(basename "$PWD")
M=exports/$S.mp4
[ -f $M ] || { echo "no $M: run FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs first"; exit 1; }
LOOP_FRAMES=${LOOP_FRAMES:-80}
POSTER_T=${POSTER_T:-19.4}
ffmpeg -y -hide_banner -loglevel error -i $M -an -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -movflags +faststart exports/$S-web.mp4
if [ $(wc -c < exports/$S-web.mp4) -gt 15728640 ]; then
  ffmpeg -y -hide_banner -loglevel error -i $M -an -vf scale=1280:720 -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -movflags +faststart exports/$S-web-1280.mp4
fi
TOTAL=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 $M)
START=$((TOTAL - LOOP_FRAMES))
ffmpeg -y -hide_banner -loglevel error -i $M -an -vf "trim=start_frame=$START:end_frame=$TOTAL,setpts=PTS-STARTPTS" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart exports/$S-loop.mp4
ffmpeg -y -hide_banner -loglevel error -ss $POSTER_T -i $M -frames:v 1 -q:v 2 exports/$S-poster.jpg
ls -la exports

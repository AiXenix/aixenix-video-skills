#!/bin/zsh
# q.sh : run a heavy tool (snap / check / render / render-audio) under a machine-wide semaphore so
# parallel jobs never start more than Q_SLOTS headless Chromium renders at once.
#   zsh tools/q.sh node tools/snap.cjs --times 13.4 --out .frames/hero.png
SLOTS=${Q_SLOTS:-3}
LOCK=${TMPDIR:-/tmp}/procedural-film-q
mkdir -p $LOCK
while true; do
  for i in $(seq 1 $SLOTS); do
    if mkdir $LOCK/slot$i 2>/dev/null; then
      echo $$ > $LOCK/slot$i/pid
      trap "rm -rf $LOCK/slot$i" EXIT INT TERM
      "$@"
      exit $?
    fi
    p=$(cat $LOCK/slot$i/pid 2>/dev/null)
    if [[ -n $p ]] && ! kill -0 $p 2>/dev/null; then rm -rf $LOCK/slot$i; fi
  done
  sleep 3
done

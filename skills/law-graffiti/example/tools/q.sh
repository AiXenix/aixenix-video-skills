#!/bin/zsh
# q.sh : run a heavy tool (snap / check / render / render-audio) under a machine-wide semaphore so parallel
# jobs never start more than Q_SLOTS Chromium renders at once.
#   zsh tools/q.sh node tools/snap.cjs --times 22.5 --scale 0.5
# Q_SLOTS overrides the slot count (default 3). The lock lives in the system temp folder.
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

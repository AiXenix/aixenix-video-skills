#!/bin/zsh
# q.sh : run a heavy tool (snap / check / render / render-audio) under a machine-wide semaphore so parallel
# scene agents never start more than Q_SLOTS (default 3) Chromium renders at once. The lock lives in
# ${TMPDIR:-/tmp}/procedural-film-q, shared by every project on the machine.
#   zsh tools/q.sh node tools/snap.cjs --shot hook --samples 6 --sheet
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

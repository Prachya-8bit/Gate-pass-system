#!/usr/bin/env bash
# Gate Pass → epro sync runner — invoked by cron every 15 minutes.
#
# flock guarantees only one sync runs at a time: if a sync takes longer than
# the 15-minute tick, the next tick is skipped rather than starting a second
# browser that logs into epro concurrently (which would corrupt a work order).
# Runs headless (no window) and appends all output to logs/sync.log.

set -uo pipefail

DIR="/mnt/d/Code/factory-gate-pass-permit/automation"
LOG_DIR="$DIR/logs"
LOG="$LOG_DIR/sync.log"
LOCK="$DIR/state/sync.lock"

mkdir -p "$LOG_DIR" "$DIR/state"

# Non-blocking lock on fd 9 — bail immediately if a run is already in progress.
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date '+%F %T')  ข้ามรอบนี้ — sync ก่อนหน้ายังทำงานอยู่" >>"$LOG"
  exit 0
fi

cd "$DIR" || exit 1

echo "===== $(date '+%F %T')  เริ่ม sync =====" >>"$LOG"
HEADLESS=true /usr/bin/npm run sync >>"$LOG" 2>&1
rc=$?
echo "===== $(date '+%F %T')  จบ sync (exit $rc) =====" >>"$LOG"
exit $rc

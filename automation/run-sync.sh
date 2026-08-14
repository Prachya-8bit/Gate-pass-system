#!/usr/bin/env bash
# Gate Pass → epro sync runner — invoked by cron every 15 minutes.
#
# flock guarantees only one sync runs at a time: if a sync takes longer than
# the 15-minute tick, the next tick is skipped rather than starting a second
# browser that logs into epro concurrently (which would corrupt a work order).
# Runs headless (no window) and appends all output to logs/sync.log.
#
# รันสองฝั่งต่อกันใน lock เดียว: ลงทะเบียนแรงงาน แล้วค่อยคำขอนำรถ
# ห้ามแยกเป็น cron entry ที่สอง — lock มีอยู่เพื่อกันไม่ให้มี browser สองตัว
# login บัญชี epro เดียวกันพร้อมกัน ถ้าแยก entry จะได้ session ชนกัน
# หรือถ้าแชร์ lock ฝั่งรถจะถูก skip เกือบทุกรอบแบบเงียบ
# ฝั่งรถรันทีหลังเพื่อไม่ให้ปัญหาของมันหน่วง sync แรงงานซึ่งมีค่ากว่า

set -uo pipefail

# path ของสคริปต์เอง — เดิม hard-code ไว้ที่ /mnt/d/Code/factory-gate-pass-permit
# ซึ่งผูกกับเครื่องเดียวและพังเงียบถ้า checkout อยู่ที่อื่น (เท่ากับ $PSScriptRoot ใน .ps1)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
rc_worker=$?

HEADLESS=true /usr/bin/npm run sync:vehicle >>"$LOG" 2>&1
rc_vehicle=$?

# คืน exit code ของฝั่งที่พังก่อน เพื่อให้ cron/monitoring เห็นความล้มเหลว
# ฝั่งรถพังไม่ได้ทำให้ฝั่งแรงงานที่รันจบไปแล้วเป็นโมฆะ
if [ "$rc_worker" -ne 0 ]; then rc=$rc_worker; else rc=$rc_vehicle; fi
echo "===== $(date '+%F %T')  จบ sync (แรงงาน exit $rc_worker, รถ exit $rc_vehicle) =====" >>"$LOG"
exit $rc

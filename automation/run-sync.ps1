# Gate Pass -> epro sync runner — invoked by Windows Task Scheduler every 15 minutes.
# PowerShell counterpart of run-sync.sh, for the Windows Server host.
#
# Task Scheduler's "Do not start a new instance" already prevents overlapping
# scheduled runs, but an exclusive file lock is kept here too so a manual run
# cannot collide with a scheduled one — two browsers logging into epro at the
# same time would corrupt a work order. Windows releases the handle when the
# process dies, so the lock cannot go stale after a crash.
#
# npm output goes to a per-run .tmp file, which is appended to logs\sync.log
# once the run finishes. Redirecting straight into sync.log would keep that
# file open for the whole run, and on Windows a second instance then cannot
# append its "skipped" line to it (Linux allows that, which is why
# run-sync.sh can redirect directly).
#
# Side effect of that: a run's block is written in one piece when it finishes,
# so a "ข้ามรอบนี้" line from an overlapping attempt can appear just above the
# block it was skipping. Compare the timestamps, not the line order.
#
# Each side also gets its own log — logs\worker.log and logs\vehicle.log — so one
# side can be followed without the other's output interleaved:
#   Get-Content logs\vehicle.log -Tail 40
# sync.log still holds both, in order, and stays the file to read when the
# question is "what happened this tick". The per-side files exist so that
# following one side does NOT require a second scheduled task: two runners would
# fight over sync.log's write handle (opened FileShare.Read here) and over the
# single epro session the lock protects.
#
# Runs headless (no window).

$ErrorActionPreference = 'Stop'

$dir        = $PSScriptRoot
$logDir     = Join-Path $dir 'logs'
$log        = Join-Path $logDir 'sync.log'
$logWorker  = Join-Path $logDir 'worker.log'
$logVehicle = Join-Path $logDir 'vehicle.log'
$stateDir   = Join-Path $dir 'state'
$lockPath   = Join-Path $stateDir 'sync.lock'

New-Item -ItemType Directory -Force -Path $logDir, $stateDir | Out-Null

# UTF-8 without BOM, LF line endings — keeps the file byte-compatible with the
# entries run-sync.sh has already written, so the Thai text stays readable.
# NOTE: this script itself must stay UTF-8 *with* BOM, or PowerShell 5.1 reads
# it as the ANSI codepage (windows-874 on a Thai system) and mangles the Thai.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Append-BytesTo([string]$path, [byte[]]$bytes) {
    $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Append,
                                 [System.IO.FileAccess]::Write,
                                 [System.IO.FileShare]::Read)
    try { $fs.Write($bytes, 0, $bytes.Length) } finally { $fs.Close() }
}
function Append-Bytes([byte[]]$bytes) { Append-BytesTo $log $bytes }
function Write-LogTo([string]$path, [string]$text) { Append-BytesTo $path $utf8NoBom.GetBytes("$text`n") }
function Write-Log([string]$text) { Write-LogTo $log $text }
function Stamp { Get-Date -Format 'yyyy-MM-dd HH:mm:ss' }

# Task Scheduler hands a task a much narrower PATH than an interactive shell, and
# the account the task runs as may not have Node.js on it at all. That is the usual
# reason someone hand-writes a .cmd with a full path to npm in it — which is exactly
# what the sync host had before run-sync.cmd was tracked. So find npm ourselves
# instead of trusting PATH: if this exits 1, BOTH syncs stop, not just the vehicle
# one, which would turn a one-sided outage into a two-sided one.
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    # Rooted-path guard: an unset variable interpolates to "\nodejs", and Test-Path
    # would then resolve that against the current directory and could match by luck.
    $npmDir = @(
        "$env:ProgramFiles\nodejs",
        "${env:ProgramFiles(x86)}\nodejs",
        "$env:LOCALAPPDATA\Programs\nodejs",
        "$env:APPDATA\npm"
    ) | Where-Object { $_ -match '^[A-Za-z]:\\' -and (Test-Path (Join-Path $_ 'npm.cmd')) } |
        Select-Object -First 1

    if (-not $npmDir) {
        Write-Log "$(Stamp)  ไม่พบ npm — ตรวจว่าติดตั้ง Node.js แล้ว และ PATH ที่ Task Scheduler ใช้มองเห็น"
        exit 1
    }
    # Child cmd.exe inherits this, so `npm run ...` below resolves.
    $env:Path = "$npmDir;$env:Path"
    Write-Log "$(Stamp)  npm ไม่อยู่ใน PATH ของ Task Scheduler — ใช้ $npmDir"
}

# Exclusive lock — bail immediately if a run is already in progress.
try {
    $lock = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate,
                                   [System.IO.FileAccess]::ReadWrite,
                                   [System.IO.FileShare]::None)
} catch {
    Write-Log "$(Stamp)  ข้ามรอบนี้ — sync ก่อนหน้ายังทำงานอยู่"
    exit 0
}

# One temp file per side, so each side's output can be routed to its own log as
# well as to the combined one. Same timestamp in both names ties them to one tick.
$runStamp      = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$runLogWorker  = Join-Path $logDir ("sync-run-worker-{0}.tmp"  -f $runStamp)
$runLogVehicle = Join-Path $logDir ("sync-run-vehicle-{0}.tmp" -f $runStamp)
$started = Stamp
$rc = 1

$rcWorker  = 1
$rcVehicle = 1

try {
    Set-Location $dir
    $env:HEADLESS = 'true'

    # Let cmd.exe do the redirection: PowerShell 5.1 wraps a native command's
    # stderr in ErrorRecord objects, which would mangle the log.
    #
    # Both sides run inside the one lock, worker first.
    #
    # Vehicle runs second so a problem there cannot delay the worker sync, which
    # is the higher-value path. Do NOT split these into two scheduled tasks — the
    # lock exists to stop two browsers logging into the same epro account at once,
    # and sync.log is opened FileShare.Read so a second runner appending to it
    # throws outright. Read logs\worker.log / logs\vehicle.log instead.
    & cmd.exe /c "npm run sync > `"$runLogWorker`" 2>&1"
    $rcWorker = $LASTEXITCODE

    & cmd.exe /c "npm run sync:vehicle > `"$runLogVehicle`" 2>&1"
    $rcVehicle = $LASTEXITCODE

    # Report whichever side failed first; a vehicle failure does not invalidate a
    # worker run that already completed.
    $rc = if ($rcWorker -ne 0) { $rcWorker } else { $rcVehicle }
} finally {
    # Copies one side's captured output into the combined log and into that side's
    # own log, then drops the temp file.
    #
    # The per-side banner deliberately avoids the words "จบ sync" — the runbook
    # reads "จบ sync (exit N)" as the signature of the pre-PR#4 script that never
    # called the vehicle side, so reusing it here would fake that diagnosis.
    function Flush-Side([string]$title, [string]$tmp, [string]$sideLog, [int]$sideRc) {
        Write-Log "----- $title -----"
        Write-LogTo $sideLog "===== $started  เริ่ม $title ====="
        if (Test-Path $tmp) {
            # Byte-for-byte passthrough so the UTF-8 from node survives untouched.
            $bytes = [System.IO.File]::ReadAllBytes($tmp)
            Append-Bytes $bytes
            Append-BytesTo $sideLog $bytes
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        }
        Write-LogTo $sideLog "===== $(Stamp)  $title exit $sideRc ====="
    }

    Write-Log "===== $started  เริ่ม sync ====="
    Flush-Side 'ฝั่งแรงงาน' $runLogWorker  $logWorker  $rcWorker
    Flush-Side 'ฝั่งรถ'     $runLogVehicle $logVehicle $rcVehicle
    Write-Log "===== $(Stamp)  จบ sync (แรงงาน exit $rcWorker, รถ exit $rcVehicle) ====="
    $lock.Close()
}

exit $rc

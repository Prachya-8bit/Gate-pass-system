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
# Runs headless (no window).

$ErrorActionPreference = 'Stop'

$dir      = $PSScriptRoot
$logDir   = Join-Path $dir 'logs'
$log      = Join-Path $logDir 'sync.log'
$stateDir = Join-Path $dir 'state'
$lockPath = Join-Path $stateDir 'sync.lock'

New-Item -ItemType Directory -Force -Path $logDir, $stateDir | Out-Null

# UTF-8 without BOM, LF line endings — keeps the file byte-compatible with the
# entries run-sync.sh has already written, so the Thai text stays readable.
# NOTE: this script itself must stay UTF-8 *with* BOM, or PowerShell 5.1 reads
# it as the ANSI codepage (windows-874 on a Thai system) and mangles the Thai.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Append-Bytes([byte[]]$bytes) {
    $fs = [System.IO.File]::Open($log, [System.IO.FileMode]::Append,
                                 [System.IO.FileAccess]::Write,
                                 [System.IO.FileShare]::Read)
    try { $fs.Write($bytes, 0, $bytes.Length) } finally { $fs.Close() }
}
function Write-Log([string]$text) { Append-Bytes $utf8NoBom.GetBytes("$text`n") }
function Stamp { Get-Date -Format 'yyyy-MM-dd HH:mm:ss' }

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Log "$(Stamp)  ไม่พบ npm — ตรวจว่าติดตั้ง Node.js แล้ว และ PATH ที่ Task Scheduler ใช้มองเห็น"
    exit 1
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

$runLog = Join-Path $logDir ("sync-run-{0}.tmp" -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$started = Stamp
$rc = 1

try {
    Set-Location $dir
    $env:HEADLESS = 'true'

    # Let cmd.exe do the redirection: PowerShell 5.1 wraps a native command's
    # stderr in ErrorRecord objects, which would mangle the log.
    & cmd.exe /c "npm run sync > `"$runLog`" 2>&1"
    $rc = $LASTEXITCODE
} finally {
    Write-Log "===== $started  เริ่ม sync ====="
    if (Test-Path $runLog) {
        # Byte-for-byte passthrough so the UTF-8 from node survives untouched.
        Append-Bytes ([System.IO.File]::ReadAllBytes($runLog))
        Remove-Item $runLog -Force -ErrorAction SilentlyContinue
    }
    Write-Log "===== $(Stamp)  จบ sync (exit $rc) ====="
    $lock.Close()
}

exit $rc

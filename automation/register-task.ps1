# Registers — or repairs — the Windows Task Scheduler task that runs the epro sync.
#
# Run this on the sync host, from this folder:
#   .\register-task.ps1
#
# Why this file is in git: until now the task definition lived ONLY in the GUI on
# the sync host. Nothing in the repo recorded the trigger, the repetition interval,
# the run-as account, or MultipleInstancesPolicy=IgnoreNew — which run-sync.ps1
# depends on to keep two runs from overlapping. A rebuilt host had nothing to
# restore from, and a hand-edited task could drift from the repo with no way to
# notice. Same class of bug as the untracked run-sync.cmd (2026-08-17).
#
# ── The bug this exists to prevent (found 2026-08-18) ───────────────────────────
# The live task's trigger was:
#
#     <Repetition><Interval>PT10M</Interval></Repetition>     <-- no <Duration>
#
# A Repetition with an Interval but no Duration is silently inert. Measured
# directly with two tasks identical except for that one element:
#
#   with <Duration>P1D</Duration>  ->  LastTaskResult 0       (ran, on schedule)
#   without <Duration>             ->  LastTaskResult 267011  (SCHED_S_TASK_HAS_NOT_RUN)
#
# What makes it so hard to spot: BOTH tasks report a healthy-looking NextRunTime
# on the correct interval boundary. Task Scheduler keeps advancing NextRunTime for
# a repetition it never actually runs, so the GUI, Get-ScheduledTaskInfo, and the
# Triggers tab all look right. The only tell is LastTaskResult/LastRunTime never
# moving — and Start-ScheduledTask bypasses the trigger, so a manual test passes
# and appears to confirm the schedule is fine.
#
# The result was that BOTH syncs never ran on a timer. It presented as a
# vehicle-only outage because the vehicle side has epro's 60-minute lead-time rule
# (VEHICLE_LEAD_MINUTES), so its requests aged out of their window, while worker
# records merely arrived whenever someone ran the sync by hand.
#
# This registers ONE task on purpose. Do not add a second task for the vehicle
# side — see README.md ("ห้ามแยกเป็น cron entry / scheduled task ที่สอง"): the two
# runners would fight over the sync.log write handle and the epro session.

[CmdletBinding()]
param(
    [string]$TaskName = 'GatePass EPRO Sync',

    # Docs across the repo (architecture.md, error-reference.md, CLAUDE.md, and the
    # header of run-sync.ps1) all state a 15-minute tick, and the 60-minute
    # lead-time reasoning is budgeted against it. Change both together or not at all.
    [ValidateRange(1, 1440)]
    [int]$IntervalMinutes = 15,

    # The task must run whether or not anyone is logged on, so it needs a stored
    # password. Pass -Credential to skip the prompt (e.g. an unattended rebuild).
    [System.Management.Automation.PSCredential]$Credential
)

$ErrorActionPreference = 'Stop'

# Registering with -RunLevel Highest needs an elevated session. Without this check
# the failure surfaces as a bare "Access is denied" from a cmdlet 60 lines down.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "ต้องรันใน PowerShell ที่ Run as Administrator (การลงทะเบียน task ต้องใช้สิทธิ์ผู้ดูแล)"
}

# Same $PSScriptRoot property as run-sync.ps1/.cmd: the checkout can live anywhere,
# so never hard-code C:\gatepass here.
$runner = Join-Path $PSScriptRoot 'run-sync.cmd'
if (-not (Test-Path $runner)) {
    throw "ไม่พบ $runner — ต้องรันสคริปต์นี้จากโฟลเดอร์ automation ของ checkout"
}

# Point the task at run-sync.cmd, never at npm directly. A .cmd action needs no
# ExecutionPolicy setting and no -File quoting, so the registered task never has to
# change again when the logic inside run-sync.ps1 does.
$action = New-ScheduledTaskAction -Execute $runner -WorkingDirectory $PSScriptRoot

# Daily at 00:00, repeating every $IntervalMinutes for a full day — the shape the
# Task Scheduler GUI produces, and the shape measured above as actually firing.
#
# The graft is required, not stylistic: -RepetitionInterval/-RepetitionDuration
# exist only in New-ScheduledTaskTrigger's "Once" parameter set, so -Daily cannot
# take them directly (it fails with "Parameter set cannot be resolved"). Building
# the Repetition on a throwaway -Once trigger and assigning the whole object is
# what lets a daily trigger carry a repetition. Do not switch this to a plain
# -Once trigger to avoid the graft: -Once has no daily recurrence to restart the
# repetition, so its Duration would have to be some arbitrary far-future span, and
# [TimeSpan]::MaxValue is rejected outright ("value which is incorrectly formatted
# or out of range").
$trigger = New-ScheduledTaskTrigger -Daily -At '00:00'
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At '00:00' `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 1)).Repetition

# Left at the default $true, a sync still running at midnight would be killed when
# the duration ends. The daily trigger restarts the repetition anyway.
$trigger.Repetition.StopAtDurationEnd = $false

# IgnoreNew is load-bearing: run-sync.ps1's header treats Task Scheduler's "do not
# start a new instance" as the first line of defence against two browsers logging
# into the same epro account, with the file lock as the backstop.
# StartWhenAvailable catches up a tick missed across a reboot.
$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

if (-not $Credential) {
    $Credential = Get-Credential -UserName "$env:USERDOMAIN\$env:USERNAME" `
        -Message "บัญชีที่ให้ task รัน (ต้องเข้า epro ได้ และรันได้แม้ไม่มีใคร login)"
}

# -ErrorAction Stop is not redundant with $ErrorActionPreference above: these CIM
# cmdlets can report a failure without honouring the preference variable, and this
# script printed "ลงทะเบียนแล้ว" over a failed registration until it was added.
Register-ScheduledTask -TaskName $TaskName `
    -Action $action -Trigger $trigger -Settings $settings `
    -RunLevel Highest `
    -User $Credential.UserName `
    -Password $Credential.GetNetworkCredential().Password `
    -Force -ErrorAction Stop | Out-Null

# ── Post-condition ─────────────────────────────────────────────────────────────
# The whole point of this script is that one XML element, so it verifies its own
# work rather than trusting that the registration did what was asked. Nothing
# claims success before these pass.
$xml = Export-ScheduledTask -TaskName $TaskName -ErrorAction Stop
# Scoped to inside <Repetition> on purpose: the broken task DID contain a
# <Duration> — under <IdleSettings> — so a plain "does the XML say Duration" check
# would have passed on the exact config this script exists to prevent.
if ($xml -notmatch '(?s)<Repetition>(?:(?!</Repetition>).)*<Duration>') {
    throw "trigger ที่ลงทะเบียนไม่มี <Duration> ใน <Repetition> — task จะไม่รันตามรอบเลย ห้ามปล่อยไว้"
}

$info = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Get-ScheduledTaskInfo
Write-Host "ลงทะเบียน task '$TaskName' แล้ว — ทุก $IntervalMinutes นาที เรียก $runner"
Write-Host "NextRunTime : $($info.NextRunTime)"
Write-Host "LastRunTime : $($info.LastRunTime)   LastTaskResult: $($info.LastTaskResult)"
Write-Host ""
Write-Host "ยืนยันว่าตารางเวลาทำงานจริงโดย **รอให้ถึงรอบเอง** ห้ามใช้ Start-ScheduledTask"
Write-Host "เพราะมันข้าม trigger จึงผ่านได้แม้ trigger พัง — และ NextRunTime ก็ดูปกติได้ทั้งที่ไม่รัน"
Write-Host "ที่เชื่อได้คือ LastTaskResult ขยับจาก 267011 (ยังไม่เคยรัน) เป็น 0 เองโดยไม่ต้องสั่ง:"
Write-Host "  Get-ScheduledTask -TaskName `"$TaskName`" | Get-ScheduledTaskInfo"
Write-Host "  Get-Content .\logs\sync.log -Tail 40"

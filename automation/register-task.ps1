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
# The trigger it builds is the ordinary "daily at 00:00, repeat every N minutes for
# a day" shape: an <Interval> together with an explicit <Duration>, which is what
# the Task Scheduler GUI writes and what Register-ScheduledTask accepts without
# argument. The host's hand-made task had an <Interval> with no <Duration>; that
# one did fire (its 10-minute ticks are in logs/sync.log from 2026-08-18 14:15
# onward), so a missing Duration is NOT a known-broken configuration — the
# post-condition below simply refuses to leave the repetition half-specified,
# because an omitted Duration means relying on undocumented default behaviour for
# the one setting that decides whether the sync runs at all.
#
# For the record, since an earlier version of this comment claimed otherwise: the
# 2026-08-18 outage (vehicle side silent, worker side fine, no banners in
# sync.log for two weeks) was NOT a trigger problem. The task was firing on time
# the whole while; it was invoking the old untracked run-sync.cmd, which called
# `npm run sync` directly and so never reached the vehicle sync and never wrote a
# banner. Tracking run-sync.cmd (commit d6e3a6d) is what fixed it, and it took
# effect when the sync host pulled. Diagnose from the banners in sync.log, not
# from the trigger.
#
# This registers ONE task on purpose. Do not add a second task for the vehicle
# side — see README.md ("ห้ามแยกเป็น cron entry / scheduled task ที่สอง"): the two
# runners would fight over the sync.log write handle and the epro session.

[CmdletBinding()]
param(
    [string]$TaskName = 'GatePass EPRO Sync',

    # 10 minutes is what the sync host has actually been running (visible in
    # logs/sync.log). Docs elsewhere say 15 — the tick was tightened at some point
    # and the prose was not updated; the vehicle side's 60-minute lead-time budget
    # only gets safer as this gets smaller, so the docs are conservative, not wrong.
    [ValidateRange(1, 1440)]
    [int]$IntervalMinutes = 10,

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
# Verify the registration rather than trusting it. Nothing claims success until
# these pass.
$xml = Export-ScheduledTask -TaskName $TaskName -ErrorAction Stop
# Scoped to inside <Repetition> on purpose: every task carries an unrelated
# <Duration> under <IdleSettings>, so a plain "does the XML say Duration" check
# would pass on a repetition that has none.
if ($xml -notmatch '(?s)<Repetition>(?:(?!</Repetition>).)*<Duration>') {
    throw "trigger ที่ลงทะเบียนมี <Interval> แต่ไม่มี <Duration> ใน <Repetition> — ระบุให้ครบ อย่าพึ่งค่า default ที่ไม่มีเอกสารรองรับ"
}

$info = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Get-ScheduledTaskInfo
Write-Host "ลงทะเบียน task '$TaskName' แล้ว — ทุก $IntervalMinutes นาที เรียก $runner"
Write-Host "NextRunTime : $($info.NextRunTime)"
Write-Host "LastRunTime : $($info.LastRunTime)   LastTaskResult: $($info.LastTaskResult)"
Write-Host ""
Write-Host "ยืนยันโดย **รอให้ถึงรอบเอง** ห้ามใช้ Start-ScheduledTask เพราะมันข้าม trigger"
Write-Host "หลักฐานที่เชื่อได้คือ banner ใน sync.log ที่โผล่เองทุก $IntervalMinutes นาที —"
Write-Host "task ยิงตรงเวลาแต่ไม่มี banner เลยก็เกิดขึ้นได้ (เคส run-sync.cmd เก่าที่ untracked)"
Write-Host "  Get-Content .\logs\sync.log -Tail 40"
Write-Host "  Get-Content .\logs\vehicle.log -Tail 20"

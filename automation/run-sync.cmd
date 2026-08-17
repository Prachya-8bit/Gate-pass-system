@echo off
REM Gate Pass -> epro sync runner: the entry point Windows Task Scheduler calls.
REM
REM All the logic lives in run-sync.ps1 next to this file. Task Scheduler keeps
REM pointing at this .cmd because a .cmd action needs no ExecutionPolicy setting
REM and no -File quoting, so the registered task never has to change again.
REM
REM This file is tracked in git ON PURPOSE. It used to exist only on the sync
REM host, untracked, calling "npm run sync" directly. So when run-sync.ps1
REM learned to run the vehicle sync as well (PR #4), git pull changed nothing
REM about what actually ran every 15 minutes: the worker sync kept working, the
REM vehicle sync was never invoked, and because nothing failed there was no
REM error anywhere to show it -- the scheduled run just went quiet on one side.
REM Keeping this in git is what makes a fix to run-sync.ps1 reach the host.
REM
REM Deliberately ASCII-only: cmd.exe reads a .cmd in the OEM codepage (874 on a
REM Thai Windows), so Thai text here would be mangled. All Thai logging happens
REM in run-sync.ps1, which is UTF-8 with BOM for exactly that reason.
REM
REM %~dp0 is this file's own folder (with a trailing backslash), so the checkout
REM can live anywhere -- the same property as $PSScriptRoot in run-sync.ps1 and
REM BASH_SOURCE in run-sync.sh. Do not hard-code C:\gatepass here.

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0run-sync.ps1"

REM Propagate the exit code so Task Scheduler's LastTaskResult means something:
REM 0 = both syncs finished cleanly, non-zero = one failed (see logs\sync.log).
exit /b %ERRORLEVEL%

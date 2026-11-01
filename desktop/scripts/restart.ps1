# Kills any running copy of the agent and launches a freshly built one.
#
# Day-to-day, prefer `npm run dev` (tauri dev) — it rebuilds and relaunches on
# its own whenever a .rs or src/ file changes. Use this instead when you want
# a *guaranteed* clean process: it clears all in-memory state (identified
# titles, judge verdicts, the per-poll candidate cache), not just picking up
# new code. That distinction mattered once already — stale in-memory state
# from an earlier test run silently blocked a retest that looked like a code
# bug but wasn't.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "Stopping any running app.exe..."
Get-Process -Name "app" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

Write-Host "Building..."
Push-Location "$root\src-tauri"
cargo build
Pop-Location

Write-Host "Launching..."
Start-Process "$root\src-tauri\target\debug\app.exe"

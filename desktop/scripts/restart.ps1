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
# Merge tauri.dev.conf.json over tauri.conf.json (the same thing
# `tauri dev --config` does), so this build has its own identifier — and with
# it its own settings folder, logs and single-instance lock — and never
# overwrites the installed app's sign-in. Process-scoped: a release build
# (`npx tauri build`) in another terminal never sees it.
$env:TAURI_CONFIG = Get-Content -Raw "tauri.dev.conf.json"
cargo build
Pop-Location

Write-Host "Launching..."
Start-Process "$root\src-tauri\target\debug\app.exe"

# GamesList play-tracking agent

A small script that watches for games you have set to **Playing** on the
website and logs the hours you spend in them.

This is the prototype: one PowerShell script, no installer, no code signing.
It proves the detection and the API before anything is packaged. A tray app
(Go, Rust or Tauri) would replace it later and talk to the same endpoints.

## What it does and does not touch

- Only games whose status is **Playing** ever receive hours. Completed,
  backlog and DNF games are never written to — and the server checks this
  itself, so a buggy agent cannot get around it.
- Hours are **added** to whatever is already there. 300 hours entered by hand
  plus 2 tracked hours is 302.
- It sends only games it positively matched. The list of everything running on
  your PC never leaves your machine.

## Setup

1. On the website: **Settings → Devices → Add device**, and copy the token.
   It is shown once.
2. Run once with your details:

   ```powershell
   .\gameslist-agent.ps1 -Token "glk_..." -ApiBase "https://your-site"
   ```

   Both are saved to `%APPDATA%\GamesList\config.json`, so later runs need no
   arguments.
3. Optional but recommended — real Windows toasts:

   ```powershell
   Install-Module BurntToast -Scope CurrentUser
   ```

   Without it everything still works; you just get console output instead of
   notifications.
4. Optional — start it at login:

   ```powershell
   $action  = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -File $PWD\gameslist-agent.ps1"
   $trigger = New-ScheduledTaskTrigger -AtLogOn
   Register-ScheduledTask -TaskName "GamesList agent" -Action $action -Trigger $trigger
   ```

   Note this registers the *long-running* script once at login. Do not set it
   to run every 30 seconds — restarting PowerShell thousands of times a day
   costs far more than watching does.

## How it recognises a game

**Steam games need no setup.** Steam publishes the running app id in the
registry, which is matched against the Steam app id stored on each game.

**Everything else — cracked copies, emulators, Epic, GOG — is linked once.**
When a program that looks like a game is running and you have a Playing game
with nothing linked to it, you get one toast:

> **Is this a game?** `splitfiction.exe` looks like a game. Is it Split Fiction?
> [ Yes - Split Fiction ] [ No - pick another ]

Either button opens the website to confirm. After that the link is remembered
for good, on every machine you pair.

### It will not pester you

"Looks like a game" is deliberately strict. A process must:

1. have a visible window,
2. not be known software (browsers, chat, editors, launchers, Office…),
3. have been running for at least 3 minutes,
4. not live in the Windows directory, and
5. either sit in a games folder (`steamapps`, `Epic Games`, `GOG Galaxy`…) or
   have a 3D graphics runtime loaded (`d3d11.dll`, `vulkan-1.dll`…).

Tested against every windowed application running on a normal desktop, this
produced **zero** prompts. (`TextInputHost`, a Windows component that loads
Direct3D, was the one false positive before rule 4 was added.)

And each executable is asked about **once, ever** — the answer is remembered in
`%APPDATA%\GamesList\asked.json`, so dismissing a prompt means never seeing it
again, even after a restart.

## How hours are counted

- Wall-clock while the game is running. Idle time counts, by design — same as
  Steam.
- A checkpoint every 15 minutes, plus a final write when the game closes, so a
  crash or power cut loses at most 15 minutes.
- Checkpoints report the session's cumulative minutes and the server applies
  only the difference, so a retry or a replayed request can never double-count.
- If the site is unreachable, checkpoints queue in
  `%APPDATA%\GamesList\pending.json` and flush when it comes back.

## Files it keeps

| Path | Purpose |
|---|---|
| `%APPDATA%\GamesList\config.json` | Your token and site address |
| `%APPDATA%\GamesList\pending.json` | Checkpoints waiting to be sent |
| `%APPDATA%\GamesList\asked.json` | Executables already asked about |

Revoking the device in Settings stops it immediately; the token cannot be
recovered or reused afterwards.

<#
    GamesList play-tracking agent - prototype.

    Watches for games set to "Playing" on the website and logs the hours you
    spend in them. Nothing else is touched: completed, backlog and DNF games
    are never written to, and the server enforces that independently of this
    script.

    Setup
      1. Settings -> Devices -> Add device, copy the token.
      2. .\gameslist-agent.ps1 -Token "glk_..." -ApiBase "https://your-site"
         (saved to %APPDATA%\GamesList\config.json; later runs need no args)
      3. Optional, run at login - see README.md in this folder.

    One long-running process, not a scheduled task that respawns every poll:
    restarting PowerShell 2,880 times a day would cost far more than the
    watching does.
#>

[CmdletBinding()]
param(
    [string] $Token,
    [string] $ApiBase,
    [int]    $PollSeconds = 30
)

$ErrorActionPreference = 'Stop'

# ---- Config ---------------------------------------------------------------
$ConfigDir  = Join-Path $env:APPDATA 'GamesList'
$ConfigPath = Join-Path $ConfigDir 'config.json'
$QueuePath  = Join-Path $ConfigDir 'pending.json'
$AskedPath  = Join-Path $ConfigDir 'asked.json'

if (-not (Test-Path $ConfigDir)) { New-Item -ItemType Directory -Path $ConfigDir | Out-Null }

if ($Token -or $ApiBase) {
    $existing = if (Test-Path $ConfigPath) { Get-Content $ConfigPath -Raw | ConvertFrom-Json } else { $null }
    [ordered]@{
        token   = if ($Token)   { $Token }   elseif ($existing) { $existing.token }   else { '' }
        apiBase = if ($ApiBase) { $ApiBase } elseif ($existing) { $existing.apiBase } else { '' }
    } | ConvertTo-Json | Set-Content $ConfigPath -Encoding utf8
}

if (-not (Test-Path $ConfigPath)) {
    Write-Host 'No config yet. Run once with -Token and -ApiBase.' -ForegroundColor Yellow
    exit 1
}
$config  = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$ApiBase = $config.apiBase.TrimEnd('/')
$Headers = @{ Authorization = "Bearer $($config.token)"; 'Content-Type' = 'application/json' }

# ---- Notifications --------------------------------------------------------
$script:HasToast = $null -ne (Get-Module -ListAvailable -Name BurntToast)
if ($script:HasToast) { Import-Module BurntToast -ErrorAction SilentlyContinue }

function Show-Toast {
    param([string] $Title, [string] $Body, $Buttons = @())
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Title - $Body"
    if (-not $script:HasToast) { return }
    try {
        if (@($Buttons).Count -gt 0) {
            $btns = foreach ($b in $Buttons) { New-BTButton -Content $b.Text -Arguments $b.Url -ActivationType Protocol }
            New-BurntToastNotification -Text $Title, $Body -Button $btns -ErrorAction SilentlyContinue
        } else {
            New-BurntToastNotification -Text $Title, $Body -ErrorAction SilentlyContinue
        }
    } catch { }
}

# ---- API ------------------------------------------------------------------
function Invoke-Api {
    param([string] $Path, [string] $Method = 'GET', $Body = $null)
    $uri = "$ApiBase$Path"
    if ($Body) { return Invoke-RestMethod -Uri $uri -Method $Method -Headers $Headers -Body ($Body | ConvertTo-Json -Compress) }
    return Invoke-RestMethod -Uri $uri -Method $Method -Headers $Headers
}

function Add-ToQueue {
    param($Payload)
    $queue = if (Test-Path $QueuePath) { @(Get-Content $QueuePath -Raw | ConvertFrom-Json) } else { @() }
    $queue += $Payload
    $queue | ConvertTo-Json -Depth 5 | Set-Content $QueuePath -Encoding utf8
}

function Send-Session {
    param($Payload)
    try { return Invoke-Api -Path '/api/agent/session' -Method 'POST' -Body $Payload }
    catch {
        Write-Host "  (offline - queued) $($_.Exception.Message)" -ForegroundColor DarkYellow
        Add-ToQueue $Payload
        return $null
    }
}

function Send-Queued {
    if (-not (Test-Path $QueuePath)) { return }
    $queue = @(Get-Content $QueuePath -Raw | ConvertFrom-Json)
    if ($queue.Count -eq 0) { return }
    $remaining = @()
    foreach ($item in $queue) {
        try { Invoke-Api -Path '/api/agent/session' -Method 'POST' -Body $item | Out-Null } catch { $remaining += $item }
    }
    if ($remaining.Count -gt 0) { $remaining | ConvertTo-Json -Depth 5 | Set-Content $QueuePath -Encoding utf8 }
    else { Remove-Item $QueuePath -Force }
}

# ---- Detection ------------------------------------------------------------
# Steam publishes the running app id here, which solves matching for Steam
# games outright - no executable list needed.
function Get-SteamAppId {
    try {
        $v = (Get-ItemProperty -Path 'HKCU:\Software\Valve\Steam' -Name 'RunningAppID' -ErrorAction Stop).RunningAppID
        if ($v -and $v -gt 0) { return [int]$v }
    } catch { }
    return 0
}

# Never games. Keeps the "is this a game?" prompt away from everyday software.
$IgnoredProcesses = @(
    'explorer','chrome','msedge','firefox','opera','brave','code','devenv','powershell','pwsh',
    'windowsterminal','cmd','conhost','discord','slack','teams','spotify','whatsapp','telegram',
    'steam','steamwebhelper','epicgameslauncher','galaxyclient','battle.net','ubisoftconnect',
    'eadesktop','origin','obs64','obs32','notepad','notepad++','taskmgr','searchhost','onedrive',
    'shellexperiencehost','applicationframehost','systemsettings','photoshop','illustrator','figma',
    'outlook','excel','winword','powerpnt','acrobat','zoom','vlc','mpc-hc64','7zfm','winrar'
)

# Folders games actually live in.
$GameFolderHints = @(
    'steamapps',
    'epic games',
    'gog galaxy',
    'gog games',
    'xboxgames',
    'ubisoft game launcher',
    'ea games',
    'origin games',
    'battle.net'
)

# Graphics runtimes a 3D game loads and ordinary software generally does not.
$GraphicsModules = @('d3d11.dll','d3d12.dll','d3d9.dll','dxgi.dll','vulkan-1.dll','opengl32.dll')

<#
    Does this process look like a game?

    Without Discord's catalogue of known executables we cannot *know*, so this
    is deliberately conservative: it would rather miss a game - the user can
    always link one from the website - than interrupt someone about their
    spreadsheet. A process must have a visible window, not be known software,
    have been running a few minutes, and then either live in a games folder or
    have a 3D graphics runtime loaded.
#>
function Test-LooksLikeGame {
    param($Process)

    if (-not $Process.MainWindowTitle) { return $false }
    if ($IgnoredProcesses -contains $Process.ProcessName.ToLower()) { return $false }

    # Installers, updaters and one-off tools rarely stay open this long.
    try { if (((Get-Date) - $Process.StartTime).TotalMinutes -lt 3) { return $false } } catch { return $false }

    # No readable path means we cannot vouch for it, so we stay quiet.
    $path = ''
    try { $path = $Process.Path } catch { }
    if (-not $path) { return $false }
    $lower = $path.ToLower()

    # Windows' own components live here and several of them load Direct3D -
    # TextInputHost was the one that caught this out in testing. Games do not
    # install into the Windows directory, so this rules them all out at once.
    if ($lower.StartsWith($env:SystemRoot.ToLower())) { return $false }

    foreach ($hint in $GameFolderHints) { if ($lower.Contains($hint)) { return $true } }

    # Only reached once a process has passed everything above, so the cost of
    # enumerating modules is paid rarely.
    try {
        foreach ($m in $Process.Modules) {
            if ($GraphicsModules -contains $m.ModuleName.ToLower()) { return $true }
        }
    } catch { }

    return $false
}

function Get-CandidateProcesses {
    # Get-Process, never Get-CimInstance Win32_Process: measured 7.9ms vs 294ms
    # per call. At one poll per 30s that is the difference between invisible
    # and noticeable.
    Get-Process | Where-Object { $_.MainWindowTitle }
}

# ---- State ----------------------------------------------------------------
$script:State        = $null
$script:StateFetched = [datetime]::MinValue
$script:Session      = $null

# Asked once, remembered forever - including across restarts. The user is
# never pestered about the same program twice, whatever they answered.
function Get-AskedList {
    if (-not (Test-Path $AskedPath)) { return @() }
    try { return @(Get-Content $AskedPath -Raw | ConvertFrom-Json) } catch { return @() }
}

function Add-Asked {
    param([string] $Exe)
    $list = @(Get-AskedList)
    if ($list -contains $Exe) { return }
    $list += $Exe
    $list | ConvertTo-Json | Set-Content $AskedPath -Encoding utf8
}

function Update-State {
    if ($script:State -and ((Get-Date) - $script:StateFetched).TotalMinutes -lt 5) { return }
    try {
        $script:State = Invoke-Api -Path '/api/agent/state'
        $script:StateFetched = Get-Date
    } catch {
        Write-Host "  (could not refresh state) $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}

function Find-PlayingByAppId {
    param([int] $AppId)
    if (-not $script:State) { return $null }
    return $script:State.playing | Where-Object { $_.steamAppId -eq $AppId } | Select-Object -First 1
}

function Find-PlayingByExe {
    param([string] $ExeName)
    if (-not $script:State) { return $null }
    if (-not $script:State.executables) { return $null }
    $gameId = $script:State.executables.$ExeName
    if (-not $gameId) { return $null }
    return $script:State.playing | Where-Object { $_.id -eq $gameId } | Select-Object -First 1
}

function Start-Tracking {
    param($Game, [string] $SteamAppId, [string] $ExeName)
    $script:Session = [ordered]@{
        gameId          = $Game.id
        title           = $Game.title
        clientSessionId = [guid]::NewGuid().ToString()
        startedAt       = (Get-Date).ToUniversalTime().ToString('o')
        steamAppId      = $SteamAppId
        exeName         = $ExeName
        lastCheckpoint  = Get-Date
        startedLocal    = Get-Date
    }
    Show-Toast -Title 'Now tracking' -Body "$($Game.title) - your hours are being logged."
}

function New-Payload {
    param([bool] $Final)
    $payload = [ordered]@{
        clientSessionId = $script:Session.clientSessionId
        minutes         = [int][math]::Floor(((Get-Date) - $script:Session.startedLocal).TotalMinutes)
        startedAt       = $script:Session.startedAt
    }
    if ($script:Session.steamAppId) { $payload.steamAppId = [int]$script:Session.steamAppId }
    if ($script:Session.exeName)    { $payload.exeName    = $script:Session.exeName }
    if ($Final) { $payload.endedAt = (Get-Date).ToUniversalTime().ToString('o') }
    return $payload
}

function Stop-Tracking {
    if (-not $script:Session) { return }
    $title  = $script:Session.title
    $result = Send-Session (New-Payload -Final $true)
    $script:Session = $null
    if ($result) { Show-Toast -Title 'Stopped tracking' -Body "$title - $($result.addedHours)h added, now $($result.totalHours)h." }
    else         { Show-Toast -Title 'Stopped tracking' -Body "$title - session saved, will sync when back online." }
}

function Request-GameLink {
    param($Process)
    $exe = "$($Process.ProcessName.ToLower()).exe"
    if ((Get-AskedList) -contains $exe) { return }
    if (-not $script:State) { return }

    # Nothing it could be linked to - say nothing at all.
    $unlinked = @($script:State.playing | Where-Object { -not $_.linked })
    if ($unlinked.Count -eq 0) { return }

    Add-Asked $exe
    $suggestion = $unlinked[0]
    $encoded = [uri]::EscapeDataString($exe)
    Show-Toast -Title 'Is this a game?' -Body "$exe looks like a game. Is it $($suggestion.title)?" -Buttons @(
        @{ Text = "Yes - $($suggestion.title)"; Url = "$ApiBase/settings/devices/link?exe=$encoded&suggest=$($suggestion.id)" },
        @{ Text = 'No - pick another';          Url = "$ApiBase/settings/devices/link?exe=$encoded" }
    )
}

# ---- Main loop ------------------------------------------------------------
Write-Host "GamesList agent watching $ApiBase (poll $PollSeconds s). Ctrl+C to stop." -ForegroundColor Cyan
Update-State
if ($script:State) { Write-Host "  $(@($script:State.playing).Count) game(s) currently set to Playing." }

try {
    while ($true) {
        Update-State
        Send-Queued

        $appId     = Get-SteamAppId
        $processes = @(Get-CandidateProcesses)
        $game      = $null
        $viaAppId  = ''
        $viaExe    = ''

        if ($appId -gt 0) {
            $game = Find-PlayingByAppId $appId
            if ($game) { $viaAppId = "$appId" }
        }
        if (-not $game) {
            foreach ($p in $processes) {
                $exe   = "$($p.ProcessName.ToLower()).exe"
                $match = Find-PlayingByExe $exe
                if ($match) { $game = $match; $viaExe = $exe; break }
            }
        }

        if ($game) {
            if (-not $script:Session -or $script:Session.gameId -ne $game.id) {
                Stop-Tracking
                Start-Tracking -Game $game -SteamAppId $viaAppId -ExeName $viaExe
            }
        } elseif ($script:Session) {
            Stop-Tracking
        }

        if ($script:Session) {
            $every = 15
            if ($script:State -and $script:State.checkpointMinutes) { $every = $script:State.checkpointMinutes }
            if (((Get-Date) - $script:Session.lastCheckpoint).TotalMinutes -ge $every) {
                Send-Session (New-Payload -Final $false) | Out-Null
                $script:Session.lastCheckpoint = Get-Date
            }
        } else {
            # Nothing matched. Ask about a process only if it genuinely looks
            # like a game, and only ever once per executable.
            foreach ($p in $processes) {
                if (Test-LooksLikeGame $p) { Request-GameLink $p }
            }
        }

        Start-Sleep -Seconds $PollSeconds
    }
} finally {
    # Ctrl+C or logoff: don't lose the session in progress.
    Stop-Tracking
}

# Kills every running `next dev` process (and its child start-server.js), so a
# new `npm run dev` never ends up as a second instance silently corrupting the
# shared .next build folder — the collision that broke things 3+ times in one
# session before this existed.

$killed = 0
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
    if ($_.CommandLine -match "next[/\\]dist[/\\]bin[/\\]next" -or $_.CommandLine -match "next-server" -or $_.CommandLine -match "start-server\.js") {
        Write-Host "Killing node pid $($_.ProcessId): $($_.CommandLine)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        $killed++
    }
}

if ($killed -eq 0) {
    Write-Host "No running dev server found."
} else {
    Write-Host "Killed $killed process(es)."
    Start-Sleep -Milliseconds 500
}

$sessionId = [System.DateTimeOffset]::Now.ToUnixTimeSeconds()
$sessionDir = "C:\MyCode\modol\.superpowers\brainstorm\session-$sessionId"
New-Item -ItemType Directory -Path "$sessionDir\content" -Force | Out-Null
New-Item -ItemType Directory -Path "$sessionDir\state" -Force | Out-Null

$env:BRAINSTORM_DIR = $sessionDir
$env:BRAINSTORM_HOST = "127.0.0.1"
$env:BRAINSTORM_URL_HOST = "localhost"
$env:BRAINSTORM_OWNER_PID = "1"

$serverScript = "C:\Users\Q1678\.config\opencode\skills\superpowers\brainstorming\scripts\server.cjs"

$serverLog = "$sessionDir\state\server.log"
$infoFile = "$sessionDir\state\server-info"

& node $serverScript > $serverLog 2>&1

$content = Get-Content $serverLog -Raw
if ($content -match '"url":"([^"]+)"') {
    $url = $matches[1]
    Set-Content -Path $infoFile -Value $url
}

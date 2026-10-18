$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node.exe).Source
$processes = @(
    @{ Port = 5174; Folder = 'damso-library'; Arguments = @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5174', '--strictPort') },
    @{ Port = 8081; Folder = 'damso-mobile'; Arguments = @('node_modules/expo/bin/cli', 'start', '--web', '--localhost', '--port', '8081') }
)
foreach ($server in $processes) {
    $listening = Get-NetTCPConnection -LocalPort $server.Port -State Listen -ErrorAction SilentlyContinue
    if ($listening) { Write-Host "Port $($server.Port) is already in use; keeping the existing process."; continue }
    $folder = Join-Path $projectRoot $server.Folder
    if (-not (Test-Path -LiteralPath (Join-Path $folder $server.Arguments[0]))) { throw "Install dependencies first in $folder" }
    Start-Process -FilePath $nodePath -ArgumentList $server.Arguments -WorkingDirectory $folder -WindowStyle Hidden -RedirectStandardOutput (Join-Path $folder 'preview.log') -RedirectStandardError (Join-Path $folder 'preview-error.log') | Out-Null
}
Write-Host 'Damso web preview: http://localhost:8081'

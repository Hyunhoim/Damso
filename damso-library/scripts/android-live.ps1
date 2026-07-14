$ErrorActionPreference = 'Stop'

$sdkRoot = 'D:\src'
$platformTools = Join-Path $sdkRoot 'platform-tools'

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:PATH = "$platformTools;$env:PATH"

$hostIp = $env:DAMSO_LIVE_HOST

if (-not $hostIp) {
  $network = Get-NetIPConfiguration |
    Where-Object {
      $_.IPv4DefaultGateway -and
      $_.IPv4Address -and
      $_.NetAdapter.Status -eq 'Up'
    } |
    Select-Object -First 1

  if ($network) {
    $hostIp = ($network.IPv4Address | Select-Object -First 1).IPAddress
  }
}

if (-not $hostIp) {
  throw 'Could not detect a LAN IPv4 address. Set DAMSO_LIVE_HOST manually, for example: $env:DAMSO_LIVE_HOST="192.168.0.10"'
}

Write-Host "Using Android live reload server: http://$hostIp`:5174" -ForegroundColor Cyan
Write-Host 'Make sure the phone and laptop are on the same Wi-Fi, and allow Node/Vite through Windows Firewall if prompted.' -ForegroundColor DarkGray

& npx.cmd cap run android --live-reload --host $hostIp --port 5174 --forwardPorts 5174:5174

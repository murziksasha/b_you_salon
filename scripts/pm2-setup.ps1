# ProperService: install/start with pm2 + reliable Windows autostart (no Docker).
# Builds only if .next is missing (via start-prod.ps1 -PrepareOnly).
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

$AppName = "byou"
$LegacyAppName = "properservice"
$TaskName = "ProperService-pm2"
$AutostartPs1 = Join-Path $PSScriptRoot "pm2-autostart.ps1"
. (Join-Path $PSScriptRoot "pm2-win.ps1")

function Test-HasCommand {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Read-AppPort {
  $port = 3000
  $envFile = Join-Path $Root ".env"
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile -ErrorAction SilentlyContinue) {
      if ($line -match "^\s*PORT\s*=\s*(\d+)") {
        $port = [int]$Matches[1]
        break
      }
    }
  }
  if ($env:PORT -match "^\d+$") {
    $port = [int]$env:PORT
  }
  return $port
}

function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $machine + ";" + $user
}

if (-not (Test-HasCommand "node")) {
  Write-Error "Required command not found: node. Install Node.js LTS and ensure it is in PATH."
  exit 1
}
if (-not (Test-HasCommand "npm")) {
  Write-Error "Required command not found: npm. Install Node.js LTS and ensure it is in PATH."
  exit 1
}

Write-Host "==> Prepare (deps + build-if-needed)..."
$prepareScript = Join-Path $PSScriptRoot "start-prod.ps1"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $prepareScript -PrepareOnly
if ($LASTEXITCODE -ne 0) {
  Write-Error "Prepare failed (exit $LASTEXITCODE)"
  exit $LASTEXITCODE
}

if (-not (Test-HasCommand "pm2")) {
  Write-Host "==> Installing pm2 globally..."
  npm install -g pm2
  if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install -g pm2 failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
  }
  Update-SessionPath
}

if (-not (Test-HasCommand "pm2")) {
  Write-Error "pm2 still not in PATH after install. Close this terminal, open a new one, and re-run: npm run pm2:setup"
  exit 1
}

Write-Host "==> Starting app with pm2..."
Write-Host "    (setup judges success by pm2 jlist, not a blank PS exit code)"
$eco = Join-Path $Root "ecosystem.config.cjs"
if (-not (Test-Path $eco)) {
  Write-Error "Missing $eco"
  exit 1
}

# First run: no daemon yet. `pm2 delete ... >nul` starts God with stdio on NUL and
# hangs forever on Windows. Skip delete unless a prior pm2 home exists; always time out.
Write-Host "    [1/4] pm2 delete $AppName (ignore if missing)..."
if (-not (Test-Pm2PriorState)) {
  Write-Host "    skip (no existing pm2 daemon - first run)"
}
else {
  $delCode = Invoke-Pm2Timed -Pm2Args "delete $AppName" -TimeoutSec 20
  [void](Invoke-Pm2Timed -Pm2Args "delete $LegacyAppName" -TimeoutSec 15)
  if ($delCode -eq 124) {
    Write-Host "    delete hung - pm2 kill and continue"
    [void](Invoke-Pm2Timed -Pm2Args "kill" -TimeoutSec 20)
    Start-Sleep -Seconds 2
  }
}

Write-Host "    [2/4] ensuring pm2 daemon is up (pm2 ping)..."
$pingCode = Invoke-Pm2Timed -Pm2Args "ping" -TimeoutSec 25
# Only a hang (124) is a ping failure. Blank/null ExitCode on PS 5.1 is normal after pong.
if ($pingCode -eq 124) {
  Write-Host "    ping hung (exit 124) - pm2 kill + retry..."
  [void](Invoke-Pm2Timed -Pm2Args "kill" -TimeoutSec 20)
  Start-Sleep -Seconds 2
  $pingCode = Invoke-Pm2Timed -Pm2Args "ping" -TimeoutSec 25
  Write-Host "    ping retry exit=$pingCode"
}
else {
  Write-Host "    ping ok (exit $pingCode)"
}

Write-Host "    [3/4] pm2 start ecosystem.config.cjs ..."
Write-Host "    (first time can take 15-60s; timeout 90s then retry once)"
$startCode = Invoke-Pm2Timed -Pm2Args "start ecosystem.config.cjs" -TimeoutSec 90
Start-Sleep -Seconds 2
$online = Test-Pm2AppOnline $AppName
# Kill+retry only on hang. A blank ExitCode after a printed "online" table is success.
if (-not $online -and $startCode -eq 124) {
  Write-Host "    start hung (exit 124) - pm2 kill + retry..."
  [void](Invoke-Pm2Timed -Pm2Args "kill" -TimeoutSec 20)
  Start-Sleep -Seconds 2
  $startCode = Invoke-Pm2Timed -Pm2Args "start ecosystem.config.cjs" -TimeoutSec 90
  Start-Sleep -Seconds 2
  $online = Test-Pm2AppOnline $AppName
}
if (-not $online -and $startCode -eq 124) {
  Write-Error "pm2 start hung twice (byou not online). Try manually: pm2 kill && pm2 start ecosystem.config.cjs"
  exit 1
}
if ($online) {
  Write-Host "    start ok (byou online, timed-exit $startCode)"
}
else {
  Write-Host "    start finished (timed-exit $startCode); jlist did not confirm online - not killing"
}

Write-Host "    [4/4] pm2 save ..."
$saveCode = Invoke-Pm2Timed -Pm2Args "save --force" -TimeoutSec 30
if ($saveCode -eq 124) {
  Write-Warning "pm2 save hung (exit 124) - autostart may not restore processes"
}
else {
  $dump = Join-Path $env:USERPROFILE ".pm2\dump.pm2"
  if (Test-Path $dump) {
    Write-Host "pm2 dump saved: $dump"
  }
  else {
    Write-Warning "pm2 save ran but dump not found at $dump"
  }
}

Write-Host "    pm2 status:"
cmd.exe /c "pm2 status"

Write-Host "==> Configuring Windows autostart..."
Write-Host "    (registers Task Scheduler + Startup folder; does not re-start pm2)"
$regScript = Join-Path $PSScriptRoot "register-autostart.ps1"
$autostartOk = $false
if (Test-Path $regScript) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $regScript
  if ($LASTEXITCODE -eq 0) {
    $autostartOk = $true
  }
}
else {
  Write-Warning "Missing $regScript"
}

# Optional legacy helper (bonus only)
try {
  if (-not (Test-HasCommand "pm2-windows-startup")) {
    npm install -g pm2-windows-startup 2>$null | Out-Null
    Update-SessionPath
  }
  if (Test-HasCommand "pm2-windows-startup") {
    cmd.exe /c "pm2-windows-startup install" | Out-Null
  }
}
catch { }

$port = Read-AppPort
Write-Host ""
Write-Host "==== ProperService pm2 setup complete ===="
cmd.exe /c "pm2 status"
Write-Host ""
Write-Host "Health:  http://localhost:$port/api/health"
Write-Host "Site:    http://localhost:$port"
Write-Host "Admin:   http://localhost:$port/admin"
Write-Host ""
Write-Host "Commands:"
Write-Host "  npm run update                 # git pull + build + pm2 restart (host)"
Write-Host "  npm run pm2:logs               # tail logs"
Write-Host "  npm run pm2:restart            # restart only (no pull/build)"
Write-Host "  npm run pm2:register-autostart # only re-register logon task"
Write-Host "  npm run pm2:autostart          # run autostart script now (test)"
Write-Host ""
if ($autostartOk) {
  Write-Host "Autostart: registered (Task and/or Startup folder). Log in as '$env:USERNAME' after reboot."
  Write-Host "Log: $(Join-Path $Root 'logs\pm2-autostart.log')"
}
else {
  Write-Host "Autostart registration had errors. Run AS ADMINISTRATOR:"
  Write-Host "  npm run pm2:register-autostart"
  Write-Host "Or create task manually (taskschd.msc) -> at logon ->"
  Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File `"$AutostartPs1`""
}
Write-Host "LAN: allow inbound TCP $port in Windows Firewall if needed."

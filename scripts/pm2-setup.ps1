# ProperService: install/start with pm2 + reliable Windows autostart (no Docker).
# Builds only if .next is missing (via start-prod.ps1 -PrepareOnly).
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

$AppName = "properservice"
$TaskName = "ProperService-pm2"
$AutostartPs1 = Join-Path $PSScriptRoot "pm2-autostart.ps1"

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
$eco = Join-Path $Root "ecosystem.config.cjs"
if (-not (Test-Path $eco)) {
  Write-Error "Missing $eco"
  exit 1
}

# First run: process may not exist. Avoid terminating errors from pm2.ps1.
Write-Host "    [1/4] pm2 delete $AppName (ignore if missing)..."
cmd.exe /c "pm2 delete $AppName >nul 2>&1" | Out-Null

# If an old daemon is wedged, a plain "pm2 start" can hang forever on Windows.
Write-Host "    [2/4] ensuring pm2 daemon is up (pm2 ping)..."
$pingOk = $false
try {
  $pingOut = cmd.exe /c "pm2 ping" 2>&1 | Out-String
  if ($pingOut -match "pong|PM2") { $pingOk = $true }
  Write-Host "    pm2 ping: $($pingOut.Trim())"
}
catch {
  Write-Host "    pm2 ping threw: $_"
}

if (-not $pingOk) {
  Write-Host "    daemon not responding - pm2 kill + retry..."
  cmd.exe /c "pm2 kill >nul 2>&1" | Out-Null
  Start-Sleep -Seconds 2
}

Write-Host "    [3/4] pm2 start ecosystem.config.cjs ..."
Write-Host "    (first time can take 15-60s; if stuck >2 min press Ctrl+C and see docs below)"
# Use cmd so npm/powershell do not wait on node child stdio oddly
cmd.exe /c "pm2 start `"$eco`""
if ($LASTEXITCODE -ne 0) {
  Write-Error "pm2 start failed (exit $LASTEXITCODE). Try manually: pm2 kill && pm2 start ecosystem.config.cjs"
  exit $LASTEXITCODE
}

Write-Host "    [4/4] pm2 save ..."
cmd.exe /c "pm2 save"
if ($LASTEXITCODE -ne 0) {
  Write-Warning "pm2 save failed (exit $LASTEXITCODE) - autostart may not restore processes"
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
Write-Host "  npm run pm2:logs               # tail logs"
Write-Host "  npm run pm2:restart            # after code changes + npm run build"
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

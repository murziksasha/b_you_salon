# Runs at Windows logon (Task Scheduler). Restores pm2 process for ProperService.
# Does not depend on interactive PATH: injects common Node/npm locations.
$ErrorActionPreference = "Continue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $Root "logs"
$LogFile = Join-Path $LogDir "pm2-autostart.log"
$AppName = "byou"
$Eco = Join-Path $Root "ecosystem.config.cjs"
. (Join-Path $PSScriptRoot "pm2-win.ps1")

function Write-Log {
  param([string]$Message)
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  try {
    if (-not (Test-Path $LogDir)) {
      New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
  }
  catch { }
  Write-Host $line
}

function Ensure-NodePath {
  $candidates = @(
    "C:\Program Files\nodejs",
    "C:\Program Files (x86)\nodejs",
    (Join-Path $env:APPDATA "npm"),
    (Join-Path $env:LOCALAPPDATA "pnpm"),
    (Join-Path $env:ProgramFiles "nodejs")
  )
  $parts = @()
  foreach ($p in $candidates) {
    if ($p -and (Test-Path $p)) {
      $parts += $p
    }
  }
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = ($parts -join ";") + ";" + $machine + ";" + $user
}

function Test-HasCommand {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-AppOnline {
  if (-not (Test-HasCommand "pm2")) { return $false }
  try {
    $json = & pm2 jlist 2>$null
    if (-not $json) { return $false }
    $apps = $json | ConvertFrom-Json
    foreach ($a in $apps) {
      if ($a.name -eq $AppName -and $a.pm2_env.status -eq "online") {
        return $true
      }
    }
  }
  catch { }
  return $false
}

Write-Log "=== pm2-autostart begin (user=$env:USERNAME root=$Root) ==="
Ensure-NodePath
Set-Location $Root

# Give disk / profile a moment after logon
Start-Sleep -Seconds 10

if (-not (Test-HasCommand "node")) {
  Write-Log "ERROR: node not found in PATH. PATH=$env:Path"
  exit 1
}
if (-not (Test-HasCommand "pm2")) {
  Write-Log "ERROR: pm2 not found. Install: npm install -g pm2"
  exit 1
}

Write-Log "node=$(node -v) pm2 ok"

# 1) Prefer resurrect from last pm2 save
Write-Log "Trying pm2 resurrect..."
[void](Invoke-Pm2Timed -Pm2Args "resurrect" -TimeoutSec 40)
Start-Sleep -Seconds 3

if (Test-AppOnline) {
  Write-Log "OK: $AppName online after resurrect"
  exit 0
}

Write-Log "resurrect did not bring $AppName online - starting ecosystem..."

if (-not (Test-Path $Eco)) {
  Write-Log "ERROR: missing $Eco"
  exit 1
}
if (-not (Test-Path (Join-Path $Root ".next\BUILD_ID"))) {
  Write-Log "WARN: .next/BUILD_ID missing - next start may fail until npm run build"
}

[void](Invoke-Pm2Timed -Pm2Args "delete $AppName" -TimeoutSec 20)
$startCode = Invoke-Pm2Timed -Pm2Args "start ecosystem.config.cjs" -TimeoutSec 90
if ($startCode -ne 0) {
  Write-Log "ERROR: pm2 start failed exit=$startCode"
  exit $startCode
}

[void](Invoke-Pm2Timed -Pm2Args "save --force" -TimeoutSec 30)
Start-Sleep -Seconds 2

if (Test-AppOnline) {
  Write-Log "OK: $AppName online after pm2 start"
  exit 0
}

Write-Log "ERROR: $AppName still not online. Run: pm2 logs $AppName"
exit 1

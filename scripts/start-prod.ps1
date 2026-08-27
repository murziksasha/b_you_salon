# ProperService: production start without Docker.
# Builds only if .next/BUILD_ID is missing; listens on 0.0.0.0 for LAN/KeenDNS.
param(
  [switch]$PrepareOnly
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

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

function Install-AppDeps {
  if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Host "node_modules missing - installing dependencies..."
    if (Test-Path (Join-Path $Root "package-lock.json")) {
      npm ci
    }
    else {
      npm install
    }
    if ($LASTEXITCODE -ne 0) {
      Write-Error "npm install/ci failed (exit $LASTEXITCODE)"
      exit $LASTEXITCODE
    }
  }
}

function Build-AppIfNeeded {
  $buildId = Join-Path $Root ".next\BUILD_ID"
  if (-not (Test-Path $buildId)) {
    Write-Host ".next build missing - running npm run build..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
      Write-Error "npm run build failed (exit $LASTEXITCODE)"
      exit $LASTEXITCODE
    }
  }
  else {
    Write-Host "Using existing build (.next/BUILD_ID present)."
  }
}

if (-not (Test-HasCommand "node")) {
  Write-Error "Required command not found: node. Install Node.js LTS and ensure it is in PATH."
  exit 1
}
if (-not (Test-HasCommand "npm")) {
  Write-Error "Required command not found: npm. Install Node.js LTS and ensure it is in PATH."
  exit 1
}

Install-AppDeps
Build-AppIfNeeded

if ($PrepareOnly) {
  Write-Host "Prepare done (deps + build-if-needed)."
  exit 0
}

$port = Read-AppPort
Write-Host "Starting Next.js on 0.0.0.0:$port (Ctrl+C to stop)..."
$nextBin = Join-Path $Root "node_modules\next\dist\bin\next"
if (-not (Test-Path $nextBin)) {
  Write-Error "Next.js binary not found at $nextBin. Run npm install."
  exit 1
}
node $nextBin start -H 0.0.0.0 -p $port
exit $LASTEXITCODE

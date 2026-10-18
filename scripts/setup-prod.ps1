# Initializes the isolated production directory on this laptop.
# Clones repo, transfers current data and uploads, sets PORT=3000, installs and builds.
param(
  [string]$TargetDir = "F:\SSD PROJECT\b_you_salon_prod"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

Write-Host "==== Setting up Production Environment ===="
Write-Host "Dev workspace:  $Root"
Write-Host "Prod workspace: $TargetDir"

if (-not (Test-Path $TargetDir)) {
  Write-Host "==> Cloning repository into $TargetDir..."
  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
  
  # Clone from local repo to get the exact current branch and commits immediately
  $branch = (cmd.exe /c "git rev-parse --abbrev-ref HEAD").Trim()
  if (-not $branch -or $branch -eq "HEAD") { $branch = "refactorFSD" }
  
  cmd.exe /c "git clone --branch $branch `"$Root`" `"$TargetDir`""
  if ($LASTEXITCODE -ne 0) {
    Write-Error "git clone failed"
    exit 1
  }

  # Point origin to GitHub if available
  $remoteUrl = (cmd.exe /c "git remote get-url origin").Trim()
  if ($remoteUrl) {
    Set-Location $TargetDir
    cmd.exe /c "git remote set-url origin $remoteUrl"
    Set-Location $Root
  }
}
else {
  Write-Host "==> Production directory already exists at $TargetDir."
}

# 1. Copy runtime data files from dev into prod
$prodData = Join-Path $TargetDir "data"
$devData = Join-Path $Root "data"
if (-not (Test-Path $prodData)) {
  New-Item -ItemType Directory -Force -Path $prodData | Out-Null
}

Write-Host "==> Copying initial runtime data to production..."
Get-ChildItem -Path $devData -File -ErrorAction SilentlyContinue | ForEach-Object {
  $targetFile = Join-Path $prodData $_.Name
  if (-not (Test-Path $targetFile)) {
    Copy-Item -LiteralPath $_.FullName -Destination $targetFile -Force
    Write-Host "    Copied: $($_.Name)"
  }
}

# Ensure backups directory exists in prod
$prodBackups = Join-Path $prodData "backups"
if (-not (Test-Path $prodBackups)) {
  New-Item -ItemType Directory -Force -Path $prodBackups | Out-Null
}

# 2. Copy uploads to prod
$devUploads = Join-Path $Root "public\uploads"
$prodUploads = Join-Path $TargetDir "public\uploads"
if (Test-Path $devUploads) {
  Write-Host "==> Syncing initial uploads to production..."
  if (-not (Test-Path $prodUploads)) {
    New-Item -ItemType Directory -Force -Path $prodUploads | Out-Null
  }
  robocopy $devUploads $prodUploads /E /XO /NP /NFL /NDL /NJH /NJS | Out-Null
}

# 3. Setup prod .env with PORT=3000
$devEnv = Join-Path $Root ".env"
$prodEnv = Join-Path $TargetDir ".env"
if (Test-Path $devEnv) {
  if (-not (Test-Path $prodEnv)) {
    Write-Host "==> Creating production .env configured for port 3000..."
    $content = Get-Content $devEnv -Raw
    # Ensure PORT is 3000 in prod
    if ($content -match "PORT\s*=\s*\d+") {
      $content = $content -replace "PORT\s*=\s*\d+", "PORT=3000"
    }
    else {
      $content += "`nPORT=3000`n"
    }
    Set-Content -Path $prodEnv -Value $content -Encoding utf8
  }
}

# 4. Save PROD_PATH in dev .env if not present
$hasProdPath = $false
if (Test-Path $devEnv) {
  $devEnvLines = Get-Content $devEnv
  foreach ($l in $devEnvLines) {
    if ($l -match "^\s*PROD_PATH\s*=") {
      $hasProdPath = $true
      break
    }
  }
  if (-not $hasProdPath) {
    Add-Content -Path $devEnv -Value "`nPROD_PATH=$TargetDir" -Encoding utf8
    Write-Host "==> Added PROD_PATH=$TargetDir to dev .env"
  }
}

# 5. Install dependencies and build prod
Write-Host "==> Installing dependencies in production..."
Set-Location $TargetDir
cmd.exe /c "npm ci"
if ($LASTEXITCODE -ne 0) {
  cmd.exe /c "npm install"
}

Write-Host "==> Building production Next.js application..."
cmd.exe /c "npm run build"
if ($LASTEXITCODE -ne 0) {
  Write-Error "Production build failed"
  Set-Location $Root
  exit 1
}

Set-Location $Root
Write-Host "==== Production setup complete! ===="
Write-Host "To start production, run from $TargetDir:"
Write-Host "  npm run start:prod   (or npm run pm2:setup)"
Write-Host "To update production anytime from dev, run:"
Write-Host "  npm run deploy:prod"

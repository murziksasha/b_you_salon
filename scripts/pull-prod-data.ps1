# Copies CMS content (site.json from latest prod backup) and public/uploads
# from the production instance into development.
# Leaves customer leads.json and orders.json clean/empty in dev.
param(
  [string]$ProdPath = ""
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

function Resolve-ProdDirectory {
  if ($ProdPath -and (Test-Path $ProdPath)) {
    return (Resolve-Path $ProdPath).Path
  }
  if ($env:PROD_PATH -and (Test-Path $env:PROD_PATH)) {
    return (Resolve-Path $env:PROD_PATH).Path
  }

  $envFile = Join-Path $Root ".env"
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile -ErrorAction SilentlyContinue) {
      if ($line -match "^\s*PROD_PATH\s*=\s*(.*)$") {
        $p = $Matches[1].Trim().Trim('"').Trim("'")
        if ($p -and (Test-Path $p)) {
          return (Resolve-Path $p).Path
        }
      }
    }
  }

  $sibling = Join-Path $Root "..\b_you_salon_prod"
  if (Test-Path $sibling) {
    return (Resolve-Path $sibling).Path
  }

  return ""
}

$prod = Resolve-ProdDirectory
if (-not $prod) {
  Write-Error "Production directory not found. Please set PROD_PATH in .env or pass -ProdPath 'F:\SSD PROJECT\b_you_salon_prod'."
  exit 1
}

Write-Host "==> Source production directory: $prod"
Write-Host "==> Target dev directory:        $Root"

$prodData = Join-Path $prod "data"
$devData = Join-Path $Root "data"
if (-not (Test-Path $devData)) {
  New-Item -ItemType Directory -Force -Path $devData | Out-Null
}

# 1. Locate latest CMS backup in prod
$prodBackups = Join-Path $prodData "backups"
$latestBackup = $null
if (Test-Path $prodBackups) {
  $latestBackup = Get-ChildItem -Path $prodBackups -Filter "site-*.json" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

$sourceSiteJson = $null
if ($latestBackup) {
  $sourceSiteJson = $latestBackup.FullName
  Write-Host "==> Using latest prod backup: $($latestBackup.Name)"
}
elseif (Test-Path (Join-Path $prodData "site.json")) {
  $sourceSiteJson = Join-Path $prodData "site.json"
  Write-Host "==> No backups found in prod; falling back to prod data/site.json"
}
else {
  Write-Error "Could not find site.json or backups in $prodData."
  exit 1
}

# 2. Local dev backup before overwriting
$devSiteJson = Join-Path $devData "site.json"
if (Test-Path $devSiteJson) {
  $devBackups = Join-Path $devData "backups"
  if (-not (Test-Path $devBackups)) {
    New-Item -ItemType Directory -Force -Path $devBackups | Out-Null
  }
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $safetyBackup = Join-Path $devBackups "site-pre-pull-$stamp.json"
  Copy-Item -LiteralPath $devSiteJson -Destination $safetyBackup -Force
  Write-Host "==> Saved local dev backup: $safetyBackup"
}

# 3. Copy CMS site data
Copy-Item -LiteralPath $sourceSiteJson -Destination $devSiteJson -Force
Write-Host "==> Successfully updated dev data/site.json from production"

# 4. Mirror public/uploads
$prodUploads = Join-Path $prod "public\uploads"
$devUploads = Join-Path $Root "public\uploads"
if (Test-Path $prodUploads) {
  if (-not (Test-Path $devUploads)) {
    New-Item -ItemType Directory -Force -Path $devUploads | Out-Null
  }
  Write-Host "==> Syncing public/uploads from prod..."
  robocopy $prodUploads $devUploads /E /XO /NP /NFL /NDL /NJH /NJS | Out-Null
  Write-Host "==> public/uploads synced."
}
else {
  Write-Host "==> No public/uploads found in prod; skipping media sync."
}

# 5. Ensure leads and orders are clean in dev
$leadsFile = Join-Path $devData "leads.json"
if (-not (Test-Path $leadsFile)) {
  Set-Content -Path $leadsFile -Value "[]`n" -Encoding utf8
  Write-Host "==> Initialized clean dev leads.json"
}

$ordersFile = Join-Path $devData "orders.json"
if (-not (Test-Path $ordersFile)) {
  Set-Content -Path $ordersFile -Value "[]`n" -Encoding utf8
  Write-Host "==> Initialized clean dev orders.json"
}

Write-Host "==== Dev data sync complete ===="

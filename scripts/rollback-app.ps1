# B_You host rollback: npm run rollback
# Restores previous release commit and .next build, then restarts PM2

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

$AppName = "byou"
$TgName = "byou-telegram"
$Eco = Join-Path $Root "ecosystem.config.cjs"
$prevShaFile = Join-Path $Root ".release-prev.sha"
$activeNext = Join-Path $Root ".next"
$prevNext = Join-Path $Root ".next.prev"
$failedNext = Join-Path $Root ".next.failed"

Write-Host "==== B_You host rollback ===="

# 1. Stop PM2 processes
Write-Host "==> Stopping PM2 processes..."
cmd.exe /c "pm2 stop $AppName $TgName >nul 2>&1" | Out-Null

# 2. Restore git commit if previous SHA saved
if (Test-Path $prevShaFile) {
  $sha = (Get-Content $prevShaFile -Raw).Trim()
  if ($sha) {
    Write-Host "==> Checking out previous release SHA $sha..."
    cmd.exe /c "git checkout $sha"
  }
}

# 3. Swap .next.prev -> .next
if (Test-Path $prevNext) {
  Write-Host "==> Restoring previous .next directory..."
  if (Test-Path $failedNext) {
    Remove-Item -Recurse -Force -LiteralPath $failedNext -ErrorAction SilentlyContinue
  }
  if (Test-Path $activeNext) {
    Move-Item -LiteralPath $activeNext -Destination $failedNext -Force
  }
  Move-Item -LiteralPath $prevNext -Destination $activeNext -Force
} else {
  Write-Warning "No .next.prev found. Rebuilding from restored source..."
  cmd.exe /c "npm run build"
}

# 4. Restart PM2
Write-Host "==> Restarting PM2 ($AppName, $TgName)..."
cmd.exe /c "pm2 restart $AppName --update-env"
cmd.exe /c "pm2 restart $TgName --update-env"
cmd.exe /c "pm2 save"
cmd.exe /c "pm2 status"

# 5. Check health
$port = 3000
$fromEnv = $env:PORT
if ($fromEnv -match "^\d+$") { $port = [int]$fromEnv }
$healthUrl = "http://127.0.0.1:$port/api/health"
Write-Host "==> Checking health at $healthUrl..."
Start-Sleep -Seconds 3
try {
  $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
  Write-Host "Health probe response: $($resp.StatusCode)"
} catch {
  Write-Warning "Health check returned error: $_"
}

Write-Host "==== Rollback complete ===="


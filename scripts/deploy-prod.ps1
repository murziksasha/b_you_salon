# Deploys updates from Dev to the isolated Production instance on this laptop.
# Pushes local commits and executes scripts/update-app.ps1 in the prod directory.
param(
  [string]$ProdPath = "",
  [switch]$SkipPush
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
  Write-Error "Production directory not found. Run 'npm run prod:setup' first or set PROD_PATH in .env."
  exit 1
}

$branch = (cmd.exe /c "git rev-parse --abbrev-ref HEAD").Trim()
if (-not $branch -or $branch -eq "HEAD") {
  Write-Error "Cannot deploy from detached HEAD. Please check out a branch."
  exit 1
}

Write-Host "==== Deploying to Production ===="
Write-Host "Dev workspace:  $Root"
Write-Host "Prod workspace: $prod"
Write-Host "Branch:         $branch"

# Check for uncommitted tracked changes
$dirty = cmd.exe /c "git status --porcelain --untracked-files=no"
if ($dirty) {
  Write-Warning "You have uncommitted changes in Dev:"
  $dirty | ForEach-Object { Write-Warning "  $_" }
  Write-Host "Deploying only committed changes already in branch $branch."
}

# Push to origin unless skipped
if (-not $SkipPush) {
  Write-Host "==> Pushing $branch to origin..."
  cmd.exe /c "git push origin $branch"
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "git push to origin failed or remote was unreachable. Trying local sync..."
  }
}

# Trigger update in prod directory
$updateScript = Join-Path $prod "scripts\update-app.ps1"
if (-not (Test-Path $updateScript)) {
  Write-Error "Production update script not found at $updateScript."
  exit 1
}

Write-Host "==> Executing update-app.ps1 in production..."
Set-Location $prod
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $updateScript -Branch $branch
$deployExit = $LASTEXITCODE

Set-Location $Root

if ($deployExit -ne 0) {
  Write-Error "Production update returned exit code $deployExit."
  exit $deployExit
}

Write-Host "==== Production deployment successful! ===="

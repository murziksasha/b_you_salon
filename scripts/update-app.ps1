# Host update — one command: npm run update
# backup CMS JSON, fetch, checkout deploy branch, ff-only pull, install if needed,
# always build, pm2 restart byou, health check.
#
# Deploy branch (first match wins): -Branch, env DEPLOY_BRANCH, .env DEPLOY_BRANCH, else `dev`.
#
#   npm run update
#   npm run update -- -SkipPull
#   npm run update -- -SkipBackup
#   npm run update -- -SkipHealth
#   npm run update -- -Branch dev
param(
  [switch]$SkipPull,
  [switch]$SkipBackup,
  [switch]$SkipHealth,
  [string]$Branch = ""
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

$AppName = "byou"
$LegacyAppName = "properservice"
$Eco = Join-Path $Root "ecosystem.config.cjs"
$HealthTimeoutSec = 30

function Test-HasCommand {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $machine + ";" + $user
}

function Read-DotEnvValue {
  param([string]$Name)
  $envFile = Join-Path $Root ".env"
  if (-not (Test-Path $envFile)) { return $null }
  foreach ($line in Get-Content $envFile -ErrorAction SilentlyContinue) {
    if ($line -match ("^\s*" + [regex]::Escape($Name) + "\s*=\s*(.*?)\s*$")) {
      $v = $Matches[1].Trim().Trim('"').Trim("'")
      if ($v) { return $v }
    }
  }
  return $null
}

function Read-AppPort {
  $port = 3000
  $fromEnv = Read-DotEnvValue "PORT"
  if ($fromEnv -match "^\d+$") { $port = [int]$fromEnv }
  if ($env:PORT -match "^\d+$") { $port = [int]$env:PORT }
  return $port
}

function Read-DeployBranch {
  if ($Branch) { return $Branch.Trim() }
  if ($env:DEPLOY_BRANCH) { return $env:DEPLOY_BRANCH.Trim() }
  $fromFile = Read-DotEnvValue "DEPLOY_BRANCH"
  if ($fromFile) { return $fromFile }
  return "dev"
}

function Get-FileSha256 {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return "" }
  return (Get-FileHash -Path $Path -Algorithm SHA256).Hash
}

function Invoke-Git {
  param([string]$GitArgs)
  # Out-Host: git stdout ("Already up to date.") must not join the return value.
  # `$code = Invoke-Git ...` would otherwise become an array and `-ne 0` a filter.
  Write-Host "    git $GitArgs"
  cmd.exe /c "git $GitArgs" | Out-Host
  if ($null -eq $LASTEXITCODE) { return 0 }
  return [int]$LASTEXITCODE
}

function Get-CurrentBranch {
  $name = (cmd.exe /c "git rev-parse --abbrev-ref HEAD").Trim()
  if (-not $name -or $name -eq "HEAD") { return "" }
  return $name
}

function Get-Pm2Apps {
  if (-not (Test-HasCommand "pm2")) { return @() }
  try {
    $raw = & pm2 jlist 2>$null
    if (-not $raw) { return @() }
    $apps = $raw | ConvertFrom-Json
    if ($null -eq $apps) { return @() }
    if ($apps -is [System.Array]) { return @($apps) }
    return @($apps)
  }
  catch {
    return @()
  }
}

function Test-Pm2Named {
  param(
    [string]$Name,
    [string]$Status = ""
  )
  foreach ($a in Get-Pm2Apps) {
    if ($a.name -eq $Name) {
      if (-not $Status) { return $true }
      if ($a.pm2_env.status -eq $Status) { return $true }
    }
  }
  return $false
}

function Test-LockishBuildError {
  param([string]$Text)
  if (-not $Text) { return $false }
  return ($Text -match "EBUSY|EPERM|EACCES|EAGAIN|being used by another process|resource busy or locked|locked")
}

function Backup-CmsJson {
  $dataDir = Join-Path $Root "data"
  if (-not (Test-Path $dataDir)) {
    Write-Warning "data/ missing - nothing to backup"
    return
  }
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $dest = Join-Path $dataDir "backups\pre-update-$stamp"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  $copied = 0
  Get-ChildItem -Path $dataDir -Filter "*.json" -File -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dest $_.Name) -Force
    $copied++
  }
  Write-Host "CMS backup: $dest ($copied json file(s))"
}

function Get-TrackedDirty {
  $raw = cmd.exe /c "git status --porcelain --untracked-files=no" | Out-String
  if ($LASTEXITCODE -ne 0) {
    Write-Error "git status failed"
    exit 1
  }
  $lines = @()
  foreach ($line in ($raw -split "`r?`n")) {
    $t = $line.Trim()
    if ($t) { $lines += $t }
  }
  return $lines
}

function Invoke-AppBuild {
  $logDir = Join-Path $Root "logs"
  if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  }
  $buildLog = Join-Path $logDir "update-build.log"
  Write-Host "==> npm run build"
  Write-Host "    log: $buildLog"
  # cmd so LASTEXITCODE is npm's (a PowerShell pipeline would report Tee-Object's 0).
  # Relative log path: repo root can contain spaces (cmd quoting).
  cmd.exe /c "npm run build > logs\update-build.log 2>&1"
  $code = $LASTEXITCODE
  $text = ""
  if (Test-Path $buildLog) {
    Get-Content -Path $buildLog | ForEach-Object { Write-Host $_ }
    $text = Get-Content -Path $buildLog -Raw -ErrorAction SilentlyContinue
  }
  return @{ Code = $code; Log = $text }
}

Update-SessionPath

if (-not (Test-HasCommand "node")) {
  Write-Error "Required command not found: node. Install Node.js LTS and ensure it is in PATH."
  exit 1
}
if (-not (Test-HasCommand "npm")) {
  Write-Error "Required command not found: npm. Install Node.js LTS and ensure it is in PATH."
  exit 1
}
if (-not (Test-HasCommand "pm2")) {
  Write-Error "pm2 not found. On the host run: npm run pm2:setup"
  exit 1
}
if (-not (Test-Path (Join-Path $Root ".env"))) {
  Write-Error "Missing .env in $Root. Copy .env.example and set secrets before updating."
  exit 1
}
if (-not (Test-Path $Eco)) {
  Write-Error "Missing $Eco"
  exit 1
}

Write-Host "==== B_You host update ===="
Write-Host "Root: $Root"
Write-Host "PM2:  $AppName"
$deployHint = Read-DeployBranch
if ($deployHint) { Write-Host "Branch: $deployHint (DEPLOY_BRANCH)" }
if ($deployHint -eq "startProjectOnHost") {
  Write-Warning "DEPLOY_BRANCH=startProjectOnHost is obsolete. GitHub default is 'dev'. Set DEPLOY_BRANCH=dev in .env, then re-run npm run update."
}

if (-not $SkipBackup) {
  Write-Host "==> Backup CMS JSON (data/*.json)..."
  Backup-CmsJson
}
else {
  Write-Host "==> SkipBackup: not copying data/*.json"
}

$pkgBefore = Get-FileSha256 (Join-Path $Root "package.json")
$lockBefore = Get-FileSha256 (Join-Path $Root "package-lock.json")

if (-not $SkipPull) {
  if (-not (Test-HasCommand "git")) {
    Write-Error "git not found. Install Git for Windows or pass -SkipPull to rebuild without pulling."
    exit 1
  }
  if (-not (Test-Path (Join-Path $Root ".git"))) {
    Write-Error "Not a git checkout ($Root). Copy the repo with git clone, or pass -SkipPull."
    exit 1
  }

  $dirty = Get-TrackedDirty
  if ($dirty.Count -gt 0) {
    Write-Host "Tracked files have local changes:"
    $dirty | ForEach-Object { Write-Host "  $_" }
    Write-Error "Refuse to pull over a dirty tree. Commit/stash on a dev machine, or restore host files. Do not run npm run seed on the host."
    exit 1
  }

  Write-Host "==> git fetch origin..."
  $code = Invoke-Git "fetch origin"
  if ($code -ne 0) {
    Write-Error "git fetch origin failed (exit $code)"
    exit $code
  }

  $want = Read-DeployBranch
  if ($want) {
    if ($want -notmatch '^[\w./-]+$') {
      Write-Error "Invalid DEPLOY_BRANCH / -Branch value: $want"
      exit 1
    }
    $now = Get-CurrentBranch
    if ($now -ne $want) {
      Write-Host "==> git checkout $want (DEPLOY_BRANCH)..."
      $code = Invoke-Git "checkout $want"
      if ($code -ne 0) {
        $code = Invoke-Git "checkout -B $want origin/$want"
      }
      if ($code -ne 0) {
        Write-Error "git checkout $want failed (exit $code). Create the branch on origin or unset DEPLOY_BRANCH."
        exit $code
      }
    }
  }

  $head = Get-CurrentBranch
  if (-not $head) {
    Write-Error "Detached HEAD. Check out a branch (or set DEPLOY_BRANCH in .env), then re-run npm run update."
    exit 1
  }

  Write-Host "==> git pull --ff-only origin $head..."
  $code = Invoke-Git "pull --ff-only origin $head"
  if ($code -ne 0) {
    Write-Error "git pull --ff-only origin $head failed (exit $code). Fix history on the dev machine; do not force-pull on the host."
    exit $code
  }
}
else {
  Write-Host "==> SkipPull: using the files already on disk"
}

$needInstall = $false
if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "node_modules missing"
  $needInstall = $true
}
else {
  $pkgAfter = Get-FileSha256 (Join-Path $Root "package.json")
  $lockAfter = Get-FileSha256 (Join-Path $Root "package-lock.json")
  if ($pkgAfter -ne $pkgBefore -or $lockAfter -ne $lockBefore) {
    Write-Host "package.json / package-lock.json changed"
    $needInstall = $true
  }
}

if ($needInstall) {
  $lockPath = Join-Path $Root "package-lock.json"
  if (Test-Path $lockPath) {
    Write-Host "==> npm ci"
    npm ci
  }
  else {
    Write-Host "==> npm install (no package-lock.json)"
    npm install
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install/ci failed (exit $LASTEXITCODE). PM2 was not restarted."
    exit $LASTEXITCODE
  }
}
else {
  Write-Host "==> Dependencies unchanged, skipping npm ci"
}

Write-Host "==> Build (always; existing .next is not reused)..."
$build = Invoke-AppBuild
$stoppedForLock = $false

if ($build.Code -ne 0 -and (Test-LockishBuildError $build.Log)) {
  Write-Host "Build hit a file lock (likely next start holding .next). Stopping pm2 $AppName and retrying..."
  cmd.exe /c "pm2 stop $AppName >nul 2>&1" | Out-Null
  $stoppedForLock = $true
  $build = Invoke-AppBuild
}

if ($build.Code -ne 0) {
  Write-Error "npm run build failed (exit $($build.Code)). Not restarting pm2 - .next may be incomplete. See logs/update-build.log"
  exit $build.Code
}

if (Test-Pm2Named -Name $LegacyAppName) {
  Write-Host "Removing leftover pm2 process '$LegacyAppName' (canonical name is $AppName)..."
  cmd.exe /c "pm2 delete $LegacyAppName >nul 2>&1" | Out-Null
}

Write-Host "==> pm2 restart $AppName..."
if (Test-Pm2Named -Name $AppName) {
  cmd.exe /c "pm2 restart $AppName --update-env"
  if ($LASTEXITCODE -ne 0) {
    Write-Error "pm2 restart $AppName failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
  }
}
else {
  Write-Host "Process $AppName missing - pm2 start ecosystem.config.cjs"
  cmd.exe /c "pm2 start ecosystem.config.cjs"
  if ($LASTEXITCODE -ne 0) {
    Write-Error "pm2 start failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
  }
}

cmd.exe /c "pm2 save"
cmd.exe /c "pm2 status"

$port = Read-AppPort
$healthUrl = "http://127.0.0.1:$port/api/health"

if (-not $SkipHealth) {
  Write-Host "==> Health $healthUrl ..."
  $deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
  $healthy = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
      if ($resp.StatusCode -eq 200) {
        $body = $resp.Content | ConvertFrom-Json
        if ($body.ok -eq $true) {
          $healthy = $true
          Write-Host "Health OK: $($resp.Content)"
          break
        }
      }
    }
    catch {
      Start-Sleep -Seconds 2
      continue
    }
    Start-Sleep -Seconds 2
  }
  if (-not $healthy) {
    Write-Error "Build and pm2 restart finished, but $healthUrl did not return ok within ${HealthTimeoutSec}s. Check: npm run pm2:logs"
    exit 1
  }
}
else {
  Write-Host "==> SkipHealth"
}

Write-Host ""
Write-Host "==== Update complete ===="
Write-Host "Health:  $healthUrl"
Write-Host "Site:    http://localhost:$port"
Write-Host "Admin:   http://localhost:$port/admin"
if ($stoppedForLock) {
  Write-Host "Note: pm2 was stopped briefly so next build could write .next on Windows."
}
Write-Host "Do not run npm run seed on the host (it overwrites live CMS data)."
Write-Host "Next update: npm run update"

# Copy data/ and public/uploads to an off-site folder (USB, SMB, etc.)
# Usage:
#   .\scripts\backup-offsite.ps1 -Dest "D:\backups\properservice"
#   .\scripts\backup-offsite.ps1 -Dest "\\nas\share\properservice"
param(
  [Parameter(Mandatory = $true)]
  [string]$Dest
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $Dest $stamp

New-Item -ItemType Directory -Force -Path $target | Out-Null

$dataSrc = Join-Path $Root "data"
$uploadsSrc = Join-Path $Root "public\uploads"

if (Test-Path $dataSrc) {
  Copy-Item -Recurse -Force $dataSrc (Join-Path $target "data")
  Write-Host "Copied data/ -> $target\data"
} else {
  Write-Warning "data/ missing"
}

if (Test-Path $uploadsSrc) {
  Copy-Item -Recurse -Force $uploadsSrc (Join-Path $target "uploads")
  Write-Host "Copied public/uploads -> $target\uploads"
} else {
  Write-Warning "public/uploads missing"
}

Write-Host "Off-site backup done: $target"

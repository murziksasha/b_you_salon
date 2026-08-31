# Rotate ADMIN_PASSWORD and/or SESSION_SECRET in project .env
#
# Examples:
#   # Generate new SESSION_SECRET only (keep password)
#   .\scripts\rotate-secrets.ps1
#
#   # Set a new admin password interactively (hidden input)
#   .\scripts\rotate-secrets.ps1 -SetPassword
#
#   # Set password from argument (visible in shell history — avoid on shared PCs)
#   .\scripts\rotate-secrets.ps1 -AdminPassword "YourNewStrongPassword"
#
#   # Only password, do not touch SESSION_SECRET
#   .\scripts\rotate-secrets.ps1 -SetPassword -SkipSessionSecret
#
# After run: restart the app (npm start / docker compose / pm2) so new values load.

param(
  [string]$AdminPassword = "",
  [switch]$SetPassword,
  [switch]$SkipSessionSecret,
  [switch]$SkipPassword,
  [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $EnvFile) {
  $EnvFile = Join-Path $Root ".env"
}

if (-not (Test-Path $EnvFile)) {
  $example = Join-Path $Root ".env.example"
  if (Test-Path $example) {
    Copy-Item $example $EnvFile
    Write-Host "Created .env from .env.example"
  } else {
    throw ".env not found at $EnvFile"
  }
}

function New-SessionSecret {
  # 32 bytes hex = 64 chars (enough for HMAC cookie signing)
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return (-join ($bytes | ForEach-Object { $_.ToString("x2") }))
}

function Read-HiddenPassword {
  param([string]$Prompt = "New ADMIN_PASSWORD")
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Set-EnvKey {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )
  $lines = @(Get-Content -LiteralPath $Path -ErrorAction Stop)
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match "^\s*#") {
      $line
      continue
    }
    if ($line -match "^\s*$Key\s*=") {
      $found = $true
      "$Key=$Value"
    } else {
      $line
    }
  }
  if (-not $found) {
    $out = @($out) + "$Key=$Value"
  }
  # UTF-8 without BOM
  [System.IO.File]::WriteAllLines($Path, $out, [System.Text.UTF8Encoding]::new($false))
}

$changed = @()

# --- SESSION_SECRET ---
if (-not $SkipSessionSecret) {
  $secret = New-SessionSecret
  Set-EnvKey -Path $EnvFile -Key "SESSION_SECRET" -Value $secret
  $changed += "SESSION_SECRET (new random 64-char hex)"
  Write-Host "OK  SESSION_SECRET updated"
} else {
  Write-Host "SKIP SESSION_SECRET"
}

# --- ADMIN_PASSWORD ---
if (-not $SkipPassword) {
  $pwd = $AdminPassword
  if ($SetPassword -or -not $pwd) {
    if (-not $pwd) {
      if (-not $SetPassword -and -not $AdminPassword) {
        # Default: only rotate session unless user asked for password
        if (-not $SetPassword) {
          Write-Host "SKIP ADMIN_PASSWORD (pass -SetPassword or -AdminPassword to change)"
          $pwd = $null
        }
      }
    }
  }

  if ($SetPassword -and -not $AdminPassword) {
    $pwd = Read-HiddenPassword -Prompt "New ADMIN_PASSWORD"
    $pwd2 = Read-HiddenPassword -Prompt "Repeat ADMIN_PASSWORD"
    if ($pwd -ne $pwd2) {
      throw "Passwords do not match"
    }
  } elseif ($AdminPassword) {
    $pwd = $AdminPassword
  }

  if ($pwd) {
    if ($pwd.Length -lt 10) {
      Write-Warning "Password is shorter than 10 characters — consider a stronger one."
    }
    Set-EnvKey -Path $EnvFile -Key "ADMIN_PASSWORD" -Value $pwd
    $changed += "ADMIN_PASSWORD"
    Write-Host "OK  ADMIN_PASSWORD updated"
  }
} else {
  Write-Host "SKIP ADMIN_PASSWORD"
}

Write-Host ""
Write-Host "File: $EnvFile"
if ($changed.Count -eq 0) {
  Write-Host "Nothing changed. Examples:"
  Write-Host "  .\scripts\rotate-secrets.ps1"
  Write-Host "  .\scripts\rotate-secrets.ps1 -SetPassword"
  Write-Host "  .\scripts\rotate-secrets.ps1 -AdminPassword `"YourNewPassword`""
  exit 0
}

Write-Host "Changed: $($changed -join ', ')"
Write-Host ""
Write-Host "NEXT STEPS:"
Write-Host "  1. Restart the app so Node reloads .env"
Write-Host "     - npm run build; npm start"
Write-Host "     - or: docker compose up -d --build"
Write-Host "     - or: npm run pm2:restart"
Write-Host "  2. Log in to /admin/login with the NEW password"
Write-Host "  3. Old sessions are invalid after SESSION_SECRET change (everyone re-logins)"
Write-Host ""
Write-Host "Do not commit .env to git."

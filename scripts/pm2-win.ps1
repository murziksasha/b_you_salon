# Windows-safe pm2 helpers. Dot-source from other scripts.
# Do not redirect the first God-daemon spawn to NUL - that hangs on Windows.

function Get-Pm2HomeDir {
  if ($env:PM2_HOME) { return $env:PM2_HOME }
  return (Join-Path $env:USERPROFILE ".pm2")
}

function Test-Pm2PriorState {
  # Do not use $home - $HOME is a read-only automatic variable (case-insensitive).
  $pm2Home = Get-Pm2HomeDir
  if (-not (Test-Path $pm2Home)) { return $false }
  foreach ($name in @("pm2.pid", "dump.pm2", "rpc.sock", "pub.sock")) {
    if (Test-Path (Join-Path $pm2Home $name)) { return $true }
  }
  return $false
}

function Convert-Pm2ExitCode {
  param($Code)
  if ($null -eq $Code) { return 0 }
  if ($Code -is [string] -and [string]::IsNullOrWhiteSpace($Code)) { return 0 }
  try {
    return [int]$Code
  }
  catch {
    return 0
  }
}

function Invoke-Pm2Timed {
  param(
    [Parameter(Mandatory = $true)][string]$Pm2Args,
    [int]$TimeoutSec = 40
  )
  $exe = "pm2.cmd"
  if (-not (Get-Command "pm2.cmd" -ErrorAction SilentlyContinue)) {
    $exe = "pm2"
  }

  # cmd.exe + pm2.cmd avoids the npm pm2.ps1 shim, which can wait forever.
  # System.Diagnostics.Process: Start-Process -PassThru on PS 5.1 often leaves
  # ExitCode $null, and `$null -ne 0` is true so setup killed a healthy app.
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/c $exe $Pm2Args"
  $psi.WorkingDirectory = (Get-Location).Path
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $false

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  [void]$proc.Start()
  if (-not $proc.WaitForExit($TimeoutSec * 1000)) {
    Write-Host "    timeout (${TimeoutSec}s): pm2 $Pm2Args"
    cmd.exe /c "taskkill /T /F /PID $($proc.Id)" | Out-Null
    try {
      if (-not $proc.HasExited) { $proc.Kill() }
    }
    catch { }
    try { $proc.Dispose() } catch { }
    return 124
  }
  $proc.WaitForExit()
  $code = Convert-Pm2ExitCode $proc.ExitCode
  try { $proc.Dispose() } catch { }
  return $code
}

function Get-Pm2Jlist {
  $exe = "pm2.cmd"
  if (-not (Get-Command "pm2.cmd" -ErrorAction SilentlyContinue)) {
    $exe = "pm2"
  }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/c $exe jlist"
  $psi.WorkingDirectory = (Get-Location).Path
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  try {
    [void]$proc.Start()
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    if (-not $proc.WaitForExit(20000)) {
      try { $proc.Kill() } catch { }
      return @()
    }
    $raw = $stdout
    if ([string]::IsNullOrWhiteSpace($raw)) { $raw = $stderr }
    if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
    $trim = $raw.Trim()
    $startArr = $trim.IndexOf("[")
    $startObj = $trim.IndexOf("{")
    $start = -1
    if ($startArr -ge 0 -and ($startObj -lt 0 -or $startArr -le $startObj)) {
      $start = $startArr
    }
    elseif ($startObj -ge 0) {
      $start = $startObj
    }
    if ($start -gt 0) { $trim = $trim.Substring($start) }
    $apps = $trim | ConvertFrom-Json
    if ($null -eq $apps) { return @() }
    if ($apps -is [System.Array]) { return @($apps) }
    return @($apps)
  }
  catch {
    return @()
  }
  finally {
    try { $proc.Dispose() } catch { }
  }
}

function Test-Pm2AppOnline {
  param([Parameter(Mandatory = $true)][string]$Name)
  foreach ($a in Get-Pm2Jlist) {
    if ($a.name -eq $Name -and $a.pm2_env.status -eq "online") {
      return $true
    }
  }
  return $false
}

function Test-Pm2CommandFailed {
  param($Code)
  $n = Convert-Pm2ExitCode $Code
  return ($n -ne 0)
}

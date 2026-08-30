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
  # Use System.Diagnostics.Process (not Start-Process): on Windows PowerShell 5.1,
  # Start-Process -PassThru leaves ExitCode $null after WaitForExit(ms), and
  # `$null -ne 0` is true - setup then kills a process that just started fine.
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
  # Unbounded wait after the timed one so stdout/exit code are flushed.
  $proc.WaitForExit()
  $code = $proc.ExitCode
  try { $proc.Dispose() } catch { }
  if ($null -eq $code) { return 0 }
  return [int]$code
}

function Test-Pm2CommandFailed {
  param($Code)
  if ($null -eq $Code) { return $false }
  return ([int]$Code -ne 0)
}

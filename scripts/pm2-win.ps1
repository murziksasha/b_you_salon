# Windows-safe pm2 helpers. Dot-source from other scripts.
# Do not redirect the first God-daemon spawn to NUL - that hangs on Windows.

function Get-Pm2HomeDir {
  if ($env:PM2_HOME) { return $env:PM2_HOME }
  return (Join-Path $env:USERPROFILE ".pm2")
}

function Test-Pm2PriorState {
  $home = Get-Pm2HomeDir
  if (-not (Test-Path $home)) { return $false }
  foreach ($name in @("pm2.pid", "dump.pm2", "rpc.sock", "pub.sock")) {
    if (Test-Path (Join-Path $home $name)) { return $true }
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
  $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $exe $Pm2Args" -NoNewWindow -PassThru
  if (-not $proc.WaitForExit($TimeoutSec * 1000)) {
    Write-Host "    timeout (${TimeoutSec}s): pm2 $Pm2Args"
    cmd.exe /c "taskkill /T /F /PID $($proc.Id)" | Out-Null
    try {
      if (-not $proc.HasExited) { $proc.Kill() }
    }
    catch { }
    return 124
  }
  return $proc.ExitCode
}

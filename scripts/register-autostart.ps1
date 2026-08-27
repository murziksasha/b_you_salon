# Register Windows logon autostart for ProperService (Task Scheduler + Startup folder).
# On many Windows Server setups Task Scheduler needs an elevated Admin shell.
# Startup folder always works after interactive logon without that.
#
# Usage:  npm run pm2:register-autostart
# Prefer: right-click PowerShell -> "Run as administrator", then the same command.
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$TaskName = "ProperService-pm2"
$AutostartPs1 = Join-Path $PSScriptRoot "pm2-autostart.ps1"

if (-not (Test-Path $AutostartPs1)) {
  Write-Error "Missing $AutostartPs1"
  exit 1
}

$psExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path $psExe)) { $psExe = "powershell.exe" }

$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AutostartPs1`""
$userId = if ($env:USERDOMAIN) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }

function Test-TaskExists {
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  return [bool]$t
}

function Test-IsElevated {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host "Root:     $Root"
Write-Host "Script:   $AutostartPs1"
Write-Host "User:     $userId"
Write-Host "PS:       $psExe"
Write-Host "Elevated: $(Test-IsElevated)"
Write-Host ""

# Clean previous task (ignore failures)
$ErrorActionPreference = "SilentlyContinue"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false | Out-Null
cmd.exe /c "schtasks /Delete /TN `"$TaskName`" /F >nul 2>&1" | Out-Null
$ErrorActionPreference = "Stop"

$errors = @()

# --- Method A: Register-ScheduledTask without Principal (current user) ---
if (-not (Test-TaskExists)) {
  try {
    Write-Host "[A] Register-ScheduledTask (current user, Limited)..."
    $action = New-ScheduledTaskAction -Execute $psExe -Argument $arg -WorkingDirectory $Root
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    try { $trigger.Delay = "PT30S" } catch { }

    $settings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -ExecutionTimeLimit ([TimeSpan]::Zero)

    $ErrorActionPreference = "Stop"
    Register-ScheduledTask `
      -TaskName $TaskName `
      -Action $action `
      -Trigger $trigger `
      -Settings $settings `
      -Description "ProperService pm2 autostart (logon)" `
      -Force | Out-Null

    if (Test-TaskExists) {
      Write-Host "[A] OK"
    }
    else {
      throw "Register-ScheduledTask returned but task not found"
    }
  }
  catch {
    $errors += "A: $($_.Exception.Message)"
    Write-Host "[A] FAILED: $($_.Exception.Message)"
  }
}

# --- Method B: explicit user principal ---
if (-not (Test-TaskExists)) {
  try {
    Write-Host "[B] Register-ScheduledTask (UserId=$userId)..."
    $action = New-ScheduledTaskAction -Execute $psExe -Argument $arg -WorkingDirectory $Root
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    try { $trigger.Delay = "PT30S" } catch { }
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

    Register-ScheduledTask `
      -TaskName $TaskName `
      -Action $action `
      -Trigger $trigger `
      -Settings $settings `
      -Principal $principal `
      -Force | Out-Null

    if (Test-TaskExists) {
      Write-Host "[B] OK"
    }
    else {
      throw "task not found after register"
    }
  }
  catch {
    $errors += "B: $($_.Exception.Message)"
    Write-Host "[B] FAILED: $($_.Exception.Message)"
  }
}

# --- Method C: schtasks.exe ---
if (-not (Test-TaskExists)) {
  Write-Host "[C] schtasks.exe /Create /SC ONLOGON ..."
  $tr = "$psExe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AutostartPs1`""
  $out = cmd.exe /c "schtasks /Create /TN `"$TaskName`" /TR `"$tr`" /SC ONLOGON /RL LIMITED /F 2>&1" | Out-String
  Write-Host $out.Trim()
  if (Test-TaskExists) {
    Write-Host "[C] OK"
  }
  else {
    $errors += "C: $out"
    Write-Host "[C] FAILED"
  }
}

# --- Always: Startup folder (reliable after interactive login) ---
$startupOk = $false
$cmdPath = $null
try {
  $startup = [Environment]::GetFolderPath("Startup")
  if (-not $startup) { throw "Startup folder path empty" }
  $cmdPath = Join-Path $startup "ProperService-pm2.cmd"
  @(
    "@echo off"
    "rem ProperService pm2 autostart - runs at user logon via Startup folder"
    "cd /d `"$Root`""
    "`"$psExe`" -NoProfile -ExecutionPolicy Bypass -File `"$AutostartPs1`" >> `"$Root\logs\pm2-startup-folder.log`" 2>&1"
  ) | Set-Content -Path $cmdPath -Encoding ASCII
  if (Test-Path $cmdPath) {
    $startupOk = $true
    Write-Host "Startup folder OK: $cmdPath"
  }
}
catch {
  Write-Warning "Startup folder failed: $($_.Exception.Message)"
}

Write-Host ""
if (Test-TaskExists) {
  $task = Get-ScheduledTask -TaskName $TaskName
  Write-Host "SUCCESS: Task '$TaskName' state=$($task.State)"
  if ($startupOk) { Write-Host "Also: Startup folder launcher installed." }
  Write-Host "After reboot: log in as $userId, wait ~1 min, open http://localhost:3000/api/health"
  Write-Host "Log: $(Join-Path $Root 'logs\pm2-autostart.log')"
  exit 0
}

if ($startupOk) {
  Write-Host "Task Scheduler: ACCESS DENIED (common on Server without elevated shell)."
  Write-Host "Fallback ACTIVE: Startup folder will start the site after you LOG IN."
  Write-Host "  $cmdPath"
  Write-Host ""
  Write-Host "This is enough if you always log in as $userId after reboot."
  Write-Host "Test now (simulates Startup):"
  Write-Host "  npm run pm2:autostart"
  Write-Host ""
  Write-Host "Optional: create task with elevated Admin PowerShell:"
  Write-Host "  npm run pm2:register-autostart"
  Write-Host "Or GUI taskschd.msc -> At logon ->"
  Write-Host "  Program: $psExe"
  Write-Host "  Args:    $arg"
  Write-Host "  Start in: $Root"
  if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "Task Scheduler errors:"
    $errors | ForEach-Object { Write-Host "  $_" }
  }
  if (-not (Test-IsElevated)) {
    Write-Host ""
    Write-Host "NOTE: this shell is NOT elevated. Right-click PowerShell -> Run as administrator."
  }
  # Startup-only is success for interactive-host scenario
  exit 0
}

Write-Host "FAILED: neither Task Scheduler nor Startup folder worked."
$errors | ForEach-Object { Write-Host "  $_" }
exit 1

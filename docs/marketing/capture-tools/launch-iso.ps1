# Launches the isolated VS Code profile (candidate FailSafe + disposable driver) on a workspace.
# HOME, USERPROFILE, APPDATA and LOCALAPPDATA point into the isolated profile, so FailSafe's
# ~/.failsafe state and VS Code's shared storage never touch the owner's real profile.
param([string]$Workspace = 'C:\dev\mythologiq\failsafe-demo-workspace', [switch]$WaitConsole)
$Q = 'C:\dev\mythologiq\FailSafe-rc611-qual'; $I = "$Q\iso"
$env:USERPROFILE = "$I\home"; $env:HOME = "$I\home"
$env:APPDATA = "$I\home\AppData\Roaming"; $env:LOCALAPPDATA = "$I\home\AppData\Local"
$env:FS_QUAL_CTL = "$I\ctl"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Remove-Item Env:VSCODE_IPC_HOOK_CLI -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$I\ctl\queue", "$I\ctl\done", $env:APPDATA, $env:LOCALAPPDATA | Out-Null
$p = Start-Process -FilePath 'C:\Users\krkna\AppData\Local\Programs\Microsoft VS Code\Code.exe' -PassThru -ArgumentList @(
  '--user-data-dir', "`"$I\ud`"", '--extensions-dir', "`"$I\ext`"", '--disable-workspace-trust',
  '--skip-welcome', '--skip-release-notes', '--new-window', "`"$Workspace`"")
"code pid=$($p.Id)"
if ($WaitConsole) {
  $d = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $d) {
    $l = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -ge 9376 -and $_.LocalPort -le 9386 -and $_.LocalAddress -eq '127.0.0.1' }
    if ($l) { $l | ForEach-Object { "listener $($_.LocalAddress):$($_.LocalPort) pid=$($_.OwningProcess)" }; break }
    Start-Sleep 1
  }
}

# Launches the isolated v6.0.13 capture rig prepared by rig-src\prep-6013.ps1 (FailSafe 6.0.13 from the Marketplace).
# Adds the disposable driver extension, points workbench.externalBrowser at this rig's open-console.cmd (fresh,
# disposable Chrome profile under the work dir), then starts the archive VS Code build with CDP on 9345.
# Never touches the owner's own VS Code or Chrome profiles.
param([string]$Workspace = 'C:\demo\tasklet-6013', [switch]$FreshChrome)
$ErrorActionPreference = 'Stop'
$R = 'C:\dev\mythologiq\failsafe\_work\v6013-demo\rig'; $I = "$R\iso"
$Code = 'C:\dev\mythologiq\FailSafe-6012-qual\vscode-test\vscode-win32-x64-archive-1.145.2'

Get-CimInstance Win32_Process -Filter "Name='Code.exe'" | Where-Object { $_.CommandLine -like '*v6013-demo\rig\iso*' -and $_.CommandLine -notlike '*--type=*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*v6013-demo\rig\chrome-profile*' -and $_.CommandLine -notlike '*--type=*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 3
if ($FreshChrome -and (Test-Path "$R\chrome-profile")) { Remove-Item -Recurse -Force "$R\chrome-profile" }
New-Item -ItemType Directory -Force "$R\chrome-profile", "$I\ctl\queue", "$I\ctl\done", "$R\shots" | Out-Null
Remove-Item "$I\ctl\queue\*", "$I\ctl\done\*" -ErrorAction SilentlyContinue

# settings: same as the 6.0.12 rig, but the external browser is this rig's launcher
$s = Get-Content "$I\ud\User\settings.json" -Raw | ConvertFrom-Json
$s.'workbench.externalBrowser' = "$R\open-console.cmd"
[IO.File]::WriteAllText("$I\ud\User\settings.json", ($s | ConvertTo-Json -Depth 6))

# disposable driver (not part of FailSafe)
$drv = "$I\ext\qual.failsafe-qual-driver-0.0.2"
if (-not (Test-Path $drv)) {
  New-Item -ItemType Directory -Force $drv | Out-Null; Copy-Item "$R\driver\*" $drv
  $j = Get-Content "$I\ext\extensions.json" -Raw | ConvertFrom-Json
  $j = @($j) + [pscustomobject]@{ identifier = [pscustomobject]@{ id = 'qual.failsafe-qual-driver' }; version = '0.0.2'; location = [pscustomobject]@{ '$mid' = 1; path = '/' + ($drv -replace '\\', '/'); scheme = 'file' }; relativeLocation = 'qual.failsafe-qual-driver-0.0.2' }
  [IO.File]::WriteAllText("$I\ext\extensions.json", (ConvertTo-Json @($j) -Depth 8 -Compress))
}
Get-ChildItem "$I\ext" -Directory | ForEach-Object { "ext $($_.Name)" }

$env:USERPROFILE = "$I\home"; $env:HOME = "$I\home"; $env:APPDATA = "$I\home\AppData\Roaming"; $env:LOCALAPPDATA = "$I\home\AppData\Local"; $env:FS_QUAL_CTL = "$I\ctl"
$env:USERNAME = 'demo'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; Remove-Item Env:VSCODE_IPC_HOOK_CLI -ErrorAction SilentlyContinue
$p = Start-Process -FilePath "$Code\Code.exe" -PassThru -ArgumentList @('--remote-debugging-port=9345', '--user-data-dir', "`"$I\ud`"", '--extensions-dir', "`"$I\ext`"",
  '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--new-window', "`"$Workspace`"")
"code pid=$($p.Id)"
$d = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $d) {
  $l = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 9376 -and $_.LocalAddress -eq '127.0.0.1' }
  if ($l -and (Test-Path "$I\ctl\driver.log")) { "console listener 127.0.0.1:9376 pid=$($l[0].OwningProcess)"; break }
  Start-Sleep 1
}
Get-Content "$I\ctl\driver.log" -ErrorAction SilentlyContinue | Select-Object -Last 4

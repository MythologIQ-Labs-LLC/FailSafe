# v6.0.13 Statewright demo rig: a fresh isolated VS Code profile with FailSafe installed
# from the public VS Code Marketplace (the published v6.0.13), plus the disposable capture driver.
# Never touches the owner's own VS Code or browser profiles.
param([string]$Workspace = 'C:\demo\tasklet-6013')
$ErrorActionPreference = 'Stop'
$W = 'C:\dev\mythologiq\failsafe\_work\v6013-demo'; $R = "$W\rig"; $I = "$R\iso"; $Src = "$W\rig-src"
$Code = 'C:\dev\mythologiq\FailSafe-6012-qual\vscode-test\vscode-win32-x64-archive-1.145.2'
$Fixture = 'C:\dev\mythologiq\failsafe-demo-workspace'

Get-CimInstance Win32_Process -Filter "Name='Code.exe'" | Where-Object { $_.CommandLine -like '*v6013-demo\rig\iso*' -and $_.CommandLine -notlike '*--type=*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 2

if (Test-Path $Workspace) { Remove-Item -Recurse -Force $Workspace }
New-Item -ItemType Directory -Force (Split-Path $Workspace) | Out-Null
git clone -q -c core.autocrlf=false $Fixture $Workspace
git -C $Workspace checkout -q -B main demo-baseline
git -C $Workspace remote remove origin
git -C $Workspace config user.name 'Demo Developer'; git -C $Workspace config user.email 'demo.developer@example.invalid'
"fixture $(git -C $Workspace rev-parse HEAD)"

foreach ($d in "$I\ud", "$I\home", "$I\ext", "$I\ctl") { if (Test-Path $d) { Remove-Item -Recurse -Force $d } }
New-Item -ItemType Directory -Force "$I\ud\User", "$I\home\AppData\Roaming", "$I\home\AppData\Local", "$I\ext", "$I\ctl\queue", "$I\ctl\done" | Out-Null
Copy-Item "$Src\isolated-user-settings.json" "$I\ud\User\settings.json"
$env:USERPROFILE = "$I\home"; $env:HOME = "$I\home"; $env:APPDATA = "$I\home\AppData\Roaming"; $env:LOCALAPPDATA = "$I\home\AppData\Local"; $env:FS_QUAL_CTL = "$I\ctl"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; Remove-Item Env:VSCODE_IPC_HOOK_CLI -ErrorAction SilentlyContinue

$ErrorActionPreference = 'Continue'
cmd /c "`"$Code\bin\code.cmd`" --user-data-dir `"$I\ud`" --extensions-dir `"$I\ext`" --install-extension MythologIQ.mythologiq-failsafe@6.0.13 --force 2>nul" | Select-Object -Last 2
cmd /c "`"$Code\bin\code.cmd`" --user-data-dir `"$I\ud`" --extensions-dir `"$I\ext`" --list-extensions --show-versions 2>nul"
$ErrorActionPreference = 'Stop'

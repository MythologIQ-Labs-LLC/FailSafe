# Resets the capture rig to a known first-run state and launches it.
#   prep.ps1 -Vsix <path>   fresh isolated profile (user data, HOME, extensions) with that VSIX + the disposable driver
#   prep.ps1                keep the installed extension, reset only profile state and the fixture
param([string]$Vsix = '', [string]$Workspace = 'C:\demo\tasklet')
$ErrorActionPreference = 'Stop'
$R = 'C:\dev\mythologiq\failsafe\_work\v6012-film\rig'; $I = "$R\iso"
$Code = 'C:\dev\mythologiq\FailSafe-6012-qual\vscode-test\vscode-win32-x64-archive-1.145.2'
$Fixture = 'C:\dev\mythologiq\failsafe-demo-workspace'

# 1. stop the isolated VS Code and the isolated Chrome (never the owner's own instances)
Get-CimInstance Win32_Process -Filter "Name='Code.exe'" | Where-Object { $_.CommandLine -like '*v6012-film\rig\iso*' -and $_.CommandLine -notlike '*--type=*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*v6012-film\rig\chrome-profile*' -and $_.CommandLine -notlike '*--type=*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 3

# 2. fresh fixture: the fictional Tasklet repo at its demo-baseline tag
if (Test-Path $Workspace) { Remove-Item -Recurse -Force $Workspace }
New-Item -ItemType Directory -Force (Split-Path $Workspace) | Out-Null
git clone -q -c core.autocrlf=false $Fixture $Workspace
git -C $Workspace checkout -q -B main demo-baseline
git -C $Workspace remote remove origin
git -C $Workspace config core.autocrlf false
git -C $Workspace config user.name 'Demo Developer'; git -C $Workspace config user.email 'demo.developer@example.invalid'
# The fictional project already has a concept document (docs/CONCEPT.md), committed as the 6.0.12 film baseline.
# Qor-Logic skills are NOT pre-installed: the film shows the Console's first-run "Get Started" banner and the real
# "Install Qor-Logic Skills" step (owner direction, 2026-11-10); the banner is gone once that install succeeds.
Copy-Item "$R\fixture-addon\docs\CONCEPT.md" "$Workspace\docs\CONCEPT.md"
git -C $Workspace add -A
git -C $Workspace commit -q -m 'Add the project concept' --date '2026-10-29T10:00:00'
git -C $Workspace tag demo-baseline-6012
"fixture $(git -C $Workspace rev-parse HEAD) $(git -C $Workspace describe --tags)"

# 3. fresh profile state
$settings = Get-Content "$I\ud\User\settings.json" -Raw
foreach ($d in "$I\ud", "$I\home", "$I\ctl", "$R\chrome-profile") { if (Test-Path $d) { Remove-Item -Recurse -Force $d } }
New-Item -ItemType Directory -Force "$I\ud\User", "$I\home\AppData\Roaming", "$I\home\AppData\Local", "$I\ctl\queue", "$I\ctl\done", "$R\chrome-profile" | Out-Null
[IO.File]::WriteAllText("$I\ud\User\settings.json", $settings)

$env:USERPROFILE = "$I\home"; $env:HOME = "$I\home"; $env:APPDATA = "$I\home\AppData\Roaming"; $env:LOCALAPPDATA = "$I\home\AppData\Local"; $env:FS_QUAL_CTL = "$I\ctl"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; Remove-Item Env:VSCODE_IPC_HOOK_CLI -ErrorAction SilentlyContinue

# 4. extensions: only when a VSIX is given
if ($Vsix) {
  if (Test-Path "$I\ext") { Remove-Item -Recurse -Force "$I\ext" }
  New-Item -ItemType Directory -Force "$I\ext" | Out-Null
  "vsix sha256 $((Get-FileHash $Vsix -Algorithm SHA256).Hash.ToLower()) $Vsix"
  $ErrorActionPreference = 'Continue'   # code.cmd prints a Node deprecation warning on stderr
  cmd /c "`"$Code\bin\code.cmd`" --user-data-dir `"$I\ud`" --extensions-dir `"$I\ext`" --install-extension `"$Vsix`" --force 2>nul" | Select-Object -Last 1
  $ErrorActionPreference = 'Stop'
  $drv = "$I\ext\qual.failsafe-qual-driver-0.0.2"; New-Item -ItemType Directory -Force $drv | Out-Null
  Copy-Item "$R\driver\*" $drv
  $j = Get-Content "$I\ext\extensions.json" -Raw | ConvertFrom-Json
  $j = @($j) + [pscustomobject]@{ identifier = [pscustomobject]@{ id = 'qual.failsafe-qual-driver' }; version = '0.0.2'; location = [pscustomobject]@{ '$mid' = 1; path = '/' + ($drv -replace '\\', '/'); scheme = 'file' }; relativeLocation = 'qual.failsafe-qual-driver-0.0.2' }
  [IO.File]::WriteAllText("$I\ext\extensions.json", (ConvertTo-Json @($j) -Depth 8 -Compress))
}
Get-ChildItem "$I\ext" -Directory | ForEach-Object { "ext $($_.Name)" }

# 5. launch
$p = Start-Process -FilePath "$Code\Code.exe" -PassThru -ArgumentList @('--remote-debugging-port=9345', '--user-data-dir', "`"$I\ud`"", '--extensions-dir', "`"$I\ext`"",
  '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--new-window', "`"$Workspace`"")
"code pid=$($p.Id)"
$d = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $d) {
  $l = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 9376 -and $_.LocalAddress -eq '127.0.0.1' }
  if ($l -and (Test-Path "$I\ctl\driver.log")) { "console listener 127.0.0.1:9376 pid=$($l[0].OwningProcess)"; break }
  Start-Sleep 1
}
Get-Content "$I\ctl\driver.log" -ErrorAction SilentlyContinue

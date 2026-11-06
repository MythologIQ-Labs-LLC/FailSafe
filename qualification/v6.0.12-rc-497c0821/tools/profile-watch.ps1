# Real Windows profile monitor for test runs (#591 acceptance evidence).
#   profile-watch.ps1 -Snapshot OUT.json      inventory of the real profile's watched locations
#   profile-watch.ps1 -Watch LOG -StopFile F  log every create/delete/rename at the profile top level
#                                             and anything at all under ~/.failsafe, until F exists
param([string]$Snapshot, [string]$Watch, [string]$StopFile)
$ErrorActionPreference = 'Stop'
$P = [Environment]::GetFolderPath('UserProfile')   # the OS profile path, independent of HOME/USERPROFILE env
if ($Snapshot) {
  $top = Get-ChildItem -LiteralPath $P -Force | Sort-Object Name | ForEach-Object {
    [pscustomobject]@{ name = $_.Name; dir = $_.PSIsContainer; created = $_.CreationTimeUtc.ToString('o') } }
  $fs = Join-Path $P '.failsafe'
  $prod = Join-Path $P '.vscode\extensions\mythologiq.mythologiq-failsafe-6.0.10-win32-x64\dist\extension\main.js'
  $extJson = Join-Path $P '.vscode\extensions\extensions.json'
  [pscustomobject]@{
    at = (Get-Date).ToUniversalTime().ToString('o'); profile = $P
    failsafeExists = (Test-Path -LiteralPath $fs)
    failsafeEntries = if (Test-Path -LiteralPath $fs) { @(Get-ChildItem -LiteralPath $fs -Force -Recurse | ForEach-Object FullName) } else { @() }
    prodMainSha256 = (Get-FileHash -LiteralPath $prod).Hash
    extensionsJsonFailsafe = ((Get-Content -LiteralPath $extJson -Raw | ConvertFrom-Json) | Where-Object { $_.identifier.id -like '*failsafe*' } | ForEach-Object { "$($_.identifier.id)@$($_.version)" }) -join ','
    topLevel = $top
  } | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 $Snapshot
  "snapshot -> $Snapshot (failsafeExists=$(Test-Path -LiteralPath $fs))"
}
if ($Watch) {
  $w = New-Object IO.FileSystemWatcher $P; $w.IncludeSubdirectories = $true; $w.InternalBufferSize = 65536
  $w.NotifyFilter = [IO.NotifyFilters]'FileName, DirectoryName'
  $events = @('Created', 'Deleted', 'Renamed') | ForEach-Object { Register-ObjectEvent $w $_ -SourceIdentifier "pw-$_" }
  $w.EnableRaisingEvents = $true
  "watching $P (top level + .failsafe)" | Out-File -Encoding utf8 $Watch
  while (-not (Test-Path $StopFile)) {
    foreach ($e in (Get-Event -ErrorAction SilentlyContinue)) {
      $rel = $e.SourceEventArgs.FullPath.Substring($P.Length).TrimStart('\')
      if ($rel -notmatch '\\' -or $rel -like '.failsafe*') {
        "{0} {1} {2}" -f (Get-Date).ToUniversalTime().ToString('o'), $e.SourceEventArgs.ChangeType, $rel | Out-File -Append -Encoding utf8 $Watch
      }
      Remove-Event -EventIdentifier $e.EventIdentifier
    }
    Start-Sleep -Milliseconds 250
  }
  $w.EnableRaisingEvents = $false; "stopped" | Out-File -Append -Encoding utf8 $Watch
}

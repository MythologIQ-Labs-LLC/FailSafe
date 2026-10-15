$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir '..')
Set-Location $projectRoot

Write-Host "=== Compile ==="
npm run compile

Write-Host ""
Write-Host "=== Full VS Code test runner ==="
npm test

Write-Host ""
Write-Host "All tests complete."

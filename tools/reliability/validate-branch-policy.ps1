param(
  [Parameter(Mandatory = $false)]
  [string]$BranchName,
  [Parameter(Mandatory = $false)]
  [switch]$AllowMain,
  [Parameter(Mandatory = $false)]
  [switch]$RequirePlanOrFeature
)

$ErrorActionPreference = "Stop"

function Get-CurrentBranch {
  if ($env:GITHUB_HEAD_REF) {
    return $env:GITHUB_HEAD_REF.Trim()
  }
  if ($env:GITHUB_REF_NAME) {
    return $env:GITHUB_REF_NAME.Trim()
  }
  try {
    $branch = git rev-parse --abbrev-ref HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $branch) {
      return $branch.Trim()
    }
  } catch {}
  return $null
}

# Tag-based CI runs (e.g. release pipeline triggered by v* tag push) are not
# branch operations — skip branch naming validation entirely.
if ($env:GITHUB_REF_TYPE -eq "tag") {
  Write-Host "[OK] Tag-based CI run detected (ref_type=tag). Branch policy not applicable." -ForegroundColor Green
  exit 0
}

$effectiveBranch = if ($BranchName) { $BranchName } else { Get-CurrentBranch }
if (-not $effectiveBranch) {
  Write-Host "[FAIL] Unable to determine current git branch." -ForegroundColor Red
  exit 1
}

# Detached HEAD from tag checkout (git rev-parse --abbrev-ref HEAD returns "HEAD")
if ($effectiveBranch -eq "HEAD") {
  Write-Host "[OK] Detached HEAD detected (likely tag checkout). Branch policy not applicable." -ForegroundColor Green
  exit 0
}

# Dependabot branches (dependabot/<ecosystem>/<path>) are bot-authored and cannot
# conform to the human naming policy (nested slashes, underscores, mixed case).
# They carry no hand-written code -- only dependency version bumps, still gated by
# the full test/CodeQL/Dependency-Review suite -- so branch naming is not applicable.
if ($effectiveBranch -like "dependabot/*") {
  Write-Host "[OK] Dependabot branch detected ('$effectiveBranch'). Branch policy not applicable (bot-authored dependency bump)." -ForegroundColor Green
  exit 0
}

$allowedPattern = '^(plan|feat|fix|release|hotfix)\/[a-z0-9][a-z0-9\-._]*$'
$isMain = $effectiveBranch -eq "main"

if ($isMain -and -not $AllowMain) {
  Write-Host "[FAIL] Protected branch 'main' requires PR-first flow. Use a feature/plan branch." -ForegroundColor Red
  exit 1
}

if (-not $isMain -and $effectiveBranch -notmatch $allowedPattern) {
  Write-Host "[FAIL] Branch '$effectiveBranch' violates naming policy: $allowedPattern" -ForegroundColor Red
  exit 1
}

if ($RequirePlanOrFeature -and $effectiveBranch -notmatch '^(plan|feat)\/') {
  Write-Host "[FAIL] Branch '$effectiveBranch' is not a plan/feat branch required for this workflow step." -ForegroundColor Red
  exit 1
}

Write-Host "[OK] Branch policy passed for '$effectiveBranch'" -ForegroundColor Green
exit 0

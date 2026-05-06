<#
.SYNOPSIS
  Repository-level Gold Standard validation entrypoint.
.DESCRIPTION
  Validates required governance/community artifacts and then runs the
  existing FailSafe container validation script for platform constraints.
#>

param(
  [switch]$SkipContainerValidation,
  [switch]$SkipReliabilityValidation,
  [switch]$SkipGitHubStandardsValidation,
  [switch]$SkipDocsValidation,
  [switch]$AllowMainBranch
)

$ErrorActionPreference = "Stop"
$violations = @()

function Resolve-RepoRoot {
  $scriptPath = $PSCommandPath
  if ([string]::IsNullOrWhiteSpace($scriptPath)) {
    $scriptPath = $MyInvocation.PSCommandPath
  }
  if ([string]::IsNullOrWhiteSpace($scriptPath)) {
    throw "Unable to determine script path for repository root resolution."
  }
  $current = Split-Path -Parent $scriptPath

  for ($i = 0; $i -lt 6; $i++) {
    $hasScripts = Test-Path (Join-Path $current "scripts/validate.ps1")
    $hasTools = Test-Path (Join-Path $current "tools/reliability")
    $hasReadme = Test-Path (Join-Path $current "README.md")
    if ($hasScripts -and $hasTools -and $hasReadme) {
      return $current
    }

    $parent = Split-Path -Parent $current
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $current) {
      break
    }
    $current = $parent
  }

  throw "Unable to resolve repository root from script path: $scriptPath"
}

$RepoRoot = Resolve-RepoRoot

function Write-Log {
  param([string]$Message, [string]$Level = "Info")
  $colors = @{ Info = "Cyan"; Success = "Green"; Warning = "Yellow"; Error = "Red" }
  Write-Host "[$Level] $Message" -ForegroundColor $colors[$Level]
}

function Assert-PathExists {
  param([string]$RelativePath, [string]$Rule)
  $path = Join-Path $RepoRoot $RelativePath
  if (Test-Path $path) {
    Write-Log "PASS: $RelativePath" -Level Success
  } else {
    $script:violations += @{ File = $RelativePath; Rule = $Rule }
    Write-Log "FAIL: $RelativePath ($Rule)" -Level Error
  }
}

function Validate-GoldStandardArtifacts {
  Write-Log "Validating Gold Standard repository artifacts..."

  $requiredRootFiles = @(
    @{ Path = "README.md"; Rule = "Missing core project README" },
    @{ Path = "LICENSE"; Rule = "Missing open-source license file" },
    @{ Path = "CHANGELOG.md"; Rule = "Missing changelog for release discipline" },
    @{ Path = "CODE_OF_CONDUCT.md"; Rule = "Missing community conduct policy" },
    @{ Path = "CONTRIBUTING.md"; Rule = "Missing contribution guide" },
    @{ Path = "SECURITY.md"; Rule = "Missing security policy" },
    @{ Path = "GOVERNANCE.md"; Rule = "Missing governance charter" }
  )

  foreach ($item in $requiredRootFiles) {
    Assert-PathExists -RelativePath $item.Path -Rule $item.Rule
  }

  $requiredGithubArtifacts = @(
    @{ Path = ".github/PULL_REQUEST_TEMPLATE.md"; Rule = "Missing pull request template" },
    @{ Path = ".github/ISSUE_TEMPLATE/config.yml"; Rule = "Missing issue template config" }
  )

  foreach ($item in $requiredGithubArtifacts) {
    Assert-PathExists -RelativePath $item.Path -Rule $item.Rule
  }
}

function Validate-ContainerChecks {
  if ($SkipContainerValidation) {
    Write-Log "Skipping container validation by request." -Level Warning
    return
  }

  $containerValidator = Join-Path $RepoRoot "FailSafe/build/validate.ps1"
  if (!(Test-Path $containerValidator)) {
    $script:violations += @{ File = "FailSafe/build/validate.ps1"; Rule = "Missing container validation script" }
    Write-Log "FAIL: Missing FailSafe/build/validate.ps1" -Level Error
    return
  }

  Write-Log "Running FailSafe/build/validate.ps1..."
  & $containerValidator
  if ($LASTEXITCODE -ne 0) {
    $script:violations += @{ File = "FailSafe/build/validate.ps1"; Rule = "Container validation failed with exit code $LASTEXITCODE" }
  }
}

function Assert-FileContains {
  param(
    [string]$RelativePath,
    [string]$Pattern,
    [string]$Rule
  )
  $path = Join-Path $RepoRoot $RelativePath
  if (!(Test-Path $path)) {
    $script:violations += @{ File = $RelativePath; Rule = "Missing file for pattern check: $Rule" }
    Write-Log "FAIL: Missing $RelativePath" -Level Error
    return
  }
  $content = Get-Content $path -Raw
  if ($content -match $Pattern) {
    Write-Log "PASS: $RelativePath contains required pattern" -Level Success
  } else {
    $script:violations += @{ File = $RelativePath; Rule = $Rule }
    Write-Log "FAIL: $RelativePath ($Rule)" -Level Error
  }
}

function Validate-ReliabilityHardening {
  if ($SkipReliabilityValidation) {
    Write-Log "Skipping reliability validation by request." -Level Warning
    return
  }

  Write-Log "Validating v3.2 reliability hardening artifacts..."

  $requiredReliabilityFiles = @(
    @{ Path = "tools/reliability/init-reliability-run.ps1"; Rule = "Missing reliability run initializer" },
    @{ Path = "tools/reliability/validate-intent-gate.ps1"; Rule = "Missing intent gate validator" },
    @{ Path = "tools/reliability/validate-reliability-run.ps1"; Rule = "Missing reliability run validator" },
    @{ Path = "tools/reliability/admit-skill.ps1"; Rule = "Missing skill admission pipeline" },
    @{ Path = "tools/reliability/validate-skill-admission.ps1"; Rule = "Missing skill admission validator" },
    @{ Path = "tools/reliability/gate-skill-matrix.json"; Rule = "Missing gate-to-skill matrix definition" },
    @{ Path = "tools/reliability/validate-gate-skill-matrix.ps1"; Rule = "Missing gate-to-skill matrix validator" }
  )

  foreach ($item in $requiredReliabilityFiles) {
    Assert-PathExists -RelativePath $item.Path -Rule $item.Rule
  }

  # Skill content validation: .claude/ is gitignored for proprietary content
  # These checks run locally but are skipped in CI where .claude/ is not present
  $claudeSkillsRoot = Join-Path $repoRoot ".claude/skills"
  if (Test-Path $claudeSkillsRoot) {
    $qlImplementWorkflows = @(
      ".claude/skills/qor-implement/SKILL.md"
    )

    foreach ($workflow in $qlImplementWorkflows) {
      Assert-FileContains `
        -RelativePath $workflow `
        -Pattern "Step 5\.6: Intent Lock Interdiction \(B51\)" `
        -Rule "ql-implement missing B51 interdiction"

      Assert-FileContains `
        -RelativePath $workflow `
        -Pattern "Step 5\.7: Skill Admission Interdiction \(B49\)" `
        -Rule "ql-implement missing B49 interdiction"

      Assert-FileContains `
        -RelativePath $workflow `
        -Pattern "Step 5\.8: Gate-to-Skill Matrix Interdiction \(B50\)" `
        -Rule "ql-implement missing B50 interdiction"
    }

    $qlSubstantiateWorkflows = @(
      ".claude/skills/qor-substantiate/SKILL.md"
    )

    foreach ($workflow in $qlSubstantiateWorkflows) {
      Assert-FileContains `
        -RelativePath $workflow `
        -Pattern "validate-reliability-run\.ps1" `
        -Rule "ql-substantiate missing reliability-run validator gate"

      Assert-FileContains `
        -RelativePath $workflow `
        -Pattern "Step 4\.6: Skill Admission Evidence Check \(B49\)" `
        -Rule "ql-substantiate missing B49 evidence check"

      Assert-FileContains `
        -RelativePath $workflow `
        -Pattern "Step 4\.7: Gate-to-Skill Matrix Evidence Check \(B50\)" `
        -Rule "ql-substantiate missing B50 evidence check"
    }
  } else {
    Write-Log "Skipping skill content validation - .claude/ not present (gitignored)" -Level Warning
  }
}

function Validate-GitHubStandards {
  if ($SkipGitHubStandardsValidation) {
    Write-Log "Skipping GitHub standards validation by request." -Level Warning
    return
  }

  Write-Log "Validating GitHub standards and branch policy..."

  Assert-PathExists -RelativePath "tools/reliability/validate-branch-policy.ps1" -Rule "Missing branch policy validator"

  $branchValidator = Join-Path $RepoRoot "tools/reliability/validate-branch-policy.ps1"
  if (Test-Path $branchValidator) {
    $branchArgs = @()
    if ($AllowMainBranch) {
      $branchArgs += "-AllowMain"
    }

    & $branchValidator @branchArgs | Out-Null
    if ($LASTEXITCODE -ne 0) {
      $script:violations += @{ File = "git-branch-policy"; Rule = "Branch policy validation failed" }
    } else {
      Write-Log "PASS: branch naming/protected-branch policy" -Level Success
    }
  }

  Assert-FileContains `
    -RelativePath ".github/PULL_REQUEST_TEMPLATE.md" `
    -Pattern "Evidence Checklist" `
    -Rule "PR template missing evidence checklist section"

  Assert-FileContains `
    -RelativePath ".github/PULL_REQUEST_TEMPLATE.md" `
    -Pattern "Reliability Gates" `
    -Rule "PR template missing reliability gate checklist"

  Assert-FileContains `
    -RelativePath ".github/PULL_REQUEST_TEMPLATE.md" `
    -Pattern "Branch and Merge Policy" `
    -Rule "PR template missing branch/merge policy checklist"
}

function Validate-ReleaseVersionCoherence {
  Write-Log "Validating release version coherence..."

  $versionValidator = Join-Path $RepoRoot "tools/validate-release-version.ps1"
  if (!(Test-Path $versionValidator)) {
    $script:violations += @{ File = "tools/validate-release-version.ps1"; Rule = "Missing release version coherence validator" }
    Write-Log "FAIL: Missing tools/validate-release-version.ps1" -Level Error
    return
  }

  $pkgJson = Join-Path $RepoRoot "FailSafe/extension/package.json"
  $pkgVersion = (Get-Content $pkgJson -Raw | ConvertFrom-Json).version
  & $versionValidator -Version $pkgVersion | Out-Null
  if ($LASTEXITCODE -ne 0) {
    $script:violations += @{ File = "release-version-coherence"; Rule = "Release version coherence validation failed" }
    Write-Log "FAIL: release version coherence gate" -Level Error
  } else {
    Write-Log "PASS: release version coherence gate" -Level Success
  }
}

function Validate-DocsCoherence {
  if ($SkipDocsValidation) {
    Write-Log "Skipping docs coherence validation by request." -Level Warning
    return
  }

  Write-Log "Validating docs coherence against shipped implementation..."
  $docsValidator = Join-Path $RepoRoot "tools/reliability/validate-docs-coherence.ps1"
  if (!(Test-Path $docsValidator)) {
    $script:violations += @{ File = "tools/reliability/validate-docs-coherence.ps1"; Rule = "Missing docs coherence validator" }
    Write-Log "FAIL: Missing tools/reliability/validate-docs-coherence.ps1" -Level Error
    return
  }

  & $docsValidator -RepoRoot $RepoRoot | Out-Null
  if ($LASTEXITCODE -ne 0) {
    $script:violations += @{ File = "docs-coherence"; Rule = "Docs coherence validation failed" }
    Write-Log "FAIL: docs coherence gate" -Level Error
  } else {
    Write-Log "PASS: docs coherence gate" -Level Success
  }
}

Write-Log "Repository Validation (Gold Standard + Container)" -Level Info
Validate-GoldStandardArtifacts
Validate-ReliabilityHardening
Validate-GitHubStandards
Validate-ReleaseVersionCoherence
Validate-DocsCoherence
Validate-ContainerChecks

if ($violations.Count -gt 0) {
  Write-Log "VALIDATION FAILED: $($violations.Count) violation(s)" -Level Error
  $violations | ForEach-Object {
    Write-Host "  - $($_.File): $($_.Rule)" -ForegroundColor Red
  }
  exit 1
}

Write-Log "VALIDATION PASSED" -Level Success
exit 0

---
name: ql-repo-audit
description: >
  Repository Governance Audit - Validates workspace against REPO_GOVERNANCE.md standards
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash
---

# /qor-repo-audit - Repository Governance Audit

<skill>
  <trigger>/qor-repo-audit</trigger>
  <phase>AUDIT</phase>
  <persona>Judge</persona>
  <output>Compliance report with grade, violations, and remediation guidance</output>
</skill>

## Purpose

Audit a workspace against the Repository Governance Standard defined in `docs/REPO_GOVERNANCE.md`. Validates structure, root files, GitHub configuration, commit discipline, and security posture.

## Reference Standard

The canonical governance standard is `docs/REPO_GOVERNANCE.md`. All checks align with:

- Section 1: Repository Structure Requirements
- Section 2: Required Root Files
- Section 3: GitHub Configuration Requirements
- Section 4: Issue Governance
- Section 6: Branch and Merge Standards
- Section 7: Commit Discipline
- Section 9: Security Posture

## Execution Protocol

### Step 1: Validate Repository Structure

Check for required directories:

```
Glob: src/** OR lib/** OR app/** OR packages/**  -> has_source_dir
Glob: tests/** OR test/** OR __tests__/**        -> has_test_dir
Glob: docs/**                                     -> has_docs_dir
Glob: .github/**                                  -> has_github_dir
```

### Step 2: Validate Root Files

**Mandatory Files** (blocking):
```
Glob: README.md OR readme.md          -> has_readme
Glob: LICENSE OR LICENSE.md           -> has_license
```

**Recommended Files** (warning):
```
Glob: CONTRIBUTING.md                 -> has_contributing
Glob: SECURITY.md                     -> has_security
Glob: CODE_OF_CONDUCT.md              -> has_coc
Glob: CHANGELOG.md                    -> has_changelog
Glob: GOVERNANCE.md                   -> has_governance
```

### Step 3: Validate GitHub Configuration

**Issue Templates**:
```
Glob: .github/ISSUE_TEMPLATE/bug_report.yml      -> has_bug_template
Glob: .github/ISSUE_TEMPLATE/feature_request.yml -> has_feature_template
Glob: .github/ISSUE_TEMPLATE/config.yml          -> has_template_config
```

**PR Template**:
```
Glob: .github/PULL_REQUEST_TEMPLATE.md           -> has_pr_template
```

**CI Workflows**:
```
Glob: .github/workflows/*.yml                    -> has_workflows
```

### Step 4: Validate Commit Discipline

Check for commit tooling:
```
Read: package.json (if exists)
Check: devDependencies contains @commitlint/cli
Check: devDependencies contains husky
```

### Step 5: Validate Security Posture

```
Glob: SECURITY.md                     -> has_security_policy
Glob: .gitignore                      -> Read and check for .env
Glob: .socket.yml OR .snyk OR .github/dependabot.yml -> has_dep_scanning
```

### Step 6: Calculate Compliance Score

Scoring weights:
- **Errors** (mandatory missing): -2 points each
- **Warnings** (recommended missing): -1 point each
- **Info** (optional enhancements): 0 points

```
max_score = total_checks * 2
actual_score = max_score - (errors * 2) - (warnings * 1)
percentage = (actual_score / max_score) * 100
```

Grade thresholds:
- A: 90-100%
- B: 80-89%
- C: 70-79%
- D: 60-69%
- F: <60%

### Step 7: Generate Compliance Report

```markdown
# Repository Governance Audit Report

**Workspace**: [workspace name]
**Audit Date**: [timestamp]
**Standard**: docs/REPO_GOVERNANCE.md v1.0.0

## Compliance Score

| Metric | Value |
|--------|-------|
| Grade | **[A-F]** |
| Score | [X]/[Y] |
| Percentage | [Z]% |

## Summary

| Status | Count |
|--------|-------|
| Passed | [N] |
| Errors | [N] |
| Warnings | [N] |
| Info | [N] |

## Violations

### Errors (Blocking)

- [ ] [file/check] - [message]
  - Remediation: [action]

### Warnings

- [ ] [file/check] - [message]
  - Remediation: [action]

### Recommendations

- [enhancement suggestion]

## Check Details

### Structure

| Check | Status |
|-------|--------|
| Source directory | [PASS/FAIL] |
| Tests directory | [PASS/FAIL] |
| Docs directory | [PASS/FAIL] |
| .github directory | [PASS/FAIL] |

### Root Files

| File | Required | Present | Status |
|------|----------|---------|--------|
| README.md | Yes | [Y/N] | [PASS/FAIL] |
| LICENSE | Yes | [Y/N] | [PASS/FAIL] |
| CONTRIBUTING.md | Recommended | [Y/N] | [PASS/WARN] |
| SECURITY.md | Recommended | [Y/N] | [PASS/WARN] |
| CODE_OF_CONDUCT.md | Recommended | [Y/N] | [PASS/WARN] |
| CHANGELOG.md | Recommended | [Y/N] | [PASS/WARN] |

### GitHub Configuration

| Item | Present | Status |
|------|---------|--------|
| Issue template: bug_report.yml | [Y/N] | [PASS/WARN] |
| Issue template: feature_request.yml | [Y/N] | [PASS/WARN] |
| Issue template: config.yml | [Y/N] | [PASS/WARN] |
| PR template | [Y/N] | [PASS/WARN] |
| CI workflows | [Y/N] | [PASS/WARN] |

### Security Posture

| Check | Status |
|-------|--------|
| SECURITY.md present | [PASS/WARN] |
| .env gitignored | [PASS/FAIL] |
| Dependency scanning configured | [PASS/WARN] |

## Remediation

Run `/qor-repo-scaffold` to auto-generate missing governance files.
```

## Constraints

- **Read-only audit** - No modifications to workspace
- **Local-first** - GitHub API optional, graceful fallback
- **NEVER** create or modify files during audit

## Monitor Integration

Audit results are available in the FailSafe Monitor via the `repoCompliance` field in the hub snapshot:

```typescript
repoCompliance: {
  score: number;
  maxScore: number;
  percentage: number;
  grade: string;
  errors: number;
  warnings: number;
  topViolations: Array<{ message: string; severity: string }>;
}
```

## Related Skills

- `/qor-repo-scaffold` - Generate missing governance files
- `/qor-status` - Check overall governance state
- `/qor-audit` - Full Gate Tribunal audit (includes repo audit as Pass 7)

---
_Standard: docs/REPO_GOVERNANCE.md v1.0.0 | Service: RepoGovernanceService.ts_



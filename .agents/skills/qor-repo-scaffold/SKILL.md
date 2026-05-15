---
name: ql-repo-scaffold
description: >
  Generate Governance Scaffold
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

---
name: ql-repo-scaffold
description: /qor-repo-scaffold - Generate Governance Scaffold
---

# /qor-repo-scaffold - Generate Governance Scaffold

<skill>
  <trigger>/qor-repo-scaffold</trigger>
  <phase>IMPLEMENT</phase>
  <persona>Specialist</persona>
  <output>Created community files from templates</output>
</skill>

## Purpose

Generate missing repository governance files. Uses templates with variable substitution for project-specific values.

## Execution Protocol

### Step 1: Detect Project Context

```bash
# Project name (priority order)
cat package.json | jq -r '.name' 2>/dev/null || basename $(pwd)

# License type
head -1 LICENSE 2>/dev/null | grep -oE '(MIT|Apache|GPL|BSD|ISC)' || echo "MIT"

# Maintainer email
git config user.email || cat package.json | jq -r '.author.email' 2>/dev/null || echo "maintainer@example.com"

# Current year
date +%Y
```

Store as:
- `{{PROJECT_NAME}}`
- `{{LICENSE_TYPE}}`
- `{{MAINTAINER_EMAIL}}`
- `{{YEAR}}`

### Step 2: Run Audit First

```
Execute: /qor-repo-audit (internal)
Capture: List of MISSING files
```

IF no missing files:
- REPORT: "Repository already meets Gold Standard"
- DONE

### Step 3: Generate Missing Files

For each file marked MISSING:

**Community Files** (from templates):

| Missing File | Template Source |
|--------------|-----------------|
| CODE_OF_CONDUCT.md | `docs/conceptual-theory/templates/repo-gold-standard/CODE_OF_CONDUCT.md` |
| CONTRIBUTING.md | `docs/conceptual-theory/templates/repo-gold-standard/CONTRIBUTING.md` |
| SECURITY.md | `docs/conceptual-theory/templates/repo-gold-standard/SECURITY.md` |
| GOVERNANCE.md | `docs/conceptual-theory/templates/repo-gold-standard/GOVERNANCE.md` |

**GitHub Templates** (from templates):

| Missing File | Template Source |
|--------------|-----------------|
| .github/ISSUE_TEMPLATE/bug_report.yml | `.../github/bug_report.yml` |
| .github/ISSUE_TEMPLATE/feature_request.yml | `.../github/feature_request.yml` |
| .github/ISSUE_TEMPLATE/documentation.yml | `.../github/documentation.yml` |
| .github/ISSUE_TEMPLATE/config.yml | `.../github/config.yml` |
| .github/PULL_REQUEST_TEMPLATE.md | `.../github/PULL_REQUEST_TEMPLATE.md` |

Process:
1. Read template file
2. Replace all `{{VARIABLE}}` placeholders
3. Write to target path
4. Stage: `git add [path]`

### Step 4: Update README Links (if needed)

IF README.md exists AND missing documentation links:

Append to README.md:
```markdown

## Documentation

- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Governance](GOVERNANCE.md)
```

Stage: `git add README.md`

### Step 5: Create Directories

```bash
mkdir -p .github/ISSUE_TEMPLATE
```

### Step 6: Report

```markdown
## Scaffold Complete

**Project**: {{PROJECT_NAME}}
**License**: {{LICENSE_TYPE}}

### Files Created

| File | Path | Status |
|------|------|--------|
| [name] | [path] | Created & Staged |
...

### Files Staged

Total: [count] files

### Next Steps

1. Review staged files: `git status`
2. Customize content as needed
3. Commit: `git commit -m "docs: add community governance files"`
4. Verify: `/qor-repo-audit`
```

## Constraints

- **NEVER overwrite existing files** (skip if exists)
- **ALWAYS stage** (never auto-commit)
- **Template substitution must be idempotent**
- **Create directories as needed**
- **User owns final review and commit**

## Token Budget

- Skill load: ~2KB
- Template reads: ~3KB total
- File writes: ~2KB
- Target total: <8KB context impact

---
_Audit first: /qor-repo-audit | Templates: docs/conceptual-theory/templates/repo-gold-standard/_

# GitHub API Helper Reference

## Overview

Reference for GitHub API operations used by `/qor-repo-*` skills. Uses `gh` CLI which handles authentication automatically.

## Authentication

```bash
# Check if gh is authenticated
gh auth status
```

**Graceful Fallback**: If `gh` CLI is not available or not authenticated, skills should fall back to local-only operations.

```bash
# Test availability
gh --version 2>/dev/null && gh auth status 2>/dev/null
```

## Community Profile

Retrieve repository health metrics:

```bash
gh api repos/{owner}/{repo}/community/profile
```

**With jq filtering**:
```bash
# Health percentage only
gh api repos/{owner}/{repo}/community/profile --jq '.health_percentage'

# All detected files
gh api repos/{owner}/{repo}/community/profile --jq '.files'
```

**Response Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `health_percentage` | number | 0-100, GitHub's health score |
| `files.code_of_conduct` | object | `{url, html_url}` if detected |
| `files.contributing` | object | `{url, html_url}` if detected |
| `files.license` | object | `{spdx_id, url}` if detected |
| `files.readme` | object | `{url, html_url}` if detected |
| `files.security` | object | `{url, html_url}` if detected |
| `content_reports_enabled` | boolean | Community reports enabled |

**Example Response**:
```json
{
  "health_percentage": 85,
  "files": {
    "code_of_conduct": {"url": "...", "html_url": "..."},
    "contributing": {"url": "...", "html_url": "..."},
    "license": {"spdx_id": "MIT", "url": "..."},
    "readme": {"url": "...", "html_url": "..."}
  },
  "content_reports_enabled": true
}
```

## Labels

Manage issue labels:

```bash
# List all labels
gh label list

# Create a new label
gh label create "bug" --description "Something isn't working" --color "d73a4a"

# Standard label taxonomy
gh label create "enhancement" --description "New feature or request" --color "a2eeef"
gh label create "documentation" --description "Improvements or additions to docs" --color "0075ca"
gh label create "good first issue" --description "Good for newcomers" --color "7057ff"
gh label create "help wanted" --description "Extra attention is needed" --color "008672"
gh label create "question" --description "Further information is requested" --color "d876e3"
gh label create "wontfix" --description "This will not be worked on" --color "ffffff"
gh label create "duplicate" --description "This issue or PR already exists" --color "cfd3d7"
gh label create "invalid" --description "This doesn't seem right" --color "e4e669"
```

## Issues

Create and manage issues:

```bash
# Create issue from blocker
gh issue create --title "[Bug] [blocker-id]: Description" --body "Details from BACKLOG.md"

# Create issue with labels
gh issue create --title "Title" --body "Body" --label "bug,high-priority"

# List open issues
gh issue list --state open

# Close an issue
gh issue close [number]
```

**From BACKLOG.md blockers**:
```bash
# Example: Convert D1 blocker to issue
gh issue create \
  --title "[D1] ArchitectureEngine.ts - Placeholder complexity" \
  --body "From BACKLOG.md: Placeholder complexity needs implementation" \
  --label "enhancement"
```

## Pull Requests

Create and manage PRs:

```bash
# Create PR
gh pr create --title "feat: description" --body "Details"

# Create PR with specific base
gh pr create --base main --title "Title" --body "Body"

# From HEREDOC (for multiline body)
gh pr create --title "feat: title" --body "$(cat <<'EOF'
## Summary
- Change 1
- Change 2

## Test Plan
- [ ] Unit tests pass
- [ ] Manual verification
EOF
)"

# List PRs
gh pr list

# Merge PR
gh pr merge [number] --merge
```

## Releases

Create GitHub releases:

```bash
# Create release with auto-generated notes
gh release create v1.0.0 --generate-notes

# Create release with custom notes
gh release create v1.0.0 --title "v1.0.0" --notes "Release notes here"

# Create release from CHANGELOG section
gh release create v1.0.0 --title "v1.0.0" --notes-file CHANGELOG.md

# Create draft release
gh release create v1.0.0 --draft --title "v1.0.0"

# List releases
gh release list

# Download release assets
gh release download v1.0.0
```

## Repository Info

```bash
# Get repo info
gh repo view

# Get repo info as JSON
gh repo view --json name,description,url,defaultBranchRef

# Clone
gh repo clone owner/repo
```

## Error Handling

Always check for errors before proceeding:

```bash
# Pattern: Check then execute
if gh auth status &>/dev/null; then
  # GitHub API available
  HEALTH=$(gh api repos/{owner}/{repo}/community/profile --jq '.health_percentage')
else
  # Fallback to local-only
  HEALTH="N/A (gh not authenticated)"
fi
```

## Rate Limits

GitHub API has rate limits. For unauthenticated requests: 60/hour. For authenticated: 5000/hour.

```bash
# Check rate limit status
gh api rate_limit --jq '.rate'
```

---
_Used by: /qor-repo-audit, /qor-repo-scaffold, /qor-repo-release_

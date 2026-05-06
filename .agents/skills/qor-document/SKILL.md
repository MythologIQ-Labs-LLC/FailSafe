---
name: ql-document
description: >
  Technical Documentation Authoring
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

---
name: ql-document
description: Author verified, concise technical documentation with narrative context. Specialized RELEASE_METADATA mode for authoring CHANGELOG and README content during /qor-repo-release. Use when drafting release notes, READMEs, product briefs, architecture overviews, or any documentation requiring accuracy, technical rigor, and brevity.
---

# /qor-document - Technical Documentation Authoring

<skill>
  <trigger>/qor-document</trigger>
  <phase>ANY</phase>
  <persona>Governor</persona>
  <output>Authored documentation files with verified claims</output>
</skill>

## Purpose

Author verified, concise technical documentation with narrative context (conception, development, life beyond). Specialized mode for release metadata authoring during `/qor-repo-release`.

## Execution Protocol

### Step 1: Determine Context

```
IF invoked with a version argument (e.g., from /qor-repo-release):
  MODE = "RELEASE_METADATA"
  Read: docs/META_LEDGER.md (entries since last DELIVER or start of current cycle)
  Read: docs/SYSTEM_STATE.md
  Read: FailSafe/extension/CHANGELOG.md (existing entries)
  Read: FailSafe/extension/README.md (current markers)
  Read: CHANGELOG.md (root, existing entries)
  Extract: version, date, features implemented, files changed

ELSE:
  MODE = "GENERAL"
  Confirm: audience, purpose, medium, source of truth
```

### Step 2: Gather Evidence

List all claims to be made in the document. Map each claim to a source.

**Source Precedence** (when sources conflict):

1. Runtime behavior or tests (if reproducible in current repo state)
2. Source code in the current branch
3. Versioned governance artifacts (META_LEDGER, BACKLOG, CHANGELOG, roadmap)
4. Tickets/discussion notes

If conflicts remain unresolved, mark claim status as `unknown` and document the conflict.

Remove or qualify anything unverified.

### Step 3: Author Content

**IF MODE = RELEASE_METADATA:**

Author these 3 files:

1. **Extension CHANGELOG** (`FailSafe/extension/CHANGELOG.md`):
   - Add `## [X.Y.Z] - YYYY-MM-DD` entry
   - Categorize: Added, Changed, Fixed
   - Each bullet: scoped, factual, sourced from ledger entries

2. **Extension README** (`FailSafe/extension/README.md`):
   - Update `**Current Release**: vX.Y.Z`
   - Update `## What's New in vX.Y.Z`
   - Verify all feature claims against implementation

3. **Root CHANGELOG** (`CHANGELOG.md`):
   - Add `## [X.Y.Z]` entry
   - Summary-level bullets (less detail than extension CHANGELOG)

Present authored content to user for review before writing files.

**IF MODE = GENERAL:**

1. Build outline: problem, concept, implementation, capabilities, future
2. Write in short, high-signal sentences — prefer verbs over adjectives
3. Validate names, commands, settings, and paths against code or docs

### Step 4: Verify

For docs with consequential claims, include a claim map:

```markdown
| Claim | Status | Source |
|-------|--------|--------|
| ... | implemented/in_progress/planned/deferred/unknown | path:line or artifact id |
```

Checklist:
- Every claim has a source (ledger entry, file, or test)
- No forward-looking statements without `planned` or `deferred` label and source
- Command names, config paths, and settings match code exactly
- No hype, promises, or unsourced metrics

### Step 5: Trim

- Remove filler, consolidate, tighten
- Paragraphs: 1-3 sentences max
- Active voice, concrete nouns
- Use the fewest words that preserve accuracy

## Status Labels

Use one of these labels for any feature, workflow, or roadmap claim:

- `implemented` — exists in current code/docs and is verifiable now
- `in_progress` — active work with partial implementation evidence
- `planned` — approved/recorded work not yet implemented
- `deferred` — explicitly postponed work with a recorded reason
- `unknown` — insufficient or conflicting evidence

Do not use ambiguous labels like "done-ish", "coming soon", or "mostly complete".

## Forward-Looking Guardrails

- Do not present roadmap items as commitments unless explicitly stated in source artifacts
- Tie all future claims to a concrete source (BACKLOG, roadmap entry, plan file, or ticket)
- If no source exists, remove the claim or mark as `unknown`

## Next Step

| Context | Successor |
|---------|-----------|
| Invoked by `/qor-repo-release` | Return to release flow (Step 6: Re-Run Pre-Flight) |
| Standalone | `/qor-status` to determine current position |

## Constraints

- **NEVER** present unverified claims as facts
- **NEVER** use ambiguous labels ("coming soon", "mostly complete")
- **NEVER** include forward-looking statements without source artifacts
- **ALWAYS** map claims to sources using precedence model
- **ALWAYS** validate names, commands, paths against code
- **ALWAYS** use status labels for feature/roadmap claims
- **ALWAYS** present content for user review before writing files

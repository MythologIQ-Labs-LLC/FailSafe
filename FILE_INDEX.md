# File Movement Index

**Generated**: 2026-03-09T22:00:00Z
**Operation**: /qor-organize (Session 2)
**Total Files Moved**: 21

---

## Executive Summary

- **Files reorganized**: 21
- **Directories created**: 2
- **Directories protected**: 5
- **Files to `.failsafe/governance/plans/`**: 2 (new plans moved)
- **Files to `.failsafe/governance/`**: 1 (status doc)
- **Files to `.failsafe/archive/completion-markers/`**: 7
- **Files to `.failsafe/archive/stale-configs/`**: 4
- **Files to `FailSafe/ScreenShots/`**: 1
- **Duplicate plan files removed from root**: 11 (identical copies already in `.failsafe/governance/plans/`)

---

## Protected Directories

| Directory | Rationale |
| --------- | --------- |
| `FailSafe/` | Extension source tree — managed project structure |
| `docs/` | Tracked governance documentation |
| `.claude/` | AI agent configuration |
| `.failsafe/` | Governance artifacts (gitignored) |
| `.qorelogic/` | Proprietary governance logic |

---

## Directory Creation Log

| Directory | Created At | Purpose |
| --------- | ---------- | ------- |
| `.failsafe/archive/completion-markers/` | 2026-03-09T22:00:00Z | Archive stale milestone markers from docs/ |
| `.failsafe/archive/stale-configs/` | 2026-03-09T22:00:00Z | Archive misplaced config files from docs/Planning/ |

---

## File Movement Log

### Plans to `.failsafe/governance/plans/`

| # | File Name | Original Path | New Path | File Type | Timestamp |
| - | --------- | ------------- | -------- | --------- | --------- |
| 1 | plan-proprietary-skills-v1.md | `./plan-proprietary-skills-v1.md` | `.failsafe/governance/plans/plan-proprietary-skills-v1.md` | .md | 2026-03-09T22:00:00Z |
| 2 | plan-workspace-isolation-v1.md | `./plan-workspace-isolation-v1.md` | `.failsafe/governance/plans/plan-workspace-isolation-v1.md` | .md | 2026-03-09T22:00:00Z |

### Governance Docs to `.failsafe/governance/`

| # | File Name | Original Path | New Path | File Type | Timestamp |
| - | --------- | ------------- | -------- | --------- | --------- |
| 1 | PROPRIETARY_SKILLS_MIGRATION_STATUS.md | `./PROPRIETARY_SKILLS_MIGRATION_STATUS.md` | `.failsafe/governance/PROPRIETARY_SKILLS_MIGRATION_STATUS.md` | .md | 2026-03-09T22:00:00Z |

### Completion Markers to `.failsafe/archive/completion-markers/`

| # | File Name | Original Path | New Path | File Type | Timestamp |
| - | --------- | ------------- | -------- | --------- | --------- |
| 1 | _COMPLETE_PHYSICAL_ISOLATION.md | `docs/_COMPLETE_PHYSICAL_ISOLATION.md` | `.failsafe/archive/completion-markers/_COMPLETE_PHYSICAL_ISOLATION.md` | .md | 2026-03-09T22:00:00Z |
| 2 | _DEPLOYMENT_COMPLETE_v3.0.0.md | `docs/_DEPLOYMENT_COMPLETE_v3.0.0.md` | `.failsafe/archive/completion-markers/_DEPLOYMENT_COMPLETE_v3.0.0.md` | .md | 2026-03-09T22:00:00Z |
| 3 | _MISSION_COMPLETE.md | `docs/_MISSION_COMPLETE.md` | `.failsafe/archive/completion-markers/_MISSION_COMPLETE.md` | .md | 2026-03-09T22:00:00Z |
| 4 | _PACKAGE_STRUCTURE_VERIFIED.md | `docs/_PACKAGE_STRUCTURE_VERIFIED.md` | `.failsafe/archive/completion-markers/_PACKAGE_STRUCTURE_VERIFIED.md` | .md | 2026-03-09T22:00:00Z |
| 5 | _PHYSICAL_ISOLATION_COMPLETE.md | `docs/_PHYSICAL_ISOLATION_COMPLETE.md` | `.failsafe/archive/completion-markers/_PHYSICAL_ISOLATION_COMPLETE.md` | .md | 2026-03-09T22:00:00Z |
| 6 | _QORELOGIC_GOVERNANCE_COMPLETE.md | `docs/_QORELOGIC_GOVERNANCE_COMPLETE.md` | `.failsafe/archive/completion-markers/_QORELOGIC_GOVERNANCE_COMPLETE.md` | .md | 2026-03-09T22:00:00Z |
| 7 | _WORKSPACE_ISOLATION_COMPLETE.md | `docs/_WORKSPACE_ISOLATION_COMPLETE.md` | `.failsafe/archive/completion-markers/_WORKSPACE_ISOLATION_COMPLETE.md` | .md | 2026-03-09T22:00:00Z |

### Stale Configs to `.failsafe/archive/stale-configs/`

| # | File Name | Original Path | New Path | File Type | Timestamp |
| - | --------- | ------------- | -------- | --------- | --------- |
| 1 | pnpm-lock.yaml | `docs/Planning/pnpm-lock.yaml` | `.failsafe/archive/stale-configs/pnpm-lock.yaml` | .yaml | 2026-03-09T22:00:00Z |
| 2 | postcss.config.mjs | `docs/Planning/postcss.config.mjs` | `.failsafe/archive/stale-configs/postcss.config.mjs` | .mjs | 2026-03-09T22:00:00Z |
| 3 | tailwind.config.ts | `docs/Planning/tailwind.config.ts` | `.failsafe/archive/stale-configs/tailwind.config.ts` | .ts | 2026-03-09T22:00:00Z |
| 4 | tsconfig.json | `docs/Planning/tsconfig.json` | `.failsafe/archive/stale-configs/tsconfig.json` | .json | 2026-03-09T22:00:00Z |

### Screenshot to `FailSafe/ScreenShots/`

| # | File Name | Original Path | New Path | File Type | Timestamp |
| - | --------- | ------------- | -------- | --------- | --------- |
| 1 | SetGovernanceMode.PNG | `./SetGovernanceMode.PNG` | `FailSafe/ScreenShots/SetGovernanceMode.PNG` | .PNG | 2026-03-09T22:00:00Z |

### Duplicate Plan Files Removed from Root

The following 11 plan files were removed from root because identical copies already exist in `.failsafe/governance/plans/`:

| # | File Name | Verified Against |
| - | --------- | --------------- |
| 1 | plan-brainstorm-production.md | `.failsafe/governance/plans/plan-brainstorm-production.md` |
| 2 | plan-data-architecture-remediation.md | `.failsafe/governance/plans/plan-data-architecture-remediation.md` |
| 3 | plan-delivery-gates.md | `.failsafe/governance/plans/plan-delivery-gates.md` |
| 4 | plan-governance-state-integrity.md | `.failsafe/governance/plans/plan-governance-state-integrity.md` |
| 5 | plan-hub-data-reliability.md | `.failsafe/governance/plans/plan-hub-data-reliability.md` |
| 6 | plan-monitor-parity.md | `.failsafe/governance/plans/plan-monitor-parity.md` |
| 7 | plan-ql-document.md | `.failsafe/governance/plans/plan-ql-document.md` |
| 8 | plan-skill-lifecycle.md | `.failsafe/governance/plans/plan-skill-lifecycle.md` |
| 9 | plan-skill-scaffolding.md | `.failsafe/governance/plans/plan-skill-scaffolding.md` |
| 10 | plan-structural-presentation.md | `.failsafe/governance/plans/plan-structural-presentation.md` |
| 11 | plan-v4.6.0-consolidated.md | `.failsafe/governance/plans/plan-v4.6.0-consolidated.md` |

---

## Remaining Root Files (Intentionally Preserved)

### Standard Repository Files (tracked)
- `README.md`, `CHANGELOG.md`, `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `GOVERNANCE.md`, `FILE_INDEX.md`

### AI Instruction Files (gitignored, must stay at root)
- `CLAUDE.md`, `GEMINI.md`

### Configuration (tracked/dotfiles)
- `.gitignore`, `.gitattributes`, `.nvmrc`, `.socket.yml`, `socket.yml`

### Images (tracked, referenced by README)
- `icon.png`, `icon-bw.png`, `icon-pro.png`, `icon-pro-256.png`, `sidebar-icon.png`, `sidebar-icon.svg` — brand assets, git-tracked

**Note**: Root screenshot images (`FailSafe-*.PNG`) were removed in Repository Consolidation (Entry #223) - duplicates exist in `FailSafe/extension/media/`.

---

## Repository Consolidation (2026-03-09)

### Files Removed from Git Tracking

| Category | Count | Path Pattern |
|----------|-------|--------------|
| Root images | 6 | `FailSafe-*.PNG`, `FailSafe-*.png` |
| Antigravity skills | 20 | `FailSafe/Antigravity/**` |
| VSCode prompts | 127 | `FailSafe/VSCode/**` |
| Targets constraints | 7 | `FailSafe/targets/**` |
| PROD-Extension | 42 | `FailSafe/PROD-Extension/**` |

**Total**: 189 files removed from git repository

**Rationale**: These folders contained duplicates of `.claude/skills/` and build artifacts that should be generated, not tracked.

### Folders Removed

| Folder | Reason |
|--------|--------|
| `FailSafe/Antigravity/` | Duplicate Gemini skills - use `.claude/skills/` |
| `FailSafe/VSCode/` | Duplicate Copilot prompts - use `.claude/skills/` |
| `FailSafe/targets/` | Obsolete build constraints |
| `FailSafe/PROD-Extension/` | Build artifacts (generated by CI) |

**Note**: Folders may still exist on disk with gitignored content (`.agent/`, `.qorelogic/` subdirs).

---

## Integrity Verification

- [x] All movements logged
- [x] No duplicate entries
- [x] All original paths documented
- [x] All new paths documented
- [x] Timestamps recorded for all movements
- [x] Protected directories listed
- [x] Manual decisions documented
- [x] Duplicate verification performed before deletion (diff confirmed identical)

---

_This index provides complete traceability of all file movements during organization._

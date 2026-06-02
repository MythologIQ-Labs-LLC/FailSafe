[![Socket Badge](https://badge.socket.dev/openvsx/package/mythologiq.mythologiq-failsafe/5.3.3?platform=universal)](https://badge.socket.dev/openvsx/package/mythologiq.mythologiq-failsafe/5.3.3?platform=universal)

# Planning

Active plans, roadmaps, and sprints.

## Contents

| Type                 | Location    | Format                             |
| -------------------- | ----------- | ---------------------------------- |
| Implementation Plans | `plan-*.md` | Phased implementation details      |
| Roadmaps             | `roadmaps/` | High-level feature timelines       |
| Sprints              | `sprints/`  | Sprint planning and retrospectives |
| Reliability Templates | `templates/reliability/` | Gate artifacts for Freeze->Rollback |

## Plan Format

Implementation plans follow the `/qor-plan` structure.

### Required top-matter

Every plan declares this top-matter before the first phase. `doc_tier` is **mandatory** — the `/qor-implement` Step 8.5 (Documentation Sync) and `/qor-substantiate` Step 4.7 / 6.5 documentation gates read it from the plan gate artifact; an omitted `doc_tier` defaults to `standard` with a WARN, and the doc-currency gates degrade to advisory instead of engaging at the intended strictness.

- **change_class**: `feature` | `breaking` | `hotfix`
- **doc_tier**: `minimal` | `standard` | `system` | `legacy`
  - `minimal` — trivial change; doc sync skipped with WARN.
  - `standard` — default; requires the architecture-plan file tree + relevant architecture-doc section.
  - `system` — requires architecture/operations/schema docs as touched.
  - `legacy` — bypasses doc checks but **requires** a `doc_tier_rationale` line (schema-enforced; logged to the shadow genome as a severity-2 `degradation` event).
- **high_risk_target**: `true` | `false` (security / financial / rights surface)
- **terms_introduced**: (when `standard`/`system` and the plan introduces new terms) each `term:` + its `home:` source location
- **boundaries**: `limitations` / `non_goals` / `exclusions`

### Body structure

- Open questions flagged at top
- Phased approach (2-3 logical phases)
- Specific code changes with minimal prose
- Unit test descriptions grouped by phase
- Affected files summary per phase

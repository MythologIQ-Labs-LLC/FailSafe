# Plan: B193 residual fix-up — SentinelDaemon governance-path corrections

**change_class**: feature
**doc_tier**: standard
**high_risk_target**: false
**originating_remediation**: B193 (residual after Phase 60 §2 Track C)
**target_version**: v5.2.x (no in-cycle bump; rolls into v5.2.0)
**Review boundary**: stage artifacts only — no push/tag/PR/merge/publish without explicit operator approval (consistent with B194 cycle).

**Scope discipline note**: B193 was substantially shipped by Phase 60 §2 Track C (SentinelWatchPolicy extraction, `.md/.yaml/.yml/.json` watched extensions, `.failsafe/**` blanket exclusion removed, governance whitelist added). This residual cycle closes three precise gaps surfaced by the research subagent and marks B193 [x] in BACKLOG with a correct line citation. Out-of-scope: new architecture (WorkspaceMutationBus integration of SentinelDaemon, `governance.fileChanged` drift events) — those are tracked as B-SD-2 if/when needed.

## Open Questions

(none — research closed all questions; gaps are mechanical fixes)

## Decision Log

| Decision | Confidence | Evidence |
|---|---|---|
| Drop stale whitelist entries (`plans.yaml`, `risk-register.yaml`, `intent-store.json`) and replace with canonical fs paths | high | Research subagent confirmed actual paths: `RiskRegisterManager.ts:20` → `.failsafe/risks/risks.json`; `IntentStore.ts:15-17` → `.failsafe/manifest/active_intent.json` + `.failsafe/manifest/intents/`. The whitelist entries don't match. |
| Keep `.failsafe/governance/META_LEDGER.md` AND add `docs/META_LEDGER.md` | high | Actual canonical is `docs/`; the `.failsafe/governance/` variant may exist in legacy or alternate workspaces. Keeping both is additive and harmless. |
| Add `docs/` governance paths to `isGovernanceSurface` priority boost | high | `docs/META_LEDGER.md`, `docs/BACKLOG.md`, `docs/plan-*.md` already pass `shouldWatch` (`.md` ext + non-governance path), but `determinePriority` doesn't boost them to `high` because `isGovernanceSurface` only matches `.failsafe/governance/`. Verdict pipeline currently treats them as `normal` priority. |
| Mark B193 [x] in BACKLOG with reference to Phase 60 §2 Track C + this cycle | high | Operator confirmed close + small fix-up path. |

## Infrastructure Citation Inventory (SG-CitationDrift-A)

1. **SentinelWatchPolicy.ts:39-48 (whitelist files)** — verified by read.
2. **SentinelWatchPolicy.ts:50-52 (whitelist prefixes — currently `.failsafe/governance/plans/`)** — verified.
3. **SentinelWatchPolicy.ts:188-193 (`isGovernanceSurface`)** — verified.
4. **SentinelWatchPolicy.test.ts** — verified ~25 cases at `src/test/sentinel/SentinelWatchPolicy.test.ts` (per research).
5. **Canonical risk path `.failsafe/risks/risks.json`** — `git show HEAD:FailSafe/extension/src/roadmap/services/RiskRegisterManager.ts | grep -nE 'risks.json' -> 20:path.join(workspaceRoot, ".failsafe", "risks", "risks.json")`. (Per cycle-1 F1 remediation: source-file path corrected from earlier `src/qorelogic/risk/` to actual `src/roadmap/services/`.)
6. **Canonical intent path `.failsafe/manifest/active_intent.json` + `.failsafe/manifest/intents/`** — `git show HEAD:FailSafe/extension/src/governance/IntentStore.ts | grep -nE 'manifest|active_intent' -> 15-17 verified canonical`. (Per cycle-1 F1 remediation: source-file path corrected from earlier `src/intent/` to actual `src/governance/`.)
7. **docs/ paths** — `docs/META_LEDGER.md` (377KB+), `docs/BACKLOG.md`, `docs/plan-*.md` (14+ files at root).

## Phase 1: Whitelist + isGovernanceSurface corrections

### Affected files
- `src/sentinel/SentinelWatchPolicy.ts` — three precise edits:
  1. `GOVERNANCE_WHITELIST_FILES` array: REMOVE `'.failsafe/governance/plans.yaml'`, `'.failsafe/governance/risk-register.yaml'`, `'.failsafe/governance/intent-store.json'`. ADD `'.failsafe/risks/risks.json'`, `'.failsafe/manifest/active_intent.json'`, `'docs/META_LEDGER.md'`, `'docs/BACKLOG.md'`.
  2. `GOVERNANCE_WHITELIST_PREFIXES` array: ADD `'.failsafe/governance/'` (per cycle-1 F2 remediation: covers 70+ on-disk variant files including `AUDIT_REPORT_*.md`, `RESEARCH_BRIEF_*.md`, `IMPLEMENTATION_REPORT_*.md`, `SESSION_STATE_*.md`, etc. that the bare suffix-equality whitelist silently dropped). ADD `'.failsafe/manifest/intents/'` (per-intent files). ADD `'docs/plan-'` (covers `docs/plan-*.md`). Keep existing `.failsafe/governance/plans/`. After this change, `GOVERNANCE_WHITELIST_FILES` entries for `.failsafe/governance/AUDIT_REPORT.md`, `V5_1_0_SCOPE.md`, `RESEARCH_BRIEF.md`, `META_LEDGER.md` become redundant (the prefix covers them) but remain as documentation anchors.
  3. `isGovernanceSurface` method: extend the predicate to ALSO match `docs/META_LEDGER.md`, `docs/BACKLOG.md`, and paths matching `docs/plan-*` so they get `'high'` priority in the verdict pipeline.

### Unit tests
- `src/test/sentinel/SentinelWatchPolicy.test.ts` (EXTEND): add cases under SG-035 (invoke + assert):
  1. `isWatchedGovernancePath('docs/META_LEDGER.md')` → true.
  2. `isWatchedGovernancePath('docs/BACKLOG.md')` → true.
  3. `isWatchedGovernancePath('docs/plan-qor-foo.md')` → true (prefix glob).
  4. `isWatchedGovernancePath('.failsafe/risks/risks.json')` → true.
  5. `isWatchedGovernancePath('.failsafe/manifest/active_intent.json')` → true.
  6. `isWatchedGovernancePath('.failsafe/manifest/intents/intent-abc.json')` → true.
  7. `determinePriority('docs/META_LEDGER.md')` → `'high'` (priority-boost via extended isGovernanceSurface).
  8. `determinePriority('docs/BACKLOG.md')` → `'high'`.
  9. `determinePriority('docs/plan-qor-foo.md')` → `'high'`.
  10. Removed stale entries — `isWatchedGovernancePath('.failsafe/governance/plans.yaml')` → **true** (because the new `.failsafe/governance/` prefix matches even though the explicit file entry was dropped — the prefix is broader). The prior plan revision suggested **false**; cycle-1 F2 remediation changes the prefix scope so the assertion must match the broader rule.
  11. (Per cycle-1 F2): `isWatchedGovernancePath('.failsafe/governance/AUDIT_REPORT_voice-substrate-extraction.md')` → **true** (variant-suffix file covered by the new prefix; was silently dropped before).
  12. (Per cycle-1 F2): `isWatchedGovernancePath('.failsafe/governance/SESSION_STATE_bicameral-mcp-integration.md')` → **true** (variant-suffix file covered).

## Phase 2: BACKLOG closure + CHANGELOG + FEATURE_INDEX

### Affected files
- `docs/BACKLOG.md`: change `[B193]` from `[ ]` to `[x]` with description: "**IMPLEMENTED — Phase 60 §2 Track C + B193 residual fix-up cycle 2026-05-19.** Phase 60 §2 Track C (already shipped) extracted `SentinelWatchPolicy`, added `.md`/`.yaml`/`.yml`/`.json` to watched extensions, removed the `.failsafe/**` blanket exclusion, and added a governance whitelist. Residual fix-up cycle (this entry) corrected stale whitelist paths to canonical fs locations (`.failsafe/risks/risks.json`, `.failsafe/manifest/active_intent.json` + `manifest/intents/` glob) and added `docs/META_LEDGER.md` + `docs/BACKLOG.md` + `docs/plan-*` to both the whitelist AND `isGovernanceSurface` priority-boost predicate. Plan: `docs/plan-qor-sentinel-governance-extensions.md`."
- `docs/FEATURE_INDEX.md`: add FX510 row (single feature: corrected governance whitelist + priority boost).
- `CHANGELOG.md`: append to `[Unreleased]` `### Added`: "B193 residual fix-up — SentinelWatchPolicy whitelist corrected to canonical fs locations; docs/ governance paths now priority-boosted."

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX510 | NEW | `src/test/sentinel/SentinelWatchPolicy.test.ts` (extended) | Whitelist + isGovernanceSurface cover canonical risks/intent/docs governance paths; stale `.failsafe/governance/plans.yaml` entry no longer returns true |

## CI Commands
- `npm run lint` — ESLint 0 errors.
- `npm test` — mocha pass (existing baseline + 10 new functional cases).
- No Playwright change-class trigger (no UI surface touched).

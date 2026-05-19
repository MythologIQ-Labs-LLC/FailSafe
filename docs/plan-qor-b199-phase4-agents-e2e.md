# Plan: B199 Phase 4 — Agents tab Playwright E2E

**change_class**: feature
**doc_tier**: standard
**high_risk_target**: false
**originating_remediation**: B199 (Phase 4 of multi-cycle effort)
**target_version**: v5.2.x
**Review boundary**: stage artifacts only; push when sealed.

## Scope discipline

B199 multi-cycle progress:
- **Phase 1**: methodology + Monitor + CI gate (shipped).
- **Phase 2**: Settings tab cards + B-EM-4 harness (pushed).
- **Phase 3**: Voice Pack installed state + B-BIC inheritance (pushed).
- **Phase 4 (THIS CYCLE)**: Agents tab structural coverage.

The Agents tab hosts 4 sub-views via `TabGroup`: Operations / Timeline / Genome / Replay. This Phase establishes **baseline structural coverage** — tab loads, sub-pills render, sub-pill switch activates the correct pill + renders the content area. Deep per-sub-view behavioral coverage (agent health metrics, run list rendering, genome failure-pattern cards, replay step playback) is **explicitly deferred to a future Phase** because each sub-view warrants its own scope.

## Decision Log

| Decision | Confidence | Evidence |
|---|---|---|
| Branch off `feat/b199-phase3-integrations-e2e` | high | Inherits B-BIC + B-EM-4 substrate chain from Phase 3. Linear successor (no federation collision). |
| Cover structural surface only (load + pill switch); defer behavioral sub-views | high | Operator scope discipline "one surface per phase". Behavioral coverage of 4 sub-views in one phase would re-introduce the over-scoping Phase 2 cycle-1 rejected. |
| Skip formal architect-reviewer audit | medium | Spec is 3 cases against an existing UI structure; no production-code changes. Phase 3 pattern (lightweight cycle) re-applied. |

## Phase 1: Playwright spec

### Affected files
- `src/test/ui/agents-tab.spec.ts` (NEW). 3 active Playwright cases:
  1. Agents tab loads + 4 sub-pills render (Operations/Timeline/Genome/Replay).
  2. Operations sub-pill is active by default (TabGroup invariant).
  3. Clicking Replay sub-pill activates it + renders `.cc-subview-content` container.

### Doc updates
- `docs/BACKLOG.md`: B199 Phase 4 progress entry.
- `docs/FEATURE_INDEX.md`: append FX520 row.
- `CHANGELOG.md`: append Phase 4 paragraph.

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX520 | NEW | `src/test/ui/agents-tab.spec.ts` | Playwright Agents tab: 4 sub-pills render; Operations active by default; Replay click activates correct pill + content area |

## CI Commands
- `npx playwright test --grep "FX520"` — Playwright pass for new spec.
- `npm test` — mocha baseline preserved.

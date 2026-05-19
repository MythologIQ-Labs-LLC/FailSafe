# Plan: B199 Phase 3 — Integrations tab Playwright E2E

**change_class**: feature
**doc_tier**: standard
**high_risk_target**: false
**originating_remediation**: B199 (Phase 3 of multi-cycle effort)
**target_version**: v5.2.x
**Review boundary**: stage artifacts only; push when sealed.

## Scope discipline

B199 is CRITICAL and multi-cycle:
- **Phase 1** (Entries #283/#284): methodology + Monitor compact-UI + release-class CI gate.
- **Phase 2** (branch-local Entry #377, pushed on `feat/b199-phase2-settings-e2e`): Settings tab cards + B-EM-4 harness override.
- **Phase 3 (THIS CYCLE)**: Integrations tab — Bicameral card states + Voice Pack card installed state.

## Branch + substrate dependency

This branch (`feat/b199-phase3-integrations-e2e`) is off `feat/bicameral-enhancements-quickwins` so it inherits the B-BIC-1..5 implementations needed for cases 4-5 (ratify ledger + capability cache).

The B-EM-4 harness override is **replicated inline** (~20 LOC in `serveConsoleServerUI.ts` + `playwright.config.ts` testMatch tightening) rather than merged from `feat/b199-phase2-settings-e2e` to avoid a 3-way federation merge mid-cycle. The harness implementation is identical; convergence happens at the final merge-into-main pass per operator preference.

## Decision Log

| Decision | Confidence | Evidence |
|---|---|---|
| Branch off `feat/bicameral-enhancements-quickwins` (NOT main) | high | Cases 4-5 require B-BIC-1 ratify ledger + B-BIC-4 capability cache. Branching off the dependency saves a merge. |
| Replicate B-EM-4 substrate inline (not merge Phase 2 branch) | high | The override is ~20 LOC; merge would require 3-way federation reconciliation at META_LEDGER #377. Replication is faster + correctness-equivalent. Eventual main merge consolidates. |
| Reuse existing `integrations-bicameral.spec.ts` (FX490) cases 1-3 | high | They already pass and target the same UI. Not duplicating. |
| Skip case 5 (capability dimming) if UI dimming logic isn't shipped yet | medium | B-BIC-4 cached capabilities but didn't add UI dimming consumer — that's B-BIC-13 deferred scope. Test would need to assert against a feature we haven't built. Defer to follow-on cycle. |

## Infrastructure citation inventory

1. **B-BIC-1 ratify ledger entry**: `BicameralRoute.ts` ratify handler appends `USER_OVERRIDE` via `ledgerManager.appendEntry`. Verified on this branch via prior cycle's FX514 tests.
2. **B-BIC-4 capability cache**: `BicameralMcpClient.getCapabilities()` returns Set<string>. Verified by FX517 tests on this branch.
3. **B-EM-4 harness override**: replicated `serveConsoleServerUI.ts` middleware + router-stack unshift; `playwright.config.ts` testMatch tightening.
4. **Existing FX490 spec**: `src/test/ui/integrations-bicameral.spec.ts` already covers Bicameral card not-installed / configured-not-running / running states. Confirm still passes.
5. **Voice Pack route**: `src/test/ui/helpers/serveConsoleServerUI.ts:251` calls `setVoicePackPath` when `voicePackInstalled: true` is in fixtures. Confirms the fixture supports installed state.

## Phase 1: Integrations tab Playwright spec

### Affected files

- `src/test/ui/integrations-tab.spec.ts` (NEW, ≤200L). 3 new active Playwright cases against the live ConsoleServer harness:
  1. **Voice Pack card on Integrations**: actually voice-pack-settings-card renders in Settings tab (not Integrations). So this case verifies the Voice Pack card under Settings tab using the B-EM-4 override + `voicePackInstalled: true` fixture → card shows Uninstall button + disk-usage row (was deferred in Phase 2).
  2. **Bicameral ratify end-to-end**: harness with `bicameralClient` stub + `ledgerManager` stub → click Ratify on a decision row → POST `/api/actions/bicameral-ratify` returns ok → `ledgerManager.appendEntry` invoked. Verifies B-BIC-1 surfaces correctly through the UI click path.
  3. **Bicameral capability surfacing**: harness with `bicameralClient` whose `getCapabilities()` returns a known set → fetch `/api/integrations/bicameral/capabilities` (if route exists; otherwise this is `.skip` pending B-BIC-13 UI work).

### Out of scope (test.skip if blocked)

- Case 5 (capability-driven UI dimming): the cached `getCapabilities()` accessor exists, but UI consumption (B-BIC-13) is deferred. If the UI doesn't read capabilities, the test asserts a non-existent affordance — staged as `.skip` with B-BIC-13 reference.

## Phase 2: Doc + indices

### Affected files
- `docs/BACKLOG.md`: update B199 status with Phase 3 progress entry.
- `docs/FEATURE_INDEX.md`: append FX519 (Integrations tab Playwright cases).
- `CHANGELOG.md` `[Unreleased]`: append Phase 3 paragraph.

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX519 | NEW | `src/test/ui/integrations-tab.spec.ts` | Playwright Integrations tab: Voice Pack installed state (B-EM-4 override) + Bicameral ratify end-to-end ledger append (B-BIC-1) |

## CI Commands
- `npx playwright test --grep "FX519"` — Playwright pass for new spec.
- `npm test` — mocha baseline preserved.

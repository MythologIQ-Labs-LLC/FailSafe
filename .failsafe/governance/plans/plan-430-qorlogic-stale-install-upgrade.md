# Plan: Upgrade a stale qor-logic install instead of treating presence as compatible

**change_class**: hotfix

**doc_tier**: standard

**boundaries**:
- limitations:
  - Retroactive plan. The implementation and its tests already exist on branch `fix/430-qorlogic-stale-install-upgrade` (PR #432, exact head `237457b`) and were validated (209/209 `qorlogic/` unit tests, `tsc` clean, `eslint` clean) before this plan was authored. A governance-blocking review on PR #432 (2026-08-23) found no `/qor-audit` PASS was recorded for the change, per AGENTS.md's binding rule ("Never implement without a PASS verdict from /qor-audit") — no L1 exemption exists in AGENTS.md, so none applies here. This plan exists to close that process gap: describe the already-implemented change precisely enough for `/qor-audit` to render an honest verdict against the real diff, not a paraphrase of it.
  - Single call-site-ordering defect, one production file plus its test file. No new module, no new dependency, no new public API surface.
- non_goals:
  - NOT a version-ceiling addition to the qor-logic install spec (floor-only pin stays as-is; a floor+ceiling pin like the Bicameral integration's is a separate, softer follow-up recorded on FailSafe#243, not this plan).
  - NOT a change to `bootstrapWorkspace.ts`'s separate, direct `isInstalled()` call (a status-display read, not an upgrade-gating decision — different call site, different purpose, out of scope).
  - NOT a fix for the two other FailSafe#243 Tranche D findings from the same audit pass (`renderUpstreamRow` swallowing an offline/registry-error snapshot; `WorkspaceArtifactBuilder` never receiving `versionStatus`/`maxAgeMs`) — both recorded as follow-up candidates on #243, not bundled here.
- exclusions: none beyond the non_goals above.
- precondition: FailSafe#243 Tranche D (offline/platform/compatibility matrix) audit traced the qor-logic version-floor check (`QorLogicPackageInstaller.verifyInstalledVersion()`) and found it exists, is correct, and is simply never consulted by the actual upgrade-gating call sites. Filed as FailSafe#430.

## Open Questions

None. The defect, fix, and test evidence are already concrete (see "Defect this plan closes" below); nothing here depends on an unresolved design choice.

## Defect this plan closes

`QorLogicSkillIngestor.ensurePackageInstalled()` (`extension/src/qorlogic/QorLogicSkillIngestor.ts:100-111`) and its private `ensureInstalled()` (`:170-175`) both gated the "should this run `pip install --upgrade qor-logic`?" decision on `IQorLogicPackageInstaller.isInstalled()` — which checks package-name presence only (`pip show qor-logic` regex on `Name:`), never the installed version against `MIN_QOR_LOGIC_VERSION`. `verifyInstalledVersion()` (`QorLogicPackageInstaller.ts:103-112`) already does the correct floor comparison but was never consulted on this path.

**Reproducible failure:** operator has qor-logic `0.20.0` installed, floor is `0.31.1`. The Settings card (`install-skills-card.js`) explicitly promises clicking "Install / Refresh Skills" upgrades to the floor or newer. `ensurePackageInstalled()` calls `isInstalled()` → `true` (present, any version) → returns success **without running `pip install --upgrade`**. `installHost()` then spawns `qor.cli install` with the stale `0.20.0` CLI and still reports success — the exact upgrade the UI promised does not happen.

## Phase 1: Gate on version-floor, not presence

### Affected Files

- `extension/src/test/qorlogic/QorLogicSkillIngestor.test.ts` — MODIFIED; `FakeInstaller` gains `installedVersion`/`meetsFloor` fields so `verifyInstalledVersion()` can be driven independently of `installed`; renamed one existing test for precision; added a new regression test for the stale-but-present case.
- `extension/src/qorlogic/QorLogicSkillIngestor.ts` — MODIFIED; both call sites swap their gate from `isInstalled()` to `verifyInstalledVersion().meetsFloor`.

### Changes

`ensurePackageInstalled()` (was: `if (await this.installer.isInstalled()) return { ok: true, command: 'qor-logic already installed' };`) becomes:

```typescript
const status = await this.installer.verifyInstalledVersion();
if (status.meetsFloor) return { ok: true, command: `qor-logic ${status.installed} already meets floor ${status.minimum}` };
const result = await this.installer.install();
// ...unchanged from here
```

(Single-line `if`/`return`, matching `ensureInstalled()`'s style below — not a multi-line braced block. The file was already at exactly 250 lines pre-change; a braced form would have pushed it to 252, over AGENTS.md's 250-line-per-file razor limit. The single-line form keeps the file at exactly 250.)

`ensureInstalled()` (was: `if (await this.installer.isInstalled()) return { ok: true };`) becomes:

```typescript
const status = await this.installer.verifyInstalledVersion();
if (status.meetsFloor) return { ok: true };
const result = await this.installer.install();
// ...unchanged from here
```

Both changes are pure gate-condition swaps; nothing else in either method's control flow, error handling, or return shape changes. `verifyInstalledVersion()` already has the right degrade-safe defaults for an absent install (`{ installed: null, minimum, meetsFloor: false }`), so the "not installed" branch behaves identically to before — `install()` still runs.

### Unit Tests

- `QorLogicSkillIngestor.test.ts`:
  - `skips install when qor-logic already installed and meets the version floor` (renamed from `skips install when qor-logic already installed` for precision — the prior name didn't state the floor condition the fix makes load-bearing) — `installer.installed = true; installer.meetsFloor = true`; asserts `installer.installCalls === 0`.
  - `upgrades when qor-logic is present but below the version floor (#243 Tranche D)` — NEW; `installer.installed = true; installer.installedVersion = '0.20.0'; installer.meetsFloor = false`; asserts `installer.installCalls === 1`. This is the test that is red against the pre-fix gate and green after.
  - `auto-installs qor-logic when not yet present` (pre-existing, unchanged) — `installer.installed = false`; still asserts `installer.installCalls === 1`, proving the absent-install path is unaffected by the gate swap.

## CI Commands

- `cd FailSafe/extension && npx tsc -p ./` — TypeScript compilation.
- `cd FailSafe/extension && npx mocha --ui tdd --timeout 15000 out/test/qorlogic/QorLogicSkillIngestor.test.js` — the direct suite (compiled output must exist from the `tsc` step above).
- `cd FailSafe/extension && npx mocha --ui tdd --timeout 15000 $(find out/test -path "*qorlogic*" -name "*.test.js")` — full `qorlogic/` unit-test tree, since this change sits in a shared class other suites construct.
- `cd FailSafe/extension && npx eslint src/qorlogic/QorLogicSkillIngestor.ts src/test/qorlogic/QorLogicSkillIngestor.test.ts` — lint on both touched files.
- `npm test` (`vscode-test`) is NOT run as part of this plan's CI commands: this sandbox cannot provision the VS Code Electron extension-host (documented limitation, same as prior #239-series audits in this repository). The touched files import no `vscode` module (verified: `grep -n "from 'vscode'" QorLogicSkillIngestor.ts QorLogicPackageInstaller.ts hostLayouts.ts qorLogicInstallRecord.ts` returns nothing), so the direct-mocha commands above exercise the real compiled code, not a mock.

## Phase Order Rationale

Single phase — the defect, fix, and both test-side changes are one indivisible unit; there is no smaller shippable slice and no dependency ordering to sequence.

## Review-Boundary attestation

This plan documents work already implemented and pushed to PR #432 (not yet merged). `/qor-audit` against this plan is the retroactive gate the PR's review requires before it returns to ready-for-review; the operator (PR reviewer) remains the sole merge authority. No push, tag, build-publish, or marketplace action is implied or authorized by this plan or by a PASS verdict on it.

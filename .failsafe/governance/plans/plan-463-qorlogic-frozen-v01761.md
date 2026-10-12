# Plan #463A: Non-destructive FailSafe alignment to frozen Qor-logic v0.176.1

**change_class**: hotfix

**doc_tier**: standard

**terms**:
- `frozen Qor-logic target`: the exact upstream distribution this supported FailSafe release is intended to install and integrate with (`0.176.1`).
- `last conformance-tested version`: the upstream version for which a recorded, passing compatibility probe exists; it is not inferred from the target.

**boundaries**:
- limitations:
  - Source reconnaissance was completed against FailSafe `main` at `f16a8dd1aaa609bb4509f2c890338c944d5fc7b8`; rerun the collision/head check before implementation.
  - This document is an audit **candidate**, not a `/qor-plan` gate artifact, an audit PASS, or a tested implementation. The audit executor must create/validate the canonical session plan artifact before running `/qor-audit`.
  - Hosted CI budget is limited; perform local targeted verification first. A plan-only commit must not be treated as a release.
- non_goals:
  - Do not modify frozen Qor-logic source, migrate to a successor engine, merge to `main`, or publish FailSafe.
  - Do not bump `TESTED_AGAINST_QOR_LOGIC_VERSION` from `0.169.0` until a passing v0.176.1 conformance probe is linked.
  - Do not silently downgrade, upgrade, overwrite host governance files, or rewrite old ledgers on observation.
  - Do not expand supported host choices beyond the existing mirrored four; cursor/cline capability expansion needs a separate decision.
  - Do not fold repository Mind Map/voice work (#464/#465) into this compatibility tranche.
- exclusions:
  - Full Windows/macOS/Linux VS Code extension-host conformance and consented replacement/rollback will be gated separately within #463 before final release signoff.

## Open Questions

None that block planning the non-destructive target/status/fresh-install tranche. Any change to the operator's *existing* Python environment requires a separate explicit consent and rollback design, not implied permission from selecting `Install Skills`.

## Verified evidence and locked decisions

**LD1 — Keep three claims independent.** `hostLayouts.ts` currently declares `MIN_QOR_LOGIC_VERSION = "0.31.1"`, `TESTED_AGAINST_QOR_LOGIC_VERSION = "0.169.0"`, and historical host comments. Qor-logic release `v0.176.1` exists (tag + PyPI). Define `FROZEN_QOR_LOGIC_VERSION = "0.176.1"` independently; do not rewrite either historical value solely to make a new status look green.
- Verification: `rg -n 'MIN_QOR_LOGIC_VERSION|TESTED_AGAINST_QOR_LOGIC_VERSION' FailSafe/extension/src/qorlogic/hostLayouts.ts`; compare upstream tag `v0.176.1`.

**LD2 — Distinguish missing from broken probes.** `QorLogicPackageInstaller.verifyInstalledVersion()` currently maps pip errors and absent package to the same `installed: null` status; `unknownVersionStatus()` treats both as below floor. That is insufficient authority to auto-install. Introduce a read-only probe that yields `exact | older | newer | absent | unknown`, with `unknown` for pip spawn/timeout/permission/unparseable evidence, and `absent` only for a positively identified missing distribution. Preserve the old minimum/tested fields for existing consumers. No new remote provider or interpreter.
- Verification: `rg -n 'runPipShow|verifyInstalledVersion|unknownVersionStatus|parseVersionLine' FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts`.

**LD3 — Fresh exact install, never unattended replacement.** `QorLogicPackageInstaller.install()` currently invokes `python -m pip install --upgrade qor-logic>=0.31.1`; `QorLogicSkillIngestor.ensurePackageInstalled()` and `ensureInstalled()` skip any installed version satisfying the floor. Bootstrap `stepQorLogicPackage()` checks `isInstalled()` by name alone. For a **proven absent** distribution, install `qor-logic==0.176.1` in list-form subprocess args, then verify the actual resulting installed version. For an existing divergent or unknown install, return an actionable non-success/deferred mismatch and perform **no pip install, no host-skill install, no silent downgrade**. A consented repair flow is outside this tranche and is a prerequisite for a fully complete #463.
- Verification: `rg -n 'pip.*install|ensurePackageInstalled|ensureInstalled|isInstalled\(' FailSafe/extension/src/qorlogic/{QorLogicPackageInstaller.ts,QorLogicSkillIngestor.ts} FailSafe/extension/src/extension/bootstrapWorkspace.ts`.

**LD4 — Preserve advisory consumer semantics.** `consumer/diagnostics.ts` already exposes `untested` as advisory and the adapter distinguishes `ok/unavailable/malformed/unsupported/stale`. A frozen-version mismatch must be visible in a distinct target-status field; do not mark otherwise-readable canonical artifacts malformed and do not call an untested version conformance-PASS.
- Verification: `rg -n 'testedAgainst|matchesTested|untested|unsupported' FailSafe/extension/src/qorlogic/consumer/{types.ts,diagnostics.ts}`.

**LD4a — The existing conformance probe is report-only.** `scripts/qor-conformance-probe.cjs` explicitly exits 0 even when a control is NOT-FALSIFIABLE, UNAVAILABLE, or INCONCLUSIVE. Its `version_boundary` row reports UNTESTED for a new target versus historical `TESTED_AGAINST`. Running that command without inspecting all returned rows is **not** evidence of a PASS. Keep the 0.169.0 tested-against anchor unchanged in this tranche; the separate conformance phase must inspect the machine-readable report, re-exercise all relevant negative fixtures on the real 0.176.1 wheel, and record a verifiable accepted result before changing the historical anchor.
- Verification: `rg -n 'REPORT ONLY|process.exit\\(0\\)|versionBoundary|NOT.FALSIFIABLE|INCONCLUSIVE' FailSafe/extension/scripts/qor-conformance-probe.cjs` and `src/test/scripts/qorConformanceProbe.test.cjs`.

**LD5 — Keep the scope small.** `QorLogicPackageInstaller.ts` is 250 lines and `QorLogicSkillIngestor.ts` is approximately at the same Section 4 Razor limit. Place pure target classification in a small sibling module; extract existing helpers or reduce complexity rather than exceeding 250 lines/file, 40 lines/function, or nesting depth 3.

## Phase 1: Add a tested, pure frozen-target status

### Affected files

- `FailSafe/extension/src/qorlogic/hostLayouts.ts` — add the frozen target constant and correct only future-facing comments; preserve last-tested history.
- `FailSafe/extension/src/qorlogic/frozen-target-status.ts` — new pure classifier with typed target states and explicit input/error semantics.
- `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts` — surface the non-mutating observation without erasing the existing minimum/tested fields.
- `FailSafe/extension/src/test/qorlogic/frozen-target-status.test.ts` — focused falsifying classifier tests.
- `FailSafe/extension/src/test/qorlogic/QorLogicPackageInstaller.test.ts` — verify actual interpreter process outcomes map to correct states.

### Changes

1. `exact` only for the installed distribution's exact canonical `0.176.1` version; `older` for known installed earlier versions; `newer` for known later versions; `absent` only for conclusive package-not-found; `unknown` for untrusted or failed observation. Do not guess absent from a nonzero return code alone.
2. Emit expected version, observed version or null, classifier state, and diagnostic reason without implying a real `/qor-audit` verdict.
3. Keep SemVer ordering separate from exact-match identity. Do not silently accept malformed/pre-release values as equal.
4. Caller reads and status probes never invoke pip install, host registration, or workspace writes.

### Unit tests (functional, negative controls)

- For known `0.176.1`, `0.169.0`, and `0.177.0`, assert respectively `exact`, `older`, `newer`, while `matchesTested` remains false at `0.176.1` until separately proven.
- For recognized pip package-missing output, assert `absent`; for exit 1 with unrelated stderr, a timeout, spawn rejection, or unparseable `Version:`, assert `unknown` and no installation.
- Mutate expected target to an incorrect value in a test double and assert an exact installed version no longer classifies as `exact`.

## Phase 2: Govern fresh installs and all existing call sites

### Affected files

- `FailSafe/extension/src/qorlogic/QorLogicPackageInstaller.ts` — exact package spec, safe probe gate, post-install exact verification and typed error.
- `FailSafe/extension/src/qorlogic/QorLogicSkillIngestor.ts` — do not use `meetsFloor` as permission to install or reuse an untested divergent runtime.
- `FailSafe/extension/src/extension/bootstrapWorkspace.ts` — replace `isInstalled()` as sole readiness evidence; report deferred mismatch in silent/auto mode.
- `FailSafe/extension/src/extension/installSkillsHandler.ts` and relevant settings card/report — explain why a divergent environment was not overwritten and give an explicit supported next action.
- `FailSafe/extension/src/test/qorlogic/{QorLogicPackageInstaller,QorLogicSkillIngestor}.test.ts` — process argument, side-effect and mismatch regression.
- Existing bootstrap test harness or a new narrow injection-test file — test public `runWorkspaceBootstrap()` against stubbed installer and VS Code UI.

### Changes

1. Only an absent, reliably probed installation can run a fresh exact install through the existing resolved Python interpreter; use list-form args, exact `qor-logic==0.176.1`, and verify actual resulting version. Pip success code alone is not completion.
2. Exact existing version: no pip or host reinstall unless the operator initiated the existing supported workflow; no silent mutation of workspace governance.
3. Existing older/newer version: report a visible `version-mismatch` and stop downstream skill ingestion; **do not call** `install()` as a shortcut to downgrade/upgrade. Unknown probe: block mutation with actionable diagnostics.
4. Preserve auto/silent/interactive differences: silent mode never installs; interactive mode may install only if confirmed absent and explicitly accepted; automatic mode may retain its current absent-package provisioning contract but never replace a known existing package.
5. Preserve existing read-only artifact visibility as advisory. The frozen target mismatch is not by itself proof of broken ledger contents.
6. Existing `QorLogicSkillIngestor.test.ts` contains a stale-version auto-upgrade regression for the old floor-only behavior. Update its semantics transparently to the new frozen-target decision; do not merely delete or weaken that test.

### Unit tests (must fail on pre-change behavior)

- Fresh absent install argv is exactly `python -m pip install qor-logic==0.176.1` (plus interpreter prefix where applicable), and a verified `0.176.1` is required to report success.
- Existing 0.169.0/0.177.0 and unknown probe: zero pip mutations and zero `qor.cli install` invocations, with explicit mismatch/unknown result.
- Existing 0.176.1: no unnecessary pip mutation; any permitted host installation reports real canonical `.qorlogic-installed.json` status.
- Bootstrap with package present but divergent must **not** return package step `ok`; silent mode returns a non-mutating reason; interactive install permission does not silently authorize replacement.
- A successful subprocess that installs the wrong version must return failure and must not launch host skill ingestion.
- Failure injection: no Python, pip timeout, pip offline, malformed output, missing/corrupt installed manifest; errors propagate without fabricated success.

## Definition of Done

- **D1 (spec):** Frozen Qor-logic target `0.176.1` and last conformance-tested version are documented separately with source links.
- **D2 (code):** All cited install/bootstrap/ingestor paths refuse unapproved changes to existing installations and use exact specs for provably absent installs.
- **D3 (governance):** Canonical session plan gate exists; independent `/qor-audit` PASS for this exact plan/hash precedes any implementation. Subsequent `/qor-substantiate` and operator merge approval remain required.
- **D4 (behavior):** Positive and negative compiled unit tests demonstrate real state/argv/side-effect outcomes; local lint/typecheck pass; a disposable-venv real-wheel smoke run validates installed `0.176.1` before delivery.
- **D4.d (manual host):** Full Windows/macOS/Linux VS Code/Cursor runtime, explicit repair/rollback and cross-distribution package parity remain scoped to follow-on #463 conformance/release phase. **Follow-up phase:** #463 B/C; this waiver must not be read as permission to publish.

## CI Commands

Run locally before any hosted CI:

```bash
cd FailSafe/extension
npm ci
npm run compile
npx eslint src/qorlogic src/extension/bootstrapWorkspace.ts src/extension/installSkillsHandler.ts
npx mocha --ui tdd --timeout 15000 out/test/qorlogic/QorLogicPackageInstaller.test.js out/test/qorlogic/QorLogicSkillIngestor.test.js out/test/qorlogic/frozen-target-status.test.js
node scripts/run-node-tests.cjs
```

Additional targeted bootstrap tests should be appended to the local mocha invocation when the test seam is chosen by the auditor. A real PyPI wheel test requires reachable package registry or a previously verified local wheel; otherwise record BLOCKED, not PASS. The conformance script is report-only: run `node scripts/qor-conformance-probe.cjs --json` and inspect each row's result plus falsifier evidence; exit code 0 alone never constitutes PASS.

## Phase order rationale and release boundary

Classification precedes mutation gating, so evidence is not inferred from failed installs. Tests must exercise real output/side-effect behavior, not just source-text presence. **No source implementation, merge, tag, marketplace publish, or `TESTED_AGAINST` bump is authorized merely by committing this plan.** Audit the plan against current source and revise any incorrect citations before implementation.

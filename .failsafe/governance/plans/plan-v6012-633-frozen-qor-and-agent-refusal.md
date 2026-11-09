# Plan: v6.0.12 integration of PR #633 — frozen Qor-logic 0.176.1 consumer (#463) and fail-closed external agents (#475)

**iteration**: 2 (amends iteration 1 after the 2026-11-09 VETO, ledger Entry #915)
**change_class**: feature
**risk_grade (proposed)**: L3 (security-critical: subprocess execution, package installation, credential-adjacent paths)
**pr_target**: `release/v6.0.12-rc1-candidate-20261108-no-ci` (PR #631, RC1 source `3d722d02`)
**Source under review**: PR #633 branch `fix/475-no-uncontained-agent-execution-v6012-20261108-no-ci`; the exact head SHA is stated in the commit that submits this iteration and in the audit request (the plan gate schema has no head field).

## Ordering inversion (DECLARED, not sanctioned)

This plan is authored **after** the implementation. The #633 commits were written and pushed to a draft PR branch before any `/qor-plan` or `/qor-audit`. Nothing has been merged to `main` or to the RC1 branch, so the integration boundary has not been crossed. The native helper recorded a severity-1 `gate_override` shadow event (`b9f0a002…`, session `2026-11-09T1550-4e0666`). The helper wrote it to `docs/PROCESS_SHADOW_GENOME_UPSTREAM.md`, which this repository gitignores, so it is local evidence only and not in the committed tree; this plan text and the commit history are the committed disclosure. (Iteration 1 misstated it as severity-2.)

This audit therefore reviews existing code **before integration**. It does **not** claim, and must not be described as, a pre-implementation PASS. No earlier date is asserted anywhere.

## Scope relation to #467 (disclosure)

- **Unrecoverable evidence:** the October operator-local VETOs #610–#612 and shadow event `7126134e` are UNKNOWN/UNRESOLVED (evidence `a723b366`, `recovery/MANIFEST.md`). This plan neither closes, supersedes nor reinterprets them.
- **Distinct scope:** this is a new plan with distinct scope (#463 consumer hardening and #475 agent refusal), in a new session with true timestamps. The owner's 2026-11-09 directive requires "the authentic prospective `/qor-plan` and `/qor-audit` workflow where required". The October VETOed scope is not resubmitted under a new name.
- **Unaddressed here:** #467 G4 (ledger-prose witness), #476 (SHIELD publisher) and #505 (editor-save prevention). They remain open and are explicitly out of scope.

## Problem

1. **#463: FailSafe's Qor-logic consumer did not match the frozen 0.176.1 release.**
   - Production ran unbounded `pip install --upgrade qor-logic>=0.31.1` from PyPI.
   - It offered selective-skill install (`--include`) and a JSON preview (`install --dry-run --json`), neither of which 0.176.1 supports: they exit 2 and write 0 files.
   - It treated a zero exit plus any existing receipt as a successful install.
2. **#475: Aider and Continue ran as ordinary user-level processes inside a git worktree.** A worktree is not an OS sandbox. The 2026-11-07 Low-IL research boundary gives write-up protection only: secrets stay readable and network exfiltration remains possible.

## Design (as implemented on #633 plus integration fixes `9b66c8f7`)

### Phase 1: #475, fail closed

- `AGENT_OS_CONTAINMENT_AVAILABLE = false` (`agent-containment.ts`). It is a constant; no setting or environment can enable it.
- Both commands refuse before:
  - reading settings;
  - reading credentials;
  - prompting;
  - resolving the executable;
  - running the `--version` probe.
- The wrappers refuse too (`BLOCKED_PRE_EXECUTION`, L3) unless an OS-enforced runner is supplied. Production supplies none.
- The catalog forces Aider and Continue to `disabled`, regardless of settings or stale `connected` health receipts.
- **Release limitation (owner acceptance required):** embedded Aider/Continue execution is temporarily removed in v6.0.12.

### Phase 2: #463, frozen consumer

- **Install source:**
  - an operator-selected local `qor_logic-0.176.1-py3-none-any.whl` only;
  - the SHA-256 `dd6eec66…0e31` is verified on a size-capped, no-follow private copy;
  - an offline `pip --isolated install --dry-run --no-index` dependency preflight runs before the install;
  - the install itself is offline, `--no-deps`, with `-P`;
  - afterwards, `pip show` must report exactly 0.176.1 and `pip check` must pass.
- **Version handling:**
  - an exact-version gate guards every ingestor entry;
  - a divergent installed version is refused and never replaced;
  - silent and non-interactive bootstrap never install.
- **Refused before any subprocess:**
  - selected-skill install;
  - global scope;
  - the JSON preview;
  - list-skills enumeration.
- **Host install success requires all of:**
  - a zero exit;
  - exactly one positive `Installed N files to HOST` line;
  - a verified receipt: per-file SHA-256, files under the host base, bounded, no symlinks, and an fstat/lstat identity check;
  - CLI count equal to the receipt count.

  Stale, no-op, forged and count-divergent results are refused.
- `TESTED_AGAINST_QOR_LOGIC_VERSION` stays `0.169.0`. Frozen 0.176.1 conformance is **not** attested (see Limitations).

### Phase 4: iteration-1 VETO remediation (Entry #915)

Behavior-preserving changes that close the iteration-1 findings:

- **V1, function length and nesting:**
  - `verifyHostInstallReceipt` is split into `loadReceipt`, `verifyEntry` and a shorter body;
  - `copyAndVerify` moves its write loop into `writeAll`;
  - `installHost` becomes `prepareHostInstall` plus `runQorInstall`;
  - the install-skills handlers share `runInstallPipeline`, `refuse` and `webOptionRefusal`;
  - `stepQorLogicPackage` becomes `frozenPackagePresent`, `installVerifiedWheel` and `verifyAfterInstall`;
  - `aggregateReport` gains `collectFailures` and `claimsAreVerified`;
  - `registerAgentCliCommands` registers separate per-command functions. The guard order is unchanged: the containment check runs first, before any setting, credential or prompt.

  Every touched function is now 40 lines or fewer, with nesting depth 3 or less.
- **V1, file size:**
  - the `INTEGRATION_CATALOG` descriptor table moves to `integration-catalog-data.ts`, so `integration-catalog.ts` drops from 313 to 166 lines;
  - the risk, receipt and outcome builders move to `agent-run-outcome.ts`, so `agent-cli-core.ts` drops from 285 to 161 lines;
  - the declared-inapplicable control data moves to `qor-conformance-inapplicable.cjs`, so the probe drops from 359 to 342 lines. That is below the RC1 size of 352, but still above 250.
- **V5, duplication:**
  - one shared `readBoundedReceipt` (`boundedReceiptRead.ts`) replaces the two receipt readers. Where their bounds differed it applies the stricter: an lstat size check before open, reads capped at size+1, and a minimum of 2 bytes;
  - a single `runQorInstall` now builds the install argv. The `-P` site inventory goes from 10 to 9.
- **V2/V3:** the new behavioral test `agent-cli-command-refusal.test.cjs` covers the command refusal, and the Feature Inventory now names a test for every row.
- **Tests that read source text:**
  - `agent-os-boundary.test.cjs` and `integration-contracts.test.cjs` now read the moved descriptor table. Only the path changed; no assertion changed.
  - Doc citations were re-pointed to the moved lines.
- **Pre-existing overages, not grown by this change:** `defaultInstallerRun` (49 lines, unchanged since RC1) and `renderInstallSkillsCard` (shrank from 43 to 41 lines).

### Phase 3: integration repairs (`9b66c8f7`, tests and docs only)

- compile scope fix;
- Python-safety test stand-ins for the new installer contract;
- the `-P` inventory count, 7 → 10;
- truthful integration docs;
- the FX003 bootstrap smoke test now models the operator declining;
- the Playwright #479 card fixture;
- the conformance probe can invoke `python -P -m qor.cli`.

## Boundaries

**Limitations:**
- **Upstream conformance gaps:** frozen 0.176.1 fails 4 of FailSafe's 19 consumer-conformance checks, and no FailSafe change can fix them:
  - no `install --dry-run --json`;
  - three ledger-prose tamper negatives (Verdict/Decision edits verify clean). That is #467 G4.
- **Missing control:** `instruction_hygiene_lint` does not exist in 0.176.1 (probe: UNAVAILABLE).
- **Dependencies:** the offline install cannot provision `jsonschema`/`PyYAML`. A clean host fails closed at `dependency-preflight-failed`, and the operator must provision them. A failed install is not transactionally rolled back; the preflight reduces but does not remove that risk.
- **Agent CLIs:** Aider/Continue execution is unavailable until an audited OS-enforced boundary (AppContainer/LPAC or VM) exists.
- **Existing installs:** an already-installed 0.176.1 is accepted on `pip show` metadata plus `pip check`. Its installed files are not re-verified against the pinned wheel's RECORD (iteration-1 audit N2).
- **Receipt meaning:** a verified host receipt proves that the files on disk match the receipt, not where they came from. A repository could ship matching receipts, so bootstrap's "present with provenance" means receipt-consistent, not origin-attested (iteration-1 audit N1; not a regression versus RC1).

**Non-goals:**
- no #467 G4, #476 or #505 change;
- no ledger history edit;
- no change to frozen Qor-logic;
- no version-marker promotion.

**Exclusions:**
- no merge, tag or publication under this plan;
- the release seal needs separate owner authorization.

## Feature Inventory Touches

All paths are relative to the repository root. "Behavioral" means the test calls the code and observes effects; "source-order" means it reads source text.

| Feature | Op | Test (depth) | Descriptor |
|---|---|---|---|
| agent-os-containment-gate (commands) | NEW | `FailSafe/extension/src/test/extension/agent-cli-command-refusal.test.cjs` (behavioral) | Calls the real `registerAgentCliCommands` and invokes both commands. Asserts: the exact refusal warning is shown; no input box opens; no `get`/`has`/`inspect` call on the configuration; no credential-store or credential-UI access; no wrapper call and no child-process spawn; no ledger or apply activity. Its fault injection (a `cfg.get` placed before the guard) makes both tests fail. `FailSafe/extension/src/test/integrations/agent-cli/agent-os-boundary.test.cjs` (source-order) is supplementary only |
| agent-os-containment-gate (wrappers) | NEW | `FailSafe/extension/src/test/integrations/agent-cli/agent-cli.test.ts` (behavioral) | Without an OS-enforced runner, `runAiderGoverned`/`runContinueGoverned` return `BLOCKED_PRE_EXECUTION` (L3) with no resolver, `--version` probe or spawn; a simulated contained runner is exercised separately |
| catalog containment block | MODIFIED | `FailSafe/extension/src/test/integrations/catalog/integration-catalog.test.ts` (behavioral, unit); `FailSafe/extension/src/test/ui/integrations-catalog.spec.ts` (Playwright, real ConsoleServer) | Aider/Continue stay `disabled` even with enabled settings and a fresh `connected` legacy receipt; OpenHands still shows `configured-unverified` |
| frozen-wheel-install | NEW | `FailSafe/extension/src/test/qorlogic/frozenWheel.test.ts`, `FailSafe/extension/src/test/qorlogic/qorDependencyPreflight.test.ts`, `FailSafe/extension/src/test/qorlogic/QorLogicPackageInstaller.test.ts`, `FailSafe/extension/src/test/qorlogic/qorPackageEnsure.test.ts`, `FailSafe/extension/src/test/qorlogic/qorFrozenConsumerIntegration.test.ts` (behavioral, real temp files) | Covers: hash mismatch, oversize, symlink and invalid paths; offline dependency preflight refusal; `pip check` failure blocks readiness; version divergence is never replaced |
| host-install-receipt-verification | NEW | `FailSafe/extension/src/test/qorlogic/qorHostReceiptVerify.test.ts`, `FailSafe/extension/src/test/qorlogic/qorHostInstallOutput.test.ts`, `FailSafe/extension/src/test/qorlogic/QorLogicSkillIngestor.test.ts`, `FailSafe/extension/src/test/qorlogic/qorFrozenConsumerIntegration.test.ts` (behavioral, real hashed receipts) | Refuses each of: missing, empty, tampered, oversized and linked receipts; containment escape; stale or no-op output; wrong host; CLI/receipt count mismatch |
| unsupported frozen operations | MODIFIED | `FailSafe/extension/src/test/qorlogic/QorLogicSkillIngestor.test.ts` (selected-skill and global scope refuse with zero subprocesses); `FailSafe/extension/src/test/roadmap/qorlogic-preview-disabled.test.ts` (HTTP install preview declines before host parsing or subprocess); `FailSafe/extension/src/test/qorlogic/skillEnumeration.test.ts` (no `list-skills` JSON subprocess, even for forged input) | Refused before Python or pip runs |

## CI commands (run locally; no hosted CI required for qualification)

```
npm ci; npm run compile; npm run lint; npm run test:node; npm run test:runner-coverage;
npm run test:citation-parity; npm run build:package; vscode-test on VS Code 1.122.1 and 1.145.2;
npm run test:ui; npm run release:preflight; npm run package; npm run validate:vsix
```

**Plus external qualification evidence:**
- the real frozen-wheel 19-check conformance;
- the `qor-conformance-probe`;
- the #463 end-to-end harness against the real CLI;
- the #475 installed-VSIX adversarial run with hostile stand-ins.

## Open questions

None for audit. The owner's acceptance of the Aider/Continue limitation is a release decision, not an audit precondition.

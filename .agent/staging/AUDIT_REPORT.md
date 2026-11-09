# AUDIT REPORT

**Tribunal Date**: 2026-11-09T16:30:00Z
**Target**: `.failsafe/governance/plans/plan-v6012-633-frozen-qor-and-agent-refusal.md` (iteration 1; plan sha256 `2be0778197231dd245fd2c5b47ae0f08d8fa0324318375c1876d329bc41c7532`), gate `.qor/gates/2026-11-09T1550-4e0666/plan.json`; code `git diff 3d722d02..7bb330ee` (production under `FailSafe/extension/src`, excluding `src/test`)
**Session**: `2026-11-09T1550-4e0666`
**Risk Grade**: L3 (subprocess execution, package installation, credential-adjacent paths)
**Auditor**: The Qor-logic Judge
**Mode**: solo, Option B fresh-context (did not author the plan or the code). Declared toolset: shell (Git Bash), git, gh, repository file access, frozen qor-logic 0.176.1 venv, Node 22; no network beyond gh. Codex plugin unavailable: `capability_shortfall` `eb96b713` emitted. `audit_risk_score`: option_b_required false.
**Ordering**: implementation preceded this plan and audit (declared by the plan). This is a post-implementation, pre-integration review. It is NOT a pre-implementation verdict and nothing here is backdated.

---

## VERDICT: VETO

---

### Executive Summary

The substance of both changes is sound. #475 fails closed: a constant `AGENT_OS_CONTAINMENT_AVAILABLE = false`, command guards ahead of prompts and credential reads, wrapper guards ahead of the resolver and the `--version` probe, and the catalog forced to `disabled`. The installed-VSIX run on both VS Code hosts showed an empty stand-in log. #463 pins the wheel by SHA-256 on a bounded private copy. It runs an offline dependency preflight, a `--no-deps` install and a pip-metadata exact-version gate, and it binds receipt verification to the CLI count. Security and OWASP passes are clean. `test:node` (946 pass / 0 fail) and the #463/#475 mocha suites (102 pass) were re-run by this auditor.

The verdict is nonetheless VETO, on binding grounds:
1. The new code breaches the Section 4 Razor: functions up to 79 lines, nesting depth 4, and three over-cap files that grew.
2. The plan cites a presence-only source-text scan as the test for the #475 gate, and the command-level refusal has no in-repo behavioral test.
3. One Feature Inventory row names no test path.
4. The plan misstates its own disclosure evidence. Its `originating_remediation` makes that a self-application violation.
5. Security-critical receipt-reading logic is duplicated across two modules with divergent bounds.

### Governance preflight and Step 0

| Step | Result |
|---|---|
| governance-health --profile skill-entry | OK on all 8 artifacts (exit 0) |
| Step 0 prior artifact | found, valid (`plan-iter1.json`) |
| `current_phase_plan_path()` | InterdictionError (branch is not a phase branch); the plan path was taken from the plan gate artifact and passed argv-only |
| Step 0.3 plan_iteration_status_lint | exit 0 (ready) |
| Step 0.4 unchanged-plan | should_skip false (no prior audit) |
| Step 0.5 cycle-count / session-total | none / none |
| Step 0.6 lints (WARN-only) | plan_test, enumeration, grep, text_consistency, signature_widening, data_round_trip, feature_tdd, gate_schema_freeze: clean. delivery_branch_lint: could not parse `pr_target` prose in the plan header (gate JSON value is clean). ci_coverage: `oss-sast.yml::semgrep` not in plan CI list. workspace_fragility: high (333 ledger chain failures = disclosed pre-anchor residue; 18 branches; 8919 diff lines). plan_live_progress: 45 findings, all in files this diff does not touch. publication_boundary: 400 package-lock URL findings (structural, pre-existing). sg_closure_lint: COULD NOT RUN (crashes: expects `qor/references/...` relative to repo root) |
| Step 0.7 spec-delta | plan declares no `spec_deltas`; no contracted-behavior change outside what the plan describes. Pass |
| Prompt Injection canaries | 4 WARN `<script` code-span hits inside META_LEDGER.md, exit 0; no ABORT |
| Version-Applicability | `version_applicability.validate` COULD NOT RUN (requires `pyproject.toml`; JS repository). Manual: `change_class: feature`, package.json `6.0.12` > highest tag `v6.0.11` -> would pass |
| Runtime Contract Walk (WARN) | 0 findings |
| prose_test_lint --tests-dir tests | no `tests/` directory (Python layout); vacuous |

### Audit Results

#### Security Pass
**Result**: PASS
No placeholder auth, hardcoded credentials, bypassed checks or mock auth in production code. The pinned SHA-256 is an integrity pin, not a secret. Credentials in the #475 harness are synthetic. Data-API checklist: n/a (no SQL; `permanent_skips.data_api_acl_lint`).

#### OWASP Top 10 Pass
**Result**: PASS
- **A03**: every new spawn is argv-list with `shell: false` (`QorLogicPackageInstaller.ts:208-221`). pip and the CLI run with `-P`; pip also runs with `--isolated`.
- **A04**: refusal paths fail closed. `frozenWheelInstall.ts:198-203` maps unknown errors to `invalid-wheel-path`; `qorHostReceiptVerify.ts:70-75,114-116` both refuse.
- **A05**: the staging dir is from `mkdtemp`, chmod 0700, and the file is opened `wx` 0600 (`frozenWheel.ts:28,81-83`).
- **A08**: `JSON.parse` only; no unsafe deserialization.

#### Ghost UI Pass
**Result**: PASS
- The preview button (`install-skills-preview.js:12-18`) and the Global scope radio (`install-skills-modal.js:95`) are rendered `disabled` with truthful labels ("Preview unavailable", "Global (unavailable)"). No actionable control lacks a handler.
- `frozenTarget` and `matchesFrozen` are produced server-side (`qorLogicInstallRecord.ts:116-117`).
- No progress UI changed (live-progress n/a).

#### Section 4 Razor Pass
**Result**: FAIL

| Check | Limit | Found (this diff) | Status |
|---|---|---|---|
| Max function lines | 40 | 79 `verifyHostInstallReceipt` (new) | FAIL |
| Max file lines | 250 | 313 / 285 / 359 (touched files that grew) | FAIL |
| Max nesting depth | 3 | 4 (two new files) | FAIL |
| Nested ternaries | 0 | 3 in `buildIntegrationStatus` (pre-existing; function modified) | FAIL (pre-existing) |

Measured with the TypeScript compiler API over every touched production file; base counts taken from `3d722d02`.

#### Self-Application Sub-Pass (originating_remediation = GH #463, GH #475)
**Result**: FAIL
The discipline the plan introduces: claim nothing that verified evidence does not show, and disclose limitations exactly. Applied to the plan's own text, it finds V4.

#### Test Functionality Pass
**Result**: FAIL

| Test description (plan FIT) | Invokes unit? | Asserts on output? | Verdict |
|---|---|---|---|
| agent-os-boundary.test.cjs: "commands and wrappers refuse with no probe or spawn" | no (reads `.ts` source text) | no (indexOf/regex over source) | VETO |
| integrations-catalog.spec.ts + catalog unit tests: Aider disabled despite settings and receipt | yes (`integration-catalog.test.ts` #475 case, re-run PASS) | yes | PASS |
| QorLogicPackageInstaller / qorFrozenConsumerIntegration: hash, size, link, preflight, pip check | yes (re-run PASS) | yes | PASS |
| QorLogicSkillIngestor + qorHostReceiptVerify: stale, no-op, forged, count, containment | yes (re-run PASS) | yes | PASS |
| "ingestor, route and UI tests": unsupported operations refuse before subprocess | not identifiable from plan | n/a | VETO (see V3) |

#### Dependency Pass
**Result**: PASS
No new npm or Python dependency. The plan's own Boundaries disclose that `jsonschema` and `PyYAML` are operator-provisioned prerequisites and are not installed by FailSafe.

#### Macro-Level Architecture Pass
**Result**: FAIL (V5)
Layering is intact and the build path is explicit. The fail is duplicated security-critical domain logic, listed in V5.

#### Feature Test Coverage Pass
**Result**: FAIL (V3)

#### Infrastructure Alignment Pass
**Result**: PASS
- All cited test files exist: `agent-os-boundary.test.cjs`, `integrations-catalog.spec.ts`, `QorLogicPackageInstaller.test.ts`, `qorFrozenConsumerIntegration.test.ts` and `QorLogicSkillIngestor.test.ts`.
- `agent-containment.ts` exists. The SHA `dd6eec66...0e31` matches `frozenWheel.ts:12`, and `BLOCKED_PRE_EXECUTION` L3 matches `aider-wrapper.ts:59` and `continue-wrapper.ts:90`.
- Consumer trace: `AGENT_OS_CONTAINMENT_AVAILABLE` reaches `failsafe.aider.run` and `failsafe.continue.run` (`agent-cli-command.ts:148,173`) and `buildIntegrationStatus` (`integration-catalog.ts:274`).
- Delivery branch: `release/v6.0.12-rc1-candidate-20261108-no-ci` exists on origin at `3d722d02`, and PR #631 is OPEN (draft). Whether that branch is still open for merges needs operator confirmation, which could not be obtained in this non-interactive run. That gap is recorded here, not treated as a fail.

#### Filter-Stage Ordering Coherence
**Result**: PASS
- **Install pipeline**: host-selection validation, then scope, then the frozen-package gate (version, then pip check), then interpreter, then CLI, then the positive confirmation line, then the receipt, then count equality. Each stage's precondition runs first (`QorLogicSkillIngestor.ts:117-168`).
- **Wheel pipeline**: name, then lstat, then open/fstat, then size, then the bounded copy and hash, then the preflight, then the install, then pip show and pip check.
- No inversions.

#### Orphan Pass
**Result**: PASS
Every new module is imported on a production path:
- `agent-containment.ts` from `agent-cli-core` and `integration-catalog`;
- `bootstrapSkillOutcome.ts` from `bootstrapWorkspace`;
- `boundedHostRecord.ts` from `qorLogicInstallRecord`;
- `frozenWheel.ts` from `frozenWheelInstall`, which `QorLogicPackageInstaller` imports;
- `qorDependencyPreflight.ts`, `qorPackageEnsure.ts`, `qorHostInstallOutput.ts` and `qorHostReceiptVerify.ts` from the ingestor, handler and bootstrap.

#### Execution-Continuity Pass
n/a (no `execution_continuity` declared).

### Violations Found

| ID | Category | Location | Description |
|---|---|---|---|
| V1 | razor-overage | `src/qorlogic/qorHostReceiptVerify.ts:39-117`; `:98`, `:101` | New `verifyHostInstallReceipt` is 79 lines (limit 40); nesting depth 4 (try > for > try > if) |
| V1 | razor-overage | `src/qorlogic/frozenWheel.ts:25-52` | New `copyAndVerify`, nesting depth 4 at `:42` (try > while > while > if) |
| V1 | razor-overage | `src/qorlogic/QorLogicSkillIngestor.ts:117-169` | `installHost` 53 lines (40 or fewer at base) |
| V1 | razor-overage | `src/extension/installSkillsHandler.ts:184-233`, `:142-182` | `createScaffoldWithWebOptions` 50 lines (inner closure 43); `createInstallSkillsHandler` 41 |
| V1 | razor-overage | `src/extension/bootstrapWorkspace.ts:95-140` | `stepQorLogicPackage` 46 lines |
| V1 | razor-overage | `src/extension/installSkillsReport.ts:71-111` | `aggregateReport` 41 lines |
| V1 | razor-overage | `src/extension/agent-cli-command.ts:134-187` | `registerAgentCliCommands` grew 46 to 54 lines |
| V1 | razor-overage | `src/integrations/catalog/integration-catalog.ts` (309 to 313), `src/integrations/agent-cli/agent-cli-core.ts` (283 to 285), `scripts/qor-conformance-probe.cjs` (352 to 359) | Over-cap files materially extended. Repo precedent (SYSTEM_STATE line 288) splits a grandfathered file when a PR grows it. Frozen doctrine has no razor grandfathering |
| V2 | test-failure | plan FIT row 1; `src/test/integrations/agent-cli/agent-os-boundary.test.cjs:8-58` | The cited test reads source text and asserts substring order; it never invokes the commands or wrappers (presence-only per SG-035). Its own header says "structural ... NOT ... behavioral". The command-level claim (refuse before credentials, prompt, resolver) has no in-repo behavioral test (`agent-cli-command.test.cjs` unchanged). The behavioral wrapper test at `agent-cli.test.ts` ("#475 production contract") exists but is not cited. The installed-VSIX harness is out-of-repo and not a regression test |
| V3 | feature-test-undeclared | plan line 108; lines 105, 107 | Row "unsupported frozen operations" cites no test_path ("ingestor, route and UI tests"). Rows 2 and 4 rely partly on unnamed files ("catalog unit tests", "`qorHostReceiptVerify` tests") |
| V4 | specification-drift | plan line 11; plan line 7; `docs/PROCESS_SHADOW_GENOME_UPSTREAM.md:1`; `.gitignore:63` | (a) The plan claims "A severity-2 `gate_override` shadow event records this deviation". The recorded event `b9f0a002...` is severity 1 (correct per skill Step 0, so the plan text is what is wrong), and it lives in a gitignored file, so the disclosure record is absent from the committed tree. (b) The plan claims the PR head is "recorded in the gate artifact"; `plan.json` carries no source-head field |
| V5 | macro-architecture | `src/qorlogic/boundedHostRecord.ts:146-179` vs `src/qorlogic/qorHostReceiptVerify.ts:44-75` | Two independent no-follow, identity-bound receipt readers with divergent bounding: an explicit size+1 buffer versus `readFileSync(fd)` after an fstat check. The same CLI argv and run construction is also duplicated in `QorLogicSkillIngestor.ts:136-148` and `:223-235` |

### Non-blocking observations (advisory; not VETO grounds)

- **N1, bootstrap provenance overclaim.** `bootstrapWorkspace.ts` reports "qor-* skills present with provenance" whenever `hasVerifiedBootstrapHosts` passes (`bootstrapSkillOutcome.ts:8-10`). A verified receipt proves only that the workspace files are self-consistent, not where they came from. A repository can ship self-consistent claude/codex receipts and skip installation. The base checked `SOURCE.yml` presence, so this is not a regression, but the wording overclaims.
- **N2, existing install trusted on metadata.** An already-installed 0.176.1 is accepted on pip metadata plus `pip check` only (`frozenWheelInstall.ts:185-194`, `qorPackageEnsure.ts:82-86`). Installed bytes are not re-verified against the pinned wheel. The plan's Boundaries do not state this.
- **N3, settings timing.** `settings()` (`getConfiguration`) runs before the containment guard (`agent-cli-command.ts:147,172`). No setting value is read before refusal, so the plan's "before reading settings" holds in substance.
- **N4, e2e463 harness weaknesses.**
  - The "global scope refused" row's clause `c.results?.every?.(...) !== false` is vacuous: `QorLogicIngestResult` has no `results` field. Its zero-subprocess clause still holds.
  - The "interpreter unchanged" row exercises only the preflight-failure path, which is consistent with the disclosed lack of rollback.
- **N5, evidence head.**
  - The gate logs are on `9b66c8f7`. `git diff --stat 9b66c8f7..7bb330ee` touches only the plan, gates, CHANGELOGs and the README, with no code.
  - Remote PR #633 head is `5901a871`; integration fixes `9b66c8f7` onward are unpushed.
- **N6, conformance.** 15/19 pass on the frozen wheel. The 4 failures match the plan's disclosure (no `--json`; 3 ledger-prose tamper negatives, #467 G4). `TESTED_AGAINST` correctly stays `0.169.0`.
- **N7, #467 scope.** The #467 issue export shows the October VETOs #610-#612 and event `7126134e` concerned the local ledger-anchor plan (`fix/ledger-anchor-qor0176`), not #463 consumer hardening or #475 agent refusal. This plan is distinct scope in a new session. Its disclosure neither closes nor reinterprets them, and they remain UNKNOWN/UNRESOLVED. The cited `recovery/MANIFEST.md` resolves at `a723b366:qualification/v6.0.12-governance-lane-20261107/recovery/MANIFEST.md`.
- **N8, #475 qualification.** `i475-1.145.2.txt` and `i475-1.122.1.txt` each show 19/19. The harness includes a positive control proving the hostile stand-in runs from PATH, then shows an empty stand-in log after both commands. It is genuine behavioral evidence, but it lives out of the repository.

### Per-ground directives

#### Section 4 Razor

V1: split `verifyHostInstallReceipt`, `copyAndVerify`, `installHost`, `createScaffoldWithWebOptions`, `createInstallSkillsHandler`, `stepQorLogicPackage`, `aggregateReport` and `registerAgentCliCommands` to 40 lines or fewer with nesting depth 3 or less. Bring `integration-catalog.ts`, `agent-cli-core.ts` and `qor-conformance-probe.cjs` to 250 lines or fewer, or stop growing them.

**Required next action:** `/qor-refactor`

#### Orphan file / Macro-arch breach

V5: one bounded, identity-bound receipt reader shared by the Hub status path and the verifier; one CLI-install argv builder.

**Required next action:** `/qor-organize`

#### Plan-text

- **V2:** replace the FIT row 1 test with tests that invoke `runAiderGoverned` / `runContinueGoverned` and the registered command handlers and assert no prompt, credential read, resolver or spawn. Declare the command-level behavioral test (NEW where absent).
- **V3:** name a specific test_path for every FIT row.
- **V4:** correct the gate_override severity, state where that event is kept (gitignored local file), and record the audited source head in the plan gate artifact or drop the claim.

**Required next action:** Governor: amend plan text, re-run `/qor-audit`

#### Process-level

None. No repeated-VETO pattern; the cycle-count escalator did not fire.

#### Code-logic defect

None. No behavioral defect was found in the #463/#475 production logic.

<!-- qor:drift-section -->
## Documentation Drift

Non-VETO advisory. These issues would hard-block at /qor-substantiate per `qor/references/doctrine-documentation-integrity.md`. Governor can fix in a follow-on amendment or accept the block at seal time.

- Orphan: Orphan home: 'Vacuous pass' -> '.failsafe/governance/RESEARCH_BRIEF_qor169-alignment-2026-09-03.md' does not exist.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->

> No repeated-VETO pattern detected in the last 2 sealed phases.

### Steps run / not run

- **Run:** governance-health; Step 0, 0.3, 0.4, 0.5; Step 0.6 (13 of 14 lints); Step 0.7; Step 1.a with the shortfall emitted; Step 2; and Step 3, every pass:
  - prompt injection, security, OWASP, Ghost UI with live-progress, Razor (measured);
  - self-application, test functionality, dependency, macro, feature test coverage;
  - infrastructure alignment with consumer trace and runtime walk, filter-stage, orphan, drift.

  Steps 4, 5, 6, 7 and Z were also run. Independent re-runs: compile, `test:node`, and the #463/#475 mocha suites.
- **Not run, and why:**
  - `sg_closure_lint`: the tool crashes on this layout.
  - `version_applicability.validate`: no `pyproject.toml`; done manually instead.
  - `prose_test_lint`: no `tests/` directory.
  - Delivery-branch "open for merges": needs operator confirmation, which this run could not obtain.
  - Step 4.1/4.2: no `reviews-remediate` argument.
  - VS Code host suites, test-ui and package/validate-vsix were not re-executed. Their logs in `final/` were read, not re-run.

### Verdict Hash

SHA256(this_report) is recorded as the Content Hash of the GATE TRIBUNAL ledger entry (computed by `qor.scripts.ledger_hash.content_hash`, LF-normalized).

---
_This verdict is binding._

## Tribunal Complete

**Verdict**: VETO
**Risk Grade**: L3
**Report Location**: .agent/staging/AUDIT_REPORT.md

Implementation blocked. Address the violations and re-submit for audit. The required actions are logged in this report, and the failure mode is recorded in SHADOW_GENOME.md.

---
_Gate LOCKED. Proceed accordingly._

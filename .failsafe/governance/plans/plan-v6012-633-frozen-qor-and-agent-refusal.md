# Plan: v6.0.12 integration of PR #633 — frozen Qor-logic 0.176.1 consumer (#463) and fail-closed external agents (#475)

**iteration**: 1
**change_class**: feature
**risk_grade (proposed)**: L3 (security-critical: subprocess execution, package installation, credential-adjacent paths)
**pr_target**: `release/v6.0.12-rc1-candidate-20261108-no-ci` (PR #631, RC1 source `3d722d02`)
**Source under review**: PR #633 branch `fix/475-no-uncontained-agent-execution-v6012-20261108-no-ci`, head recorded in the gate artifact.

## Ordering inversion (DECLARED, not sanctioned)

This plan is authored **after** the implementation. The #633 commits were written and pushed to a draft PR branch before any `/qor-plan` or `/qor-audit`. Nothing has been merged to `main` or to the RC1 branch, so the integration boundary has not been crossed. A severity-2 `gate_override` shadow event records this deviation, in the manner of session `2026-09-04T0430-62ca33`.

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

**Non-goals:**
- no #467 G4, #476 or #505 change;
- no ledger history edit;
- no change to frozen Qor-logic;
- no version-marker promotion.

**Exclusions:**
- no merge, tag or publication under this plan;
- the release seal needs separate owner authorization.

## Feature Inventory Touches

| Feature | Op | Test | Descriptor |
|---|---|---|---|
| agent-os-containment-gate | NEW | `src/test/integrations/agent-cli/agent-os-boundary.test.cjs` | commands and wrappers refuse with no probe or spawn |
| catalog containment block | MODIFIED | `src/test/ui/integrations-catalog.spec.ts`, catalog unit tests | Aider stays disabled despite settings and a legacy receipt |
| frozen-wheel-install | NEW | `src/test/qorlogic/QorLogicPackageInstaller.test.ts`, `qorFrozenConsumerIntegration.test.ts` | hash, size, link, offline preflight, pip check |
| host-install-receipt-verification | NEW | `src/test/qorlogic/QorLogicSkillIngestor.test.ts`, `qorHostReceiptVerify` tests | stale, no-op, forged, count mismatch, containment |
| unsupported frozen operations | MODIFIED | ingestor, route and UI tests | selective, global, preview and enumeration refuse before subprocess |

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

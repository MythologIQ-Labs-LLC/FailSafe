# Plan: disposable G4 CLI acceptance fixtures (#696)

**change_class**: governance
**doc_tier**: standard
**terms**: none
**iteration**: 1
**Risk Grade**: L3
**Source**: 0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc
**originating_remediation**: FailSafe issue 696

## Classification and authority

This is a non-release correction of the governance verification harness only.
No shipped behavior, dependency, manifest version, verifier, trust decision or
release input changes. The assertions must test the existing CLI truthfully.
The owner authorizes this separate test-only lane, conditional on independent
native classification review and source-bound PASS before editing tests.
This classification does not apply to the release-class dependency lane #695.
Frozen predecessor skills remain unchanged; no successor authority is inferred.

## Open Questions

None. An independent VETO on classification stops this lane.

## Phase 1: replace ambient witness assumptions

### Affected files and verified existing infrastructure

| Path | Op | Verification command + result | Token |
| --- | --- | --- | --- |
| FailSafe/extension/src/test/scripts/g4Witness.test.cjs | MODIFIED | git ls-files -- FailSafe/extension/src/test/scripts/g4Witness.test.cjs returns path | MODIFIED-VERIFIED |
| FailSafe/extension/src/test/scripts/g4Scenario.cjs | REUSE | git ls-files -- FailSafe/extension/src/test/scripts/g4Scenario.cjs returns path | EXISTING-VERIFIED |
| FailSafe/extension/scripts/g4-verify-checkpoint.cjs | REUSE | git ls-files -- FailSafe/extension/scripts/g4-verify-checkpoint.cjs returns path | EXISTING-VERIFIED |

The existing g4Scenario exports buildBase, initRepo and copyRepo. Reuse its
disposable test PKI, selected test TSA policy, copied committed ledger and
fixture-only signing, with temporary-root teardown. Its buildBase creates two
valid checkpoint commits. No real witness or key is read as a test signer.

Replace the stale real-repository no-witness assertion in g4Witness.test.cjs
with two actual CLI subprocess tests. Shared setup creates the existing
scenario base only when OpenSSL exists; teardown removes only its exact
generated temporary root. No new helper, dependency or export is introduced.

Negative: create a new directory beneath that temporary root; call existing
initRepo with the scenario's test-only TSA and signer, but create no checkpoint.
Run the actual CLI with --repo-root set to that disposable Git root. Require
exit 2 and BLOCKED, plus absence of a PASS verdict.

Positive: run the actual CLI on a disposable copy of the known-good scenario.
Require exit 0, PASS OK, diagnostic mode and the explicit non-release-evidence
label. Do not claim release-mode qualification from a diagnostic PASS.
Update the file's stale introductory comment to describe fixture acceptance.
Functions stay <=40 lines, file <=250, nesting <=3. Existing tamper cases stay.

### Unit tests

The two planned tests invoke the real subprocess and assert verdict plus exact
exit code, rather than source presence or a mocked verifier. Missing OpenSSL
explicitly skips scenario cases; it cannot count as a passing trust check.
Existing falsification, release, key, token and ledger refusal suites are reused
unchanged. No TPM enrollment or live signing is performed.

## Phase 2: qualification

Capture red-before and green-after on qualified Node 22.23.5/npm 10.9.9.
Run targeted G4 tests, full Node tests, compile, lint, test:all and the repository
pre-push gate locally. Capture actual host/package results; blocked checks stay
blocked. No push for CI discovery. If mandatory validation fails, stop delivery
and report the exact command rather than weaken tests or controls.

## Definition of Done

### Deliverable: deterministic G4 CLI verification tests

- **D1**: genuinely unwitnessed repositories are refused; valid disposable witnesses are accepted diagnostically.
- **D2**: only g4Witness.test.cjs changes in product/test source; existing scenario helper is reused.
- **D3**: native runtime records fresh plan, independent audit, implementation and substantiation when warranted; no hand-written gate JSON and no historical record rewrite.
- **D4**: exact CLI assertions, unchanged tamper refusals, targeted and full local validation recorded at the submitted source revision.

## CI Commands

- node --test FailSafe/extension/src/test/scripts/g4Witness.test.cjs
- node --test FailSafe/extension/src/test/scripts/g4*.test.cjs (explicit file discovery on Windows)
- npm run compile (extension directory)
- npm run lint (extension directory)
- npm run test:node (extension directory)
- npm run test:all (extension directory)
- powershell -NoProfile -ExecutionPolicy Bypass -File tools/reliability/prepush-validate.ps1
- powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate.ps1

No tag, release, workflow change, published asset alteration, native-key change,
predecessor skill replacement or owner risk acceptance is authorized here.

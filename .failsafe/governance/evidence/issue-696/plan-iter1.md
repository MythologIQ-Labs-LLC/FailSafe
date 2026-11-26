# Plan: recover the disposable G4 CLI acceptance fixtures (#696)

**change_class**: hotfix
**doc_tier**: standard
**terms**: none
**iteration**: 1
**Risk Grade**: L3
**Baseline**: protected `main@0550c4135c1d6d29aa03b2107f7b16aa78d08422` (includes merged #706 and #721)
**Candidate**: local commit `e32bb62f` on `fix/696-g4-witness-fixtures` = `git cherry-pick -x 834607018a3166a59351f59261d67cbbb7c6ef98` onto the baseline (not pushed)
**originating_remediation**: FailSafe #696 (stale real-repository "no witness yet" assertion fails full-clone local qualification)

**boundaries**:
- limitations: the CLI cases need OpenSSL and are skipped (reported, not passed) where it is absent; a diagnostic PASS is not release verification and the test asserts the "NOT release evidence" label; the fixtures use the existing disposable test PKI and test TSA policy from `g4Scenario.cjs`, never a real witness or owner key
- non_goals: any change to the verifier (`scripts/g4-verify-checkpoint.cjs`, `scripts/lib/g4/**`), the published witness evidence, owner keys or release verification; importing or re-sealing the historical local governance line
- exclusions: none

## Authority and scope

Fresh native plan on current main. Owner instruction (2026-11-25): recover the previously implemented G4 fixture correction rather than rewriting it; use independent disposable witnessed and unwitnessed fixtures; execute the real verifier CLI; prove a positive diagnostic PASS and an explicit negative BLOCKED; show red before and green after on one environment; do not weaken the verifier, modify published witness evidence, operate owner keys, or present a diagnostic PASS as release verification.

**Historical lineage (recorded, not relied on as authority)**: the same change was planned, audited (PASS L3) and sealed on a local governance line based on `main@0c0e30e0` (`fix/696-g4-fixture-cli-line`; seal commit `5083c262`, that line's Entry #977, session `2026-11-16T2154-926a3e`). Its ledger numbers collide with main's (main's #976/#977 are #703's); evidence is bound by content hash, not entry number. Copies kept read-only under `.failsafe/governance/evidence/issue-696/historical-local-line/`: `plan-696-g4-cli-fixtures.md` sha256 ccbaec489292ca577335f042a7e8aa5fc9f24c8c4ab2c584d47c010c3fc2995b, `AUDIT-PLAN-iter1.md` b6530a3387f57b75971d4edb645595ec902f9829b762e4cd58083bafd1309476 (PASS L3), `SUBSTANTIATE.md` ce9ea8d173bb05318437d7cd494acb7553cfde679140cdc246076d15075a0baf (PASS, sealed on that line), `RESULTS.md` b13a830b0620dfff4f26b892ed5b705993fff5d91910eda3a497dcb0c863f2bd. This plan is a new governance cycle on main; it does not inherit that line's verdicts.

## Open Questions

None.

## Locked decisions and evidence

- **LD1 (recovery is exact)**: `git rev-parse origin/main:FailSafe/extension/src/test/scripts/g4Witness.test.cjs` -> `ba8e5de78849e836a959e4ea9daa33ff59c786a1`, equal to `83460701^` (the fix's base); `git rev-parse 83460701:...g4Witness.test.cjs` -> `59abc40df6628018bb015a579c52490e4d9f1fa8` = `e32bb62f`'s blob. `g4Scenario.cjs` is `e8eebce1cefe6abbeaed0893e956d92581e3355b` on both. `git diff --stat 83460701^ origin/main -- FailSafe/extension/scripts/lib/g4 FailSafe/extension/scripts/g4-verify-checkpoint.cjs FailSafe/extension/src/test/scripts/g4Scenario.cjs FailSafe/extension/src/test/scripts/g4TestPki.cjs` -> empty (the verifier and fixtures are unchanged since the fix was qualified). `git diff --stat origin/main e32bb62f` -> one file, `g4Witness.test.cjs`, +32/-6.
- **LD2 (defect)**: on `main@0550c413`, `node --test src/test/scripts/g4Witness.test.cjs` (Windows 11, OpenSSL 3.5.7) -> 10 tests, 9 pass, 1 fail: "the CLI never reports PASS for the real repository, which has no witness yet" (the repository now holds witness `g4-000001`, so the CLI reports diagnostic PASS, exit 0).
- **LD3 (verifier contract the tests rely on)**: `g4-verify-checkpoint.cjs` returns `{ PASS: 0, REFUSED: 1 }[verdict] ?? 2`, prints `[g4-verify] mode: diagnostic (NOT release evidence)` for diagnostic runs and `[g4-verify] <VERDICT> <CODE>: <detail>`; `lib/g4/verify.cjs:69` -> `throw block("NO_CHECKPOINTS", "no checkpoints to verify")`.

## Phase 1: the recovered change (no edits)

### Affected Files

- `FailSafe/extension/src/test/scripts/g4Witness.test.cjs` - the stale real-repository assertion is replaced by two real CLI subprocess cases over disposable fixtures built once by `g4Scenario.buildBase` (temp root removed in `test.after`, guarded to a `g4-falsify-*` directory under the OS temp dir); the file header describes fixture acceptance

### Changes

None beyond `e32bb62f` (byte-identical to the historically qualified `83460701`).

## Definition of Done

### Deliverable: G4 CLI fixture acceptance

- **D1**: exactly these claims:

| Row | Claim | Proof | Mutants killed |
|---|---|---|---|
| H1 | The real verifier CLI blocks a disposable repository that has no checkpoint: exit 2, `BLOCKED NO_CHECKPOINTS`, and no PASS line | "the CLI blocks a disposable unwitnessed repository with exit 2" | M1, M4, M5, M6, M7 |
| H2 | The real verifier CLI accepts a disposable copy of a valid witnessed scenario diagnostically: exit 0, `PASS OK`, and the `diagnostic (NOT release evidence)` mode line | "the CLI accepts a disposable witness diagnostically with exit 0" | M2, M3, M4 |
| H3 | The test no longer depends on the real repository's witness state, and fails on main without the change (red) and passes with it (green) on the same host | LD2 red run; green run 11/11 | n/a (run evidence) |
| H4 | The verifier, library, published witness evidence and owner-key tooling are unchanged | `git diff --stat origin/main e32bb62f` lists only the test file | n/a |

Mutants (`mutants696.py`, applied to the real CLI/library one at a time and restored; map `mutation-map-696.txt`): all seven KILLED.

**Not claimed**: release-mode verification; behaviour without OpenSSL beyond the reported skip; anything about the historical local line.

- **D2**: one test file changed; file at most 250 lines; added test bodies at most 40 lines, nesting at most 3.
- **D3**: ledger entries for this plan's audit, implementation and seal under session `2026-11-25T2335-247ff7` on this branch; evidence under `.failsafe/governance/evidence/issue-696/`; Governance Index Last Reviewed refreshed at seal.
- **D4**: red/green re-run on the committed head; mutation map re-run identical; full local gate and exact-head CI counts recorded.

## CI Commands

- `node --test src/test/scripts/g4Witness.test.cjs` (in `FailSafe/extension`)
- `npm run test:node`, `npm run lint`, `npm test`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools/reliability/prepush-validate.ps1` (no skip flags)

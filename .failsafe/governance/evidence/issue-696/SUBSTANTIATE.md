# SUBSTANTIATION REPORT: plan-696-g4-witness-fixtures (iteration 2)

**Timestamp**: 2026-11-26T00:53:13Z
**Phase**: SUBSTANTIATE
**Judge**: The Qor-logic Judge, a fresh-context independent subagent. It authored none of the plan, candidate, test, audits or implementation record.
**Session**: `2026-11-25T2335-247ff7`
**Target**: draft PR #737 (issue #696), branch `fix/696-g4-witness-fixtures`, `origin/main...939a53b9515cc26bb85b334cfab7399cf0d94248` (origin/main 0550c4135c1d6d29aa03b2107f7b16aa78d08422, re-fetched; it is the merge base). Implementation commit e32bb62f6f373a9eb4dab872d45b720f0ca5baf0 (`cherry-pick -x` of 834607018a3166a59351f59261d67cbbb7c6ef98; single parent 0550c413), records commit 939a53b9 (PR head).
**Plan**: `.failsafe/governance/plans/plan-696-g4-witness-fixtures.md` iteration 2, raw sha256 and LF-normalized `content_hash` both 49019d3a53590799959d0ce005fd28edc66abc7decf880b4915a0a07ddbff50d (equal to `implement.json` `plan_sha256`)
**Authority chain**: #992 VETO (stands), #993 PASS L3 (`AUDIT-PLAN-iter2.md`), #994 IMPLEMENT (`IMPLEMENTATION.md`)
**Risk Grade**: L3
**change_class**: hotfix (no release in scope)
**Tooling**: qor-logic 0.176.1 (installed, not modified), QOR_SKILL_ACTIVE=substantiate, QOR_MODEL_FAMILY=claude; Node v22.23.5 win-x64 (checksum-verified, below) for every run; OpenSSL 3.5.7; Windows 11 Pro 10.0.26300
**Skill followed**: installed `qor-substantiate/SKILL.md`

---

## VERDICT: PASS (SESSION SEAL, Entry #995)

Reality matches Promise. Every claim row was re-executed by the Judge on the committed tree and on fresh clones, not read from records. H6's Linux leg concluded green in the exact-head CI. No ABORT-class gate fails in a way this repository has not already declared inapplicable; skips and deviations are disclosed below.

Seal: content hash 49019d3a... (the plan), previous hash 2230077d... (#994), chain hash **2d777ace1916aadeaee236cfefeafee9091d0233c003e2c2edc802cdd3aa0da8**, Entry ID `1b3ec379e80e`.

---

## Custody and Reality vs Promise

- `git diff --stat 0550c413 e32bb62f`: one file, `FailSafe/extension/src/test/scripts/g4Witness.test.cjs`, +32/-6. Blob `59abc40df6628018bb015a579c52490e4d9f1fa8`, equal to `83460701`'s; main's blob `ba8e5de78849e836a959e4ea9daa33ff59c786a1`. `e32bb62f^` = 0550c413.
- `git diff --name-only 0550c413 939a53b9` outside `.failsafe/governance/` and `.qor/gates/`: the test file, `.qor/intent-lock/2026-11-25T2335-247ff7.*`, `docs/META_LEDGER.md`, `docs/SHADOW_GENOME.md`. The records commit changes no source (`git diff e32bb62f 939a53b9 -- FailSafe` is empty).

| Planned (Phase 1) | Actual at 939a53b9 | Status |
|---|---|---|
| `FailSafe/extension/src/test/scripts/g4Witness.test.cjs` | M, 163 lines; `test.before` builds one `g4Scenario.buildBase` fixture, `test.after` removes only a realpath'd `g4-falsify-*` child of the realpath'd OS temp dir, two CLI subprocess cases replace the stale real-repository case | EXISTS |

Missing: none. Unplanned source: none. `ledger_commitment`: OK (1 touched artifact checked).

## Definition of Done

### D1: claim rows

| Row | Judge re-execution | Result |
|---|---|---|
| H1 | `ok 8 - the CLI blocks a disposable unwitnessed repository with exit 2` on the head; killed by M1, M4, M5, M6, M7 (below) | HOLDS |
| H2 | `ok 9 - the CLI accepts a disposable witness diagnostically with exit 0` on the head; killed by M2, M3, M4 | HOLDS |
| H3 | Node v22.23.5 provenance: `node-v22.23.5-win-x64.zip` sha256 4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3 equals the line freshly downloaded from `https://nodejs.org/dist/v22.23.5/SHASUMS256.txt`; extracted `node.exe` sha256 247e9693d316da9857e44990e5e11709f596f18112251b8026ec6eed80bdf38a equals the `node-v22.23.5-win-x64/node.exe` member of that zip; `--version` v22.23.5. Fresh `git clone --no-local` (2111 commits) at 0550c413: **10 tests, 9 pass, 1 fail** (`not ok 8 - the CLI never reports PASS for the real repository, which has no witness yet`; CLI printed `PASS OK: 1 checkpoint(s) verified to g4-000001`). Same clone at e32bb62f: **11/11**. Head worktree 939a53b9: **11/11** | HOLDS |
| H5 | `teardown696-probe.py` re-run with Node 22 first on PATH, Windows paths, decoys in the session scratchpad: T1 (outside temp, right prefix), T2 (temp child, wrong prefix), T3 (`g4-falsify-*` junction to outside) each `rc 1`, guard assertion fired, sentinel kept; T4 (genuine temp child) `rc 0`, deleted. Identical to `teardown696.txt` except the random directory names | HOLDS |
| H6 | Depth-1 fetches (`git rev-parse --is-shallow-repository` true, 1 commit): 0550c413 10/10 (the stale assertion passes only because the witness is unresolvable), 939a53b9 **11/11**; together with the full-clone 11/11 the candidate's result is independent of clone depth. Linux: exact-head PR Full Test 45730044400 (ubuntu-24.04, `fetch-depth: 1`, merge `1fb4547` of 939a53b9 into 0550c413, so the merged tree is the head tree) **success**: `ok 533 - the CLI blocks a disposable unwitnessed repository with exit 2`, `ok 534 - the CLI accepts a disposable witness diagnostically with exit 0` (not skipped) | HOLDS |
| H4 | `git diff --stat 0550c413 939a53b9 -- FailSafe/extension/scripts FailSafe/extension/src/test/scripts/g4Scenario.cjs FailSafe/extension/src/test/scripts/g4TestPki.cjs` empty; no change under `tools/g4` or any witness evidence path; the only `FailSafe/` change is the test file | HOLDS |

Mutation map: `mutants696.py` re-run on the head worktree under Node 22: M1-M7 all KILLED, output identical (CR-insensitive) to `mutation-map-696.txt`. Restoration: sha256 of `scripts/g4-verify-checkpoint.cjs`, `scripts/lib/g4/verify.cjs` and `src/test/scripts/g4Scenario.cjs` taken before the mutants and re-checked after the mutants and after the probe: all OK; `git status --short FailSafe` empty after both.

Probe cleanup: the junction `%TEMP%\g4-falsify-jjunctionC` was removed with `rmdir` (not followed; its target's sentinel is still present), and `%TEMP%\notg4-jdecoyB` plus the four `g4-falsify-*` work directories the decoy runs leaked were deleted with read-only bits cleared. `%TEMP%\g4-falsify-*` is back to the 40 entries present before this substantiation (pre-existing, not created here, left alone).

### D2 and Section 4 Razor

One test file changed; 163 lines (at most 250). Added bodies: `test.before` 2 lines, `test.after` 6, the two CLI cases 8 and 6; nesting at most 1; one single-level ternary per test options (the file's existing skip idiom), no nested ternary; no stub, TODO, `console.log` or new dependency (`g4Scenario.cjs` is an existing in-repo helper). PASS.

### D3

Ledger #992-#994 recompute: each chain hash equals `ledger_hash.chain_hash(content_hash(report), previous)`, and #992 links to #991 (e13a6e28...). Evidence is under `.failsafe/governance/evidence/issue-696/`; preserved copies match their recorded raw sha256 (`plan-iter1.md` 2c6de0de..., historical `plan-696-g4-cli-fixtures.md` ccbaec48..., `AUDIT-PLAN-iter1.md` b6530a33..., `SUBSTANTIATE.md` ce9ea8d1..., `RESULTS.md` b13a830b...). Governance Index Last Reviewed refreshed by this seal.

### D4

Red/green re-run on the committed head under Node 22 (H3), mutation map and teardown probe re-run identical (D1), and:

- Local: `npm run test:node` on the head under Node 22: **1199 tests, 1189 pass, 0 fail, 10 skipped**, equal to the IMPLEMENT record.
- Exact-head CI at 939a53b9 (read only; nothing triggered, re-run or cancelled), all seven runs **success**: PR Full Test 45730044400 (single pass, no transport retry: extension host 6249 passing, 15 pending; architecture host 19 passing; test:node 1199 tests, 1164 pass, 0 fail, 35 skipped; test:ui 264 passed, 4 skipped), Repo Standards Enforcement 45730044382 (pull_request) and 45730018373 (push), Cross-platform compile 45730044407, OSS SAST 45730044366, Dependency Review 45730044302, VSIX Proprietary Guardrails 45730044330.

## Protocol steps

| Step | Result |
|---|---|
| Governance health preflight | 8/8 OK |
| 0 gate check | `check_prior_artifact("substantiate")` found, valid |
| 2 state | audit.json PASS L3 (#993); implement.json present |
| 2.5 version | hotfix; latest tag v6.0.13 = `FailSafe/extension/package.json` 6.0.13; no root version manifest, so `version_applicability` and Steps 7.5, 7.6, 9.5.5 SKIP (no bump, no tag), as at #984 and #991 |
| 3.5 blockers | `docs/BACKLOG.md` has no open Security or Development Blockers |
| 4 test audit | both new tests run the real CLI and assert exit code and output; neither is presence-only (mutants M1-M7 prove it). No DB path (runtime-principal gate inapplicable). Not frontend |
| 4.6 ladder | `substantiate_gates --skill <installed SKILL.md>` 10 gates, order verified; intent_lock VERIFIED; skill_admission ADMITTED; gate_skill_matrix 0 broken; session_id_lint rc 0; secret_scanner rc 0; procedural_fidelity rc 0; dod_check rc 0; merge_velocity rc 0 (`strained`, action narrow_scope); skill_size_budget WARN only (SKILL.md 37.0 KB); data_api_acl SKIP (no SQL migrations), `gate_skipped_prerequisite_absent` emitted (closed at emission by the declared permanent skip); continuity_gate inapplicable (no `execution_continuity` declared); install_drift OK |
| 4.6.14 publication_boundary_lint | rc 1: 565 findings here, 558 at 0550c413 (disclosure N1) |
| 4.7 doc_integrity strict | PASS (`standard` tier, no terms) |
| 4.7.5 governance-index enforce | rc 0 |
| 6 FEATURE_INDEX | Total 805 / verified 765 / unverified 0 / n/a 40; `feature_index_verify --snapshot 2026-11-25T1958-4f4867` rc 0; surface lint WARN FX922 (event emitted) |
| 6 ac_close_guard | `--issues 696`: WARN, no machine-checkable acceptance criteria |
| 6.5 doc currency | no warnings (hotfix) |
| 6.8 hash gate | `validate_sha256` passed for merkle_seal, content_hash, previous_hash, chain_hash |
| 7.4 SSDF | `PS.2.1, RV.2.1` |
| 7.7 seal_entry_check | see the ledger record file; verified directly as at #984 and #991 |
| 7.7.5 seal_artifacts | hotfix exempt; plan filename has no numeric phase |
| 7.8 gate_chain_completeness | run after the gate artifact is written |
| 7.9 spec_fold | no deltas declared |
| 8 staging cleanup | not performed: `.agent/staging/` holds tracked historical reports owned by other cycles |
| 8.5 dist_compile | SKIP: no `qor/skills` source in this consumer repository |
| 9.5-9.8 | not performed by the Judge: no commit, push, tag, merge or session rotation (caller's constraints) |

## Non-blocking disclosures

- **N1** `publication_boundary_lint` rc 1 at baseline (558) and here (565). The 7 added are all `absolute local path` findings in the already-pushed `evidence/issue-696/teardown696.txt` (the probe's raw output names `%TEMP%` work directories and the worktree path, including the local user profile directory). The same class has 153 findings at 0550c413 (19 under a user profile). This report avoids absolute paths.
- **N2** Entry #994's Target line says "iteration 4"; the plan is iteration 2 (its sha256 49019d3a... on the same line is correct). Append-only: recorded here, not edited.
- **N3** The Judge did not re-run `npm test` (extension host) or `prepush-validate.ps1` locally; it relies on the exact-head CI (6249 passing, both Bicameral install-handler cases green) and the IMPLEMENT record for the host's two environmental install-handler failures (pip not executable on this host).
- **N4** `#696` issue step 5 also names Windows installed-host/VSIX and G4 release-verifier runs; the audited plan narrows release-mode verification out (Not claimed). The VSIX packaging and validation are recorded by the IMPLEMENT entry and the CI VSIX guardrails run, not re-run by the Judge.
- **N5** `qor-logic scripts substantiate_gates` needs `--skill` (the default path is the Qor-logic source tree); `current_phase_plan_path()` refuses this non-phase branch, so the plan path was passed explicitly.
- **N6** Two `docs/PROCESS_SHADOW_GENOME.md` events appended by the gates: the data_api_acl skip and the FX922 surface-lint degradation (as at #991).
- **N7** Uncommitted `.qor/session/current` (points at this session) predates this substantiation.
- **N8** The mutation and probe scripts invoke `node` from PATH; the Judge put Node v22.23.5 first on PATH for both, so every Judge run used the verified binary.

## Disposition

SEALED at Entry #995 (chain hash 2d777ace...). Not merged, released or tagged; no version bump (hotfix). Owner GO remains outstanding for any merge.

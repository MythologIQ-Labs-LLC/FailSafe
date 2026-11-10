# AUDIT REPORT: plan-v6013-638-g4-release-mode (iteration 2)

**Verdict: PASS**
**Risk grade: L3** (governance integrity; release-evidence gate)
**Findings categories:** none
**Judge:** independent QoreLogic Judge (native `/qor-audit`), 2026-11-10
**Candidate:** `fix/638-g4-release-mode-enforcement` HEAD `0063b2d2fc8b749fff5b8a0189d189783b0db5f7` (remediation `55b61840`, merge `814d040a`, record commit `0063b2d2`). Code delta audited: `git diff abaa5b31 HEAD -- FailSafe/extension docs/releases/G4_WITNESS_OPERATIONS.md` (7 files, +192/-9).
**Plan:** `.failsafe/governance/plans/plan-v6013-638-g4-release-mode.md`, SHA-256 `aedaa1d9c763581e334dba1ba2d82993d54aaa61edcc393284c97dfa5587fea2` (recomputed; equals `plan_content_hash` in `plan-iter2.json` and `plan.json`).
**Prior verdict:** iteration 1 VETO, ledger #933 (B1 working-tree bytes not bound to the commit; B2 swallowed `--release` and unlabelled output; B3 stale doc line). The committed iteration-1 report is unchanged (sha256 `51dd549b…7f43`, matches the ledger entry).

Scope note: read-only on the repository. This file is the only thing written in the worktree. Nothing committed or pushed. No TPM key was created and no TSA was contacted; all runs used the suite's local OpenSSL test TSA. Mutations and the full `test:node` ran in a scratch clone of `0063b2d2` outside the repository.

## Summary

All three blocking findings are closed, verified by re-running my own constructions rather than the new tests. I found no remaining way to end a `--release` run in PASS with any stated condition unmet, and no new fail-open path.

## B1: evidence bound to HEAD blobs — closed

`assertEvidenceMatchesHead` lists every file committed at HEAD under `tools/g4/checkpoints` and `tools/g4/keys` (`git ls-tree -r -z`) and requires the bytes on disk to equal the blob, else `REFUSED RELEASE_TREE_MISMATCH`. A missing disk file is also a mismatch.

What the verifier reads from disk, checked by reading every `fs.` call in `scripts/lib/g4` on the verify path: the checkpoint directory listing, `manifest.json`, `manifest.sig`, `timestamp.tsr`, `tsa-chain.pem` (the last two also handed to OpenSSL by path), and `keys/<fingerprint>.cer`. Everything else (ledger, registry, registry history, gap statement, TSA policy and roots) comes from Git objects. The binding covers exactly the two directories that are read from disk.

The binding runs committed-to-disk. Files on disk that are not in the HEAD tree are left to the `git status` untracked and ignored scans. I tried to hide such a file from those scans with `core.untrackedCache` and a restored directory mtime (a valid token beside a committed checkpoint that lacks one; an extra certificate). Git still reported both: `BLOCKED RELEASE_TREE_DIRTY`.

## B2: flag swallowing and mode — closed

A value that is missing or begins with `--` is an argument error, exit 2. Every result carries `mode`, and the CLI prints it before the verdict line in every outcome, including BLOCKED. Release and diagnostic stdout for identical inputs now differ.

## B3: documentation — closed

Line 228 ("Working tree") now describes the enforcement. The condition table has the `RELEASE_TREE_MISMATCH` row, and all eight rows match the code. One wording nit is listed under non-blocking.

## Probes re-run on the remediation

| Probe | Iteration 1 | Iteration 2 |
|---|---|---|
| `--skip-worktree` on `tsa-chain.pem`, manifest (cp1, cp2), certificate | PASS / SIGNATURE_INVALID / PASS | REFUSED RELEASE_TREE_MISMATCH (all) |
| `--assume-unchanged`, same four | PASS / SIGNATURE_INVALID / PASS | REFUSED RELEASE_TREE_MISMATCH (all) |
| Committed token invalid, valid token in worktree behind `--skip-worktree` | PASS | REFUSED RELEASE_TREE_MISMATCH |
| Committed manifest invalid, good manifest behind `--assume-unchanged` | PASS | REFUSED RELEASE_TREE_MISMATCH |
| Same-size swap, mtime restored, no git command (`git status` empty) | PASS | REFUSED RELEASE_TREE_MISMATCH |
| `--skip-worktree` plus the file deleted from disk | not run | REFUSED RELEASE_TREE_MISMATCH |
| Junctioned `checkpoints`, one byte different behind `--skip-worktree` | not run | REFUSED RELEASE_TREE_MISMATCH |
| Junctioned `checkpoints` or `tools/g4`, identical content | PASS | PASS (same bytes as the commit) |
| Untracked token or certificate hidden with untracked cache and restored dir mtime | not run | BLOCKED RELEASE_TREE_DIRTY |
| `git replace` of the HEAD commit hiding a tampered ledger | PASS | BLOCKED RELEASE_TREE_DIRTY |
| Blob-level `git replace`, also with `core.useReplaceRefs=true` in config | not run | REFUSED PREFIX_BROKEN |
| Dirty submodule with `diff.ignoreSubmodules=all` | PASS | BLOCKED RELEASE_TREE_DIRTY |
| `--commit --release` (clean and dirty tree) | PASS exit 0 | exit 2, "--commit needs a value", no PASS |
| `--trusted-head --release`, `--repository --json`, trailing `--commit` | n/a | exit 2 |
| `--commit=<sha> --release` | n/a | exit 2 (unknown argument) |
| `--commit "" --release` | BLOCKED | BLOCKED RELEASE_INPUT_MISSING, `mode: release` |
| `--commit -release` (single dash) | n/a | PASS exit 0, printed as `mode: diagnostic (NOT release evidence)` |
| Diagnostic run with all four inputs | stdout identical to release | `mode: diagnostic (NOT release evidence)`; JSON `mode: "diagnostic"` |
| Release run, all inputs | PASS | PASS, `mode: release`; JSON `mode: "release"` |

Every other iteration-1 probe (absent, empty, malformed, uppercase, abbreviated and wrong inputs; `--commit HEAD`; HEAD mismatch; modified, staged, deleted, untracked and ignored files; `--tsa-ca`; `--checkpoints`; embedded repo; gitlink; ordering; not-a-repo; non-string API inputs) was re-run and gives the same refusal as before. The 17 PASS results left in the full probe run are: the control; truthy non-boolean `release`; empty-string `--checkpoints`/`--tsa-ca` (no effect); an empty untracked directory at root and an ignored file outside `tools/g4` (documented as allowed); working-tree-only changes to the ledger and TSA policy behind index flags (those are read from Git objects, so the working copy is never used); the two identical-content junctions; a clean committed gitlink; and three diagnostic runs.

## Regression and fail-open

- Diagnostic mode is unchanged apart from the added `mode` field and line. A dirty tree still gives PASS with the unanchored limitation.
- `--no-replace-objects` applies to every git call through `git()`; no other behavior change in `git.cjs`.
- New failure branches fail closed: `ls-tree` failure is BLOCKED REPO_UNREADABLE; an unreadable or absent disk file is REFUSED RELEASE_TREE_MISMATCH.

## Mutation results (scratch clone; `g4ReleaseMode` + `g4ReleaseBinding` + `g4FalsifyFields`, 30 tests)

42 mutants: 36 killed, 6 survived.

- My 23 from iteration 1: 22 killed. M09, M10 and M22, which survived before, are now killed. M18 (`git status` failure ignored) still survives; the plan states this is not done.
- 19 new mutants on the remediation: 14 killed. Killed: binding removed (N01); binding limited to checkpoints (N02) or to keys (N03); length-only comparison (N04); non-recursive `ls-tree` (N07); only the first file compared (N08); `--no-replace-objects` removed (N10); `--`-prefixed values accepted (N11); mode constant `release` (N13) or `diagnostic` (N14); mode absent on PASS (N15) or on refusal (N16); mode line not printed (N17); diagnostic label changed (N18).
- New survivors, none blocking:
  - N05 a file missing from disk tolerated by the binding. Real code refuses; no test deletes a bound file.
  - N06 `ls-tree` failure ignored. Same kind as M18.
  - N09 `--ignore-submodules=none` removed. No submodule test.
  - N12 a missing value tolerated by the parser. The value becomes undefined and release mode then blocks on the missing input; no test for a trailing flag.
  - N19 binding and clean check swapped. Equivalent mutant.

## Commands and outcomes

Toolchain: Node v22.23.4, git 2.55.0.windows.3, OpenSSL 3.5.7.

| Command | Outcome |
|---|---|
| `node --test src/test/scripts/g4*.test.cjs` (audited worktree) | 88 tests, 88 pass, 0 fail, 0 skipped |
| Same with `G4_OPENSSL=/nonexistent` | 88 tests, 82 skipped with "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run", 6 pass, 0 fail |
| `G4_OPENSSL=/usr/bin/openssl`, `g4ReleaseBinding` + `g4ReleaseMode` | 23 pass |
| `g4ReleaseBinding` against the iteration-1 implementation (scratch clone) | 7 fail, 2 pass, as the plan states |
| `npm run compile`, `npm run bundle`, `npm run test:node` in a scratch clone of `0063b2d2`, `node_modules` copied from the sibling worktree `FailSafe-g4` (lockfile identical) | compile 0, bundle 0; 1086 tests, 1068 pass, 18 skipped, 0 fail |

The two known timing-sensitive tests (`ArchitectureLinks` event-loop lag, `pythonResolution` T13(h)) both passed in this run. The `bundleDeps` failure in iteration 1 was confirmed as an artifact of my junctioned `node_modules`; with a real copy it passes.

## Section 4 razor

| File | Lines |
|---|---|
| `scripts/lib/g4/release-mode.cjs` | 101 |
| `scripts/lib/g4/verify.cjs` | 160 |
| `scripts/lib/g4/git.cjs` | 50 |
| `scripts/g4-verify-checkpoint.cjs` | 86 |
| `src/test/scripts/g4ReleaseMode.test.cjs` | 132 |
| `src/test/scripts/g4ReleaseBinding.test.cjs` | 138 |
| `src/test/scripts/g4FalsifyFields.test.cjs` | 74 |

Longest function across these files: 22 lines. Deepest nesting: 2. No violation.

## Plan honesty and hygiene

- The iteration-2 section describes the fixes as implemented. Its claims check out: 9 new tests, 7 red before the fix, 88/88, mutants caught, and the one item declared not done.
- The plan's explanation of `high_risk_target: false` (a schema classification, separate from the L3 grade) is accepted.
- `git ls-tree -r HEAD .qor/session` lists only `current`.

## Non-blocking items

- N1. A diagnostic PASS still exits 0. The mode is only in the output, so anything that consumes release evidence must check `mode: release` (or the JSON field), not the exit code alone. Worth one sentence in the operations document. `--commit -release` (single dash) is such a case.
- N2. The binding covers committed files only; files present on disk but absent from HEAD rely on `git status`. I could not defeat that, but enumerating the two directories on disk and refusing anything not in the HEAD tree would remove the dependency.
- N3. Line 135 of the operations document still gives "clean and at `--commit`" as the reason the files equal the commit. The statement is now true, but the reason is the byte comparison.
- N4. Untested branches: M18, N05, N06, N09, N12 above.
- N5. Unchanged from iteration 1: a non-string `trustedHead` through the API gives BLOCKED INTERNAL_ERROR; `--checkpoints ""` and `--tsa-ca ""` are accepted because they have no effect.

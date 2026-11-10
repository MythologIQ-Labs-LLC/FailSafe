# AUDIT REPORT: plan-v6013-638-g4-release-mode, bounded delta 1

**Verdict: ACCEPT.** PASS #934 (on `0063b2d2`) extends to `cf8dd879308c54d9935614978dee3d4c4213aa4c`.
**Risk grade: L3**
**Findings categories:** none
**Judge:** independent QoreLogic Judge (native `/qor-audit`, bounded delta), 2026-11-10
**Delta audited:** `0063b2d2` → `2e846092` → `aec5730e` → `cf8dd879` on `fix/638-g4-release-mode-enforcement` (PR #646, base `main`).
**Prior reports, unchanged:** iteration 1 VETO `51dd549b…7f43` (ledger #933); iteration 2 PASS `9a471457…40ee` (ledger #934).

Scope note: read-only on the repository. This file is the only thing written in the worktree. Nothing committed or pushed. No TPM key created, no TSA contacted. Mutations ran in a scratch clone of `cf8dd879` outside the repository.

## 1. What changed

| Step | Content |
|---|---|
| `0063b2d2` → `2e846092` | Records only: the iteration-2 report, audit gate files, ledger entry #934 (7 files). No code, test or doc. |
| `2e846092` → `aec5730e` | Merge of `main` `42f61921`. The merge tree is identical to its first parent (`8bac4ed2…` both). Both parents of `42f61921` (`9dacd662`, `21d8a0b8`) were already ancestors of `2e846092`, so the merge added one commit object and no content. The scoped diff over `FailSafe/extension/scripts`, `FailSafe/extension/src/test/scripts` and `tools/g4` is empty, and so is the full diff. |
| `aec5730e` → `cf8dd879` | One file, `FailSafe/extension/src/test/scripts/g4ReleaseBinding.test.cjs`, +5/−1. No production, doc, plan, gate or ledger change. |

The production code audited at #934 is byte-identical at `cf8dd879`.

## 2. The edited test

The "same-size swap with its mtime restored" test now also runs `git update-index --assume-unchanged` on the token and asserts `git status --porcelain` is empty before expecting `REFUSED RELEASE_TREE_MISMATCH`.

- **Not weakened as a proof of the byte binding.** With `assertEvidenceMatchesHead` removed (mutant N01), this test fails, together with the two index-flag tests and the certificate test. With a length-only comparison (N04) it also fails, so it still proves a same-size change is caught by content.
- **The precondition is asserted.** If Git could see the change, the test stops at the `git status` assertion instead of passing for the wrong reason.
- **No PASS on either platform.** On `aec5730e` Linux returned `BLOCKED RELEASE_TREE_DIRTY`; on Windows the same construction returned `REFUSED RELEASE_TREE_MISMATCH`. Both are refusals. The old test failed on Linux because it pinned which refusal, not because anything passed.
- **Overlap.** The test now uses the same mechanism as the existing `--assume-unchanged` loop test. What it still adds is the same-size property; the mtime restoration no longer does any work in it.
- **Coverage loss, stated plainly.** The pure construction (same size, mtime restored, no index flag) is no longer asserted by any test. I re-ran it myself on Windows at `cf8dd879`: `git status` empty, result `REFUSED RELEASE_TREE_MISMATCH`. The loss does not matter for safety: the binding compares bytes without regard to why `git status` was blind, the index-flag tests exercise that same code path, and where Git does notice, the clean check refuses first. A platform-neutral version (no flag; accept either refusal code, never PASS) would restore it cheaply; see non-blocking.

## 3. My runs on `cf8dd879`

Toolchain: Node v22.23.4, git 2.55.0.windows.3, OpenSSL 3.5.7.

| Command | Outcome |
|---|---|
| `node --test src/test/scripts/g4*.test.cjs` (audited worktree) | 88 tests, 88 pass, 0 fail, 0 skipped |
| Same with `G4_OPENSSL=/nonexistent` | 82 skipped with "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run", 6 pass, 0 fail |
| Pure same-size swap probe, no index flag (Windows) | `git status` empty; `REFUSED RELEASE_TREE_MISMATCH` |
| Razor on `g4ReleaseBinding.test.cjs` | 142 lines, longest function 12, nesting 1; no violation |
| Mutation set (scratch clone; `g4ReleaseMode` + `g4ReleaseBinding` + `g4FalsifyFields`) | 42 mutants, 36 killed, 6 survived |

The kill/survive set is identical to iteration 2. Survivors: M18 (`git status` failure ignored), N05 (missing disk file tolerated), N06 (`ls-tree` failure ignored), N09 (`--ignore-submodules=none` removed), N12 (missing flag value tolerated), N19 (order swap, equivalent). All were recorded as non-blocking at #934.

I did not repeat the full `npm run test:node` locally; the delta is one G4 test file and CI ran the full suite on this commit (below).

## 4. CI evidence

- `gh pr checks 646`: 13 checks, all pass, on head `cf8dd879` (PR open, not draft, base `main`, mergeable).
- PR Full Test run 42888118970, `cf8dd879`, ubuntu-24.04, conclusion success. Node suite: 1086 tests, 1053 pass, 0 fail, 33 skipped. Mocha: 6139 passing, 15 pending.
- The 33 skips are platform or toolkit gated (win32-only rows, `qor-logic` not installed, shallow clone, absent tag). **One of them is a G4 test**: "the TPM signer fails closed for a key name that does not exist" (`# SKIP Windows PowerShell only`). So "none of the skips G4" is not exact: on Linux 87 of the 88 G4 tests run. That test belongs to the #644 witness suite, is not a release-mode test, and passes on Windows in my run. No G4 test is skipped for want of OpenSSL, and all 23 release-mode and binding tests ran and passed on Linux.
- Earlier run 42886339390 on `aec5730e`: failure. 1086 tests, 1052 pass, 1 fail, 33 skipped. The one failure was test 424, "--release refuses a same-size swap of a checkpoint file with its mtime restored": `expected REFUSED RELEASE_TREE_MISMATCH, got BLOCKED RELEASE_TREE_DIRTY … first: M tools/g4/checkpoints/g4-000002/timestamp.tsr`. This matches the stated cause.

## 5. Hygiene

`git ls-tree -r HEAD .qor/session` lists only `current`. `git log --all -- .qor/session/keys` is empty.

## Blocking items

None.

## Non-blocking items

- Restore the pure mtime-restored construction as a platform-neutral test: no index flag, accept `RELEASE_TREE_MISMATCH` or `RELEASE_TREE_DIRTY`, assert the verdict is never PASS. Then rename the current test, since its mtime step no longer contributes.
- The non-blocking items from #934 stand unchanged (exit 0 on a diagnostic PASS, one-directional binding, doc line 135 wording, the five untested branches).

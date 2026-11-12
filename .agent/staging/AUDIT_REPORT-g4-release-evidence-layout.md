# AUDIT REPORT: G4 release-mode evidence layout (#638)

## Verdict

**VETO**

- Audited commit: `2b223e5f5d4b2e4c0e8c299ca5b1eaa2fcecda1a` (branch `fix/638-g4-release-evidence-layout`), one commit on `origin/main` `9f16548d83116e2d8ee7f9010545963c06e5c93a`.
- Host: Windows 11, NTFS, Git 2.55.0.windows.3, Node v22.23.4, `core.ignorecase=true`. No POSIX host was available (no WSL, no Docker).
- Two blocking findings. The rule is sound for every ordinary construction I tried, and it causes no false refusal on a genuine repository. It is not exact: one parsing defect makes its stated invariant false, and on the documented operator platform a release `PASS` is still obtainable for the very trees the plan says are now refused.

## Risk grade

L3 (release-trust tooling). Confirmed. Note that `.qor/gates/2026-11-11T0032-37b50f/plan.json` records `"high_risk_target": false`, which disagrees with the plan's own "Risk grade (proposed): L3".

## Blocking findings

### B1. A TAB in a committed path is truncated, so the layout check accepts extra paths and a missing file

**Where.** `FailSafe/extension/scripts/lib/g4/release-mode.cjs` line 89:

```js
const [meta, rel] = record.split("\t");
```

`split("\t")` splits on every tab and the destructuring keeps only the second field. `git ls-tree -z` prints paths verbatim, so a path that contains a tab loses everything from the tab onward before the regex and file-name tests see it.

**Evidence (reproducible, `run1.cjs` and `run4.cjs` in the scratch directory).** Trees built with `git -c core.protectNTFS=false update-index -z --index-info`, committed, on top of the two-checkpoint base from `g4Scenario.buildBase`:

| Committed tree under `tools/g4/checkpoints/g4-000002/` | `assertEvidenceLayout` called directly | Library, real NTFS | CLI, real NTFS |
|---|---|---|---|
| five files + `manifest.json<TAB>x` (6 entries) | **accepts** | `REFUSED RELEASE_TREE_MISMATCH`, `mode: release` | same, exit 1 |
| five files + `manifest.json<TAB>d/evil.sh` (nested) | **accepts** | `REFUSED RELEASE_TREE_MISMATCH` | same, exit 1 |
| `timestamp.tsq` removed, `timestamp.tsq<TAB>` added | **accepts** | `REFUSED RELEASE_TREE_MISMATCH` | same, exit 1 |
| control: `100755` entry named `manifest.json<TAB>x` | refuses (`RELEASE_EVIDENCE_LAYOUT`) | `REFUSED RELEASE_EVIDENCE_LAYOUT` | same, exit 1 |

`git ls-tree -r HEAD` (the operator's manual check 4, without `-z`) shows the offending entries plainly, C-quoted:

```
100644 blob bf797a47…  "tools/g4/checkpoints/g4-000002/manifest.json\textra-payload.sh"
100644 blob bf797a47…  "tools/g4/checkpoints/g4-000002/timestamp.tsq\t"
```

So the new code is weaker than the manual check it says it repeats.

On this Windows host the run is still refused, but by a different check and only because NTFS cannot store a tab in a file name (`fs.writeFileSync` returns `ENOENT`), so `assertEvidenceMatchesHead` cannot read the file. On Linux or macOS such a file is an ordinary tracked file: `git status` is clean and the blob comparison succeeds. I could not run a POSIX host, so I simulated one: the same repository, with `fs.readFileSync` patched in-process to serve the tab-named paths from their committed blobs, returns

```
LIB PASS OK mode=release limitations=[] | 2 checkpoint(s) verified to g4-000002
```

with `timestamp.tsq` absent and an extra `manifest.json<TAB>extra-payload.sh` committed. That is a simulation, not an observed POSIX run; the function-level acceptance is observed directly.

**Why blocking.** The change's claim, its code comment, the plan and both doc sentences say every tree that is not exactly five regular files per directory is refused with `RELEASE_EVIDENCE_LAYOUT`. Three such trees pass the function. No test covers it (mutant J23, which reads the last tab field instead, survives all 97 tests).

**Required remediation.**
1. Split each record at the first tab only (`const i = record.indexOf("\t"); meta = record.slice(0, i); rel = record.slice(i + 1)`), and refuse a record with no tab.
2. Add tests that commit `manifest.json<TAB>x` as an extra entry and `timestamp.tsq<TAB>` in place of the query, built through `update-index -z --index-info` with `core.protectNTFS=false`, and assert `REFUSED RELEASE_EVIDENCE_LAYOUT`. These tests must fail on the current code.

### B2. On a case-insensitive filesystem a case-variant path prefix bypasses the rule: real release `PASS` with a missing query and an extra file

**Construction (`run2.cjs`, `run3.cjs`).** Move the head checkpoint's entries in the Git tree from `tools/g4/checkpoints/g4-000002/` to `tools/g4/Checkpoints/g4-000002/` (also tried `Tools/g4/checkpoints` and `tools/G4/checkpoints`), drop `timestamp.tsq`, add `notes.txt` and a `100755` `run.sh`:

```
100644 blob …  tools/g4/Checkpoints/g4-000002/manifest.json
100644 blob …  tools/g4/Checkpoints/g4-000002/manifest.sig
100644 blob …  tools/g4/Checkpoints/g4-000002/notes.txt
100755 blob …  tools/g4/Checkpoints/g4-000002/run.sh
100644 blob …  tools/g4/Checkpoints/g4-000002/timestamp.tsr
100644 blob …  tools/g4/Checkpoints/g4-000002/tsa-chain.pem
100644 blob …  tools/g4/checkpoints/g4-000001/{five files}
```

On NTFS both prefixes check out into the same directory, so the disk holds `tools/g4/checkpoints/g4-000002/` with `manifest.json, manifest.sig, notes.txt, run.sh, timestamp.tsr, tsa-chain.pem`.

**Results.**

| Checkout | `git status` | Library | CLI |
|---|---|---|---|
| in place, all three prefix variants | clean | `PASS OK`, `mode: release` | `PASS OK`, `mode: release`, exit 0 |
| fresh `git clone` of the `Checkpoints` variant (no query, plus `notes.txt`) | clean | `PASS OK`, `mode: release` | `PASS OK`, `mode: release`, exit 0 |

`assertEvidenceLayout` lists `tools/g4/checkpoints` with a case-sensitive Git pathspec and sees only `g4-000001`. `layout.listCheckpoints` reads the disk and walks `g4-000002` as the head checkpoint. `assertEvidenceMatchesHead` uses the same pathspec, so the head checkpoint's files are also exempt from the byte comparison.

**Classification.** The blindness (disk listing versus a case-sensitive Git pathspec) exists on `origin/main` and this change does not make it worse. I still grade it blocking for this change, for two reasons:
- The plan's "Problem" section lists "an extra file inside a checkpoint directory" and "a checkpoint with its `timestamp.tsq` removed" returning a release `PASS`. After the change both still return a release `PASS` through the real CLI on Windows, the platform the release procedure prescribes (Git Bash or PowerShell).
- `G4_WITNESS_OPERATIONS.md` now tells the operator that "the verifier itself enforces" five regular files per checkpoint directory. For the directory the verifier actually reads, that is false here. Manual check 4 uses the same pathspec and is equally blind; only check 2 (every path of every post-seal commit) shows the path, and five `A` lines under `tools/g4/Checkpoints/g4-NNNNNN/` look legitimate to the eye.

The literal wording "the tree committed at HEAD under `tools/g4/checkpoints/`" is not violated, since the Git path differs by case. If the owner rules that this literal scope is the whole claim, B2 drops to a non-blocking pre-existing weakness and the docs must then state the limitation. B1 stands either way.

**Required remediation (either closes it).**
1. Bind the disk to the tree: in release mode, require that the recursive directory listing of `<repoRoot>/tools/g4/checkpoints` (exact names, including directories) equals exactly the set of paths `git ls-tree` returned. A checkpoint directory on disk with no exact-case Git counterpart is then refused.
2. Or list the whole tree at HEAD and refuse any path whose case-folded, NFC-normalised form falls under `tools/g4/` while its exact bytes do not.

Add a test for it (skip where the filesystem is case-sensitive), and apply the same binding to `assertEvidenceMatchesHead`.

## Non-blocking findings

- **N1. Committed empty trees are not seen.** A crafted tree with empty tree entries `tools/g4/checkpoints/g4-000003/`, `junkdir/` and `g4-000002/emptysub/` returns `PASS OK`, release, library and CLI (exit 0). `git ls-tree -r` omits empty trees. Git never checks these out and `git add` cannot create them, so the effect is nil, but the tree is not "exactly five regular files per directory". `ls-tree -r -t` would list them. Manual check 4 has the same gap.
- **N2. `GIT_*` environment is inherited (pre-existing).** With `GIT_DIR` and `GIT_WORK_TREE` pointing at a clean repository B, `--repo-root A` (A has a committed extra file) returns `PASS OK`, release, exit 0: Git answers for B while checkpoints are read from A's disk. `git()` in `git.cjs` does not scrub the environment. Requires control of the operator's environment. `GIT_DIR` alone, or `GIT_WORK_TREE` alone, ends in `BLOCKED RELEASE_TREE_DIRTY`.
- **N3. Test gaps (surviving mutants, see table).** No test for: a tab in a path (J23); a case variant of a file name (J10); a look-alike such as `manifest.json.bak` (J9); a path nested under a directory named like an evidence file (J7); a deep path that embeds `tools/g4/checkpoints/g4-NNNNNN/…` (J6); any missing file other than `timestamp.tsq` (J13); `git ls-tree` failing, including a fail-open variant (J19, J20). I confirmed by hand that the current code refuses the J6, J7, J9 and J10 constructions; they are untested, not broken.
- **N4. The submodule test passes on a dirty checkout.** The index-only gitlink leaves `git status --porcelain` = `D tools/g4/checkpoints/g4-000009`, and the test does not assert cleanliness (it bypasses `expectLayoutRefusal`). It passes only because the layout check runs before the clean check: moving the call after `assertCleanCheckout` (mutants J14, J15) is detected by this test alone, as `BLOCKED RELEASE_TREE_DIRTY`. The behaviour itself is right: a real initialised submodule at `g4-000003` with a clean checkout is refused with `RELEASE_EVIDENCE_LAYOUT` (library and CLI, exit 1). The test should use that construction.
- **N5. Ordering changes one result.** A repository with both a committed layout violation and a dirty checkout was `BLOCKED RELEASE_TREE_DIRTY` (exit 2) on `origin/main` and is now `REFUSED RELEASE_EVIDENCE_LAYOUT` (exit 1). Both are non-PASS; no existing test depends on it. The ordering is not documented.
- **N6. Documentation precision.**
  - "which repeats check 4 in code" is not exactly true. The code is stricter in one way (it requires the five names, check 4 says only "five files per directory"; it disables replace refs) and weaker in two (B1: the manual listing shows a tab path, the code does not; it shares the blind spots in B2 and N1).
  - The "It still does not see" list omits case-variant paths (B2) and stray files under `tools/g4/keys/` (the plan mentions the latter, the doc does not).
  - The header comment of `scripts/g4-verify-checkpoint.cjs` still describes release mode without the layout rule (file not touched).
  - The sentence "Checks 2, 3 and 5 are the only control for those, and check 4 is still run by the operator" is accurate as far as I could verify.
- **N7. Record inconsistencies.** The commit message says "7/7 mutants killed"; the plan lists five mutations. The plan says six constructions were red; with the call removed seven tests fail (the seventh, the submodule test, fails with `RELEASE_TREE_DIRTY` rather than a PASS, which is consistent with the plan's wording but not with a reader's count). `high_risk_target: false` versus L3. `plan_content_hash` matches the committed plan (`45208a6c…a83f`).
- **N8. Pre-existing false refusals, not caused by this change.**
  - A repository path long enough to exceed 260 characters for `tools/g4/keys/<64 hex>.cer` gave `REFUSED RELEASE_TREE_MISMATCH … is not readable` on the unmodified base (observed when my scratch directory was deep). The code is misleading for an environment limit.
  - A fresh clone with `core.autocrlf=true` and no `.gitattributes` gives `REFUSED RELEASE_TREE_MISMATCH`. The real repository marks `tools/g4/checkpoints/**` and `keys/**` binary, so it is not affected.
- **N9. Non-canonical file modes.** Crafted tree modes `100664` and `100600` are reported by Git itself as `100644` and pass. Correct behaviour: Git treats them as regular non-executable files; `git fsck` is the tool for this.
- **N10. Operational note.** A checkpoint committed from a checkout where files appear executable (`core.filemode=true` on a mount that sets the bit) is recorded `100755` and will be refused at release. That is by design and matches check 4; the builder itself writes plain files.

## Falsification table

"Hole" means a release `PASS`, or an acceptance by the layout function, for a tree that violates the claim. Every row was run through `verifyCheckpoints({release:true,…})` and through `g4-verify-checkpoint.cjs --release --json`; all results are `mode: release`.

| # | Construction | Library | CLI (exit) | Assessment |
|---|---|---|---|---|
| 1 | Control, unmodified base | PASS OK | PASS OK (0) | correct |
| 2 | Extra `Manifest.json` (case variant of a file name) | REFUSED RELEASE_EVIDENCE_LAYOUT | same (1) | correct |
| 3 | Directory `G4-000002/` | REFUSED LAYOUT | same (1) | correct |
| 4 | Directory with full-width digit `g4-00000３` | REFUSED LAYOUT | same (1) | correct |
| 5 | Cyrillic look-alike `mаnifest.json` | REFUSED LAYOUT | same (1) | correct |
| 6 | Trailing dot `manifest.json.` | REFUSED LAYOUT | same (1) | correct |
| 7 | Trailing space `manifest.json ` | REFUSED LAYOUT | same (1) | correct |
| 8 | Newline inside a file name | REFUSED LAYOUT | same (1) | correct |
| 9 | Newline at end of the directory name | REFUSED LAYOUT | same (1) | correct |
| 10 | Double quotes in the name | REFUSED LAYOUT | same (1) | correct |
| 11 | Seven-digit directory `g4-0000003` | REFUSED LAYOUT | same (1) | correct |
| 12 | `g4-000003` with one file | REFUSED LAYOUT ("lacks …") | same (1) | correct |
| 13 | `g4-000003` with only an extra file | REFUSED LAYOUT | same (1) | correct |
| 14 | Gitlink `160000` at a file path | REFUSED LAYOUT | same (1) | correct |
| 15 | `manifest.json<TAB>x` extra | REFUSED RELEASE_TREE_MISMATCH | same (1) | **hole in this change (B1)**: layout function accepts; refused only because NTFS cannot hold the name |
| 16 | `manifest.json<TAB>d/evil.sh` nested | REFUSED RELEASE_TREE_MISMATCH | same (1) | **hole in this change (B1)** |
| 17 | `timestamp.tsq` replaced by `timestamp.tsq<TAB>` | REFUSED RELEASE_TREE_MISMATCH | same (1) | **hole in this change (B1)** |
| 18 | Row 17 plus row 15, POSIX filesystem simulated | PASS OK, no limitation | not run | **hole (B1)**, simulation only |
| 19 | Prefix `tools/g4/Checkpoints/`, head checkpoint without query, plus `notes.txt` and `100755` `run.sh` | PASS OK | PASS OK (0) | **hole (B2)**; pre-existing blindness, bypasses the new rule |
| 20 | Same with `Tools/g4/checkpoints/` | PASS OK | PASS OK (0) | **hole (B2)** |
| 21 | Same with `tools/G4/checkpoints/` | PASS OK | PASS OK (0) | **hole (B2)** |
| 22 | Row 19 in a fresh clone | PASS OK | PASS OK (0) | **hole (B2)** |
| 23 | `timestamp.tsq` renamed `Timestamp.tsq` | REFUSED LAYOUT | same (1) | correct |
| 24 | Untracked `g4-000003/` hidden by `.git/info/exclude` | BLOCKED RELEASE_TREE_DIRTY | same (2) | correct (pre-existing check) |
| 25 | Extra disk file hidden by `core.excludesFile` and `status.showUntrackedFiles=no` | BLOCKED RELEASE_TREE_DIRTY | same (2) | correct |
| 26 | Nested `.git` repository at `g4-000003`, without and with a commit | BLOCKED RELEASE_TREE_DIRTY | same (2) | correct |
| 27 | Nested repository inside `g4-000002/sub` | BLOCKED RELEASE_TREE_DIRTY | same (2) | correct |
| 28 | Empty `g4-000003/` on disk only | REFUSED CHECKPOINT_INCOMPLETE | same (1) | correct; Git cannot see it, the walk refuses |
| 29 | `--assume-unchanged` plus edited `tsa-chain.pem` | REFUSED RELEASE_TREE_MISMATCH | same (1) | correct |
| 30 | `--skip-worktree` plus query deleted on disk | REFUSED RELEASE_TREE_MISMATCH | same (1) | correct |
| 31 | `GIT_DIR` to a clean repository, extra disk file | not applicable | BLOCKED RELEASE_TREE_DIRTY (2) | correct |
| 32 | `GIT_WORK_TREE` to a dirty tree | not applicable | BLOCKED RELEASE_TREE_DIRTY (2) | correct |
| 33 | `GIT_DIR` to clean B, `--repo-root` A with a committed extra | not applicable | BLOCKED RELEASE_TREE_DIRTY (2) | correct |
| 34 | `GIT_DIR` and `GIT_WORK_TREE` to B, `--repo-root` A | not applicable | PASS OK (0) | pre-existing hole outside the claim (N2) |
| 35 | Crafted mode `100664` | PASS OK | PASS OK (0) | correct (N9) |
| 36 | Crafted mode `100600` | PASS OK | PASS OK (0) | correct (N9) |
| 37 | Committed empty trees `g4-000003/`, `junkdir/`, `g4-000002/emptysub/` | PASS OK | PASS OK (0) | minor hole in this change's wording (N1), no effect |
| 38 | Duplicate `manifest.json` entry instead of the query | REFUSED LAYOUT | same (1) | correct |
| 39 | 20,000 extra committed entries | REFUSED LAYOUT in 114 ms | not run | correct |
| 40 | `git replace` of the commit that holds the extra file | REFUSED LAYOUT | same (1) | correct; `--no-replace-objects` applies (plain `ls-tree` hid the file, the verifier's did not) |
| 41 | `git replace` of the tree object | REFUSED LAYOUT | same (1) | correct |
| 42 | Linked worktree with a committed extra | REFUSED LAYOUT | same (1) | correct |
| 43 | Real initialised submodule at `g4-000003`, clean | REFUSED LAYOUT | same (1) | correct |
| 44 | Author's index-only gitlink | REFUSED LAYOUT | same (1) | correct, but the checkout is dirty (N4) |
| 45 | Embedded path `…/junk/tools/g4/checkpoints/g4-000002/manifest.json` | REFUSED LAYOUT | same (1) | correct |
| 46 | `manifest.json.bak` extra | REFUSED LAYOUT | same (1) | correct |
| 47 | `--repo-root` = `<repo>/tools` or `<repo>/tools/g4/checkpoints` | REFUSED REGISTRY_MISSING | same (1) | correct |
| 48 | `--repo-root` = `<repo>/sub` holding a copy with an extra file | REFUSED LAYOUT | same (1) | correct |
| 49 | `--repo-root` = bare clone | BLOCKED REPO_UNREADABLE | same (2) | correct |

Genuine repositories (false-positive search), all `PASS OK`, release, exit 0: two builder-made checkpoints; one genesis checkpoint; six builder-made checkpoints (every entry `100644`, exactly the five names); detached HEAD; HEAD as a symbolic ref to `refs/weird/x`; a linked worktree; the repository checked out as a submodule of another. Zero checkpoints with no `tools/g4/checkpoints` directory: `BLOCKED NO_CHECKPOINTS` (exit 2), the same as before the change. `createCheckpoint` writes exactly the five files; its one temporary file (`tsa-chain.pem.token.der`) is removed before the staging directory is renamed. The real repository has no `tools/g4/checkpoints` tree at HEAD and no placeholder file that the rule would refuse. No false refusal found.

## Mutation table

Each mutant was applied to the worktree file, `g4ReleaseLayout.test.cjs` was run, survivors were re-run against all G4 suites, and the file was restored.

| ID | Mutant | Result |
|---|---|---|
| A1 | (author) call to `assertEvidenceLayout` removed | killed, 7 tests fail |
| A2 | (author) mode test removed | killed (symlink, executable) |
| A3 | (author) path test removed (any directory name) | killed (nested / odd directory) |
| A4 | (author) file-name test removed | killed (extra file) |
| A5 | (author) missing-file loop removed | killed (query removed) |
| J1 | mode also accepts `100755` | killed |
| J2 | mode also accepts `120000` | killed |
| J3 | mode rejects only `160000` | killed |
| J4 | regex `\d{6}` to `\d+` | killed |
| J5 | regex file group `[^/]+` to `.+` | survived; equivalent (the name test is still exact) |
| J6 | regex `^` anchor dropped | **survived** all 97 |
| J7 | regex `$` anchor dropped | **survived** all 97 |
| J8 | directory group allows nesting | killed |
| J9 | file-name test uses `startsWith` | **survived** all 97 |
| J10 | file-name test case-insensitive | **survived** all 97 |
| J11 | missing check requires only manifest and signature | killed |
| J12 | missing check ignores `timestamp.tsq` | killed |
| J13 | missing check ignores every file except `timestamp.tsq` | **survived** all 97 |
| J14 | call moved after the clean and blob checks | killed, by the submodule test only (N4) |
| J15 | call moved after the clean check | killed, by the submodule test only (N4) |
| J16 | rule also applied in diagnostic mode | killed (diagnostic test) |
| J17 | refusal downgraded to `BLOCKED` | killed, 7 tests fail |
| J18 | `ls-tree` without `-r` | killed |
| J19 | `ls-tree` exit status not checked | **survived** all 97 |
| J20 | `ls-tree` failure treated as an empty tree (fail-open) | **survived** all 97 |
| J21 | only the first tree entry inspected | killed |
| J22 | only the first directory checked for missing files | killed |
| J23 | `treeEntry` reads the last tab field | **survived** all 97 (the B1 area is untested) |
| J24 | `--no-replace-objects` dropped in `git.cjs` | survived the layout suite; killed by "a replace ref cannot hide a tampered ledger at HEAD" |
| J25 | pathspec widened to `tools/g4` | killed |
| J26 | gitlink entries skipped | killed |

The author's five listed mutations are all killed. Of my 26: 16 are killed by the layout suite, 1 is killed by another suite (J24), 1 survives but is equivalent (J5), and **8 non-equivalent mutants survive all 97 tests**: J6, J7, J9, J10, J13, J19, J20 and J23.

All nine tests can fail: each is failed by at least one mutant (control by J18, J21, J25; diagnostic by J16). The six tests that use `expectLayoutRefusal` do assert a clean checkout first. The submodule test does not (N4).

## Tests run

- `node --test src/test/scripts/g4*.test.cjs` from `FailSafe/extension`: 97 tests, 97 pass, 0 fail, 0 skipped, before and after my work.
- `node --test src/test/scripts/g4ReleaseLayout.test.cjs`: 9 of 9 pass.
- Diagnostic mode: for seven repositories (control, committed extra, query removed, untracked file, modified chain, assume-unchanged edit, committed extra plus dirty), the CLI from HEAD and the CLI from `origin/main` gave byte-identical output and exit codes in `--tsa-ca`, policy and `--json` diagnostic runs (21 of 21). Release runs differ only where a layout violation is committed.
- Section 4 razor: `release-mode.cjs` 135 lines, longest function `assertEvidenceLayout` 16 lines, maximum nesting 3 (function, `for`, `if`). `g4ReleaseLayout.test.cjs` 115 lines, longest function 11 lines, nesting 2. Within the limits (40 / 250 / 3).

## What I could not verify

- Any run on Linux or macOS. B1's end-to-end `PASS` is a simulation; macOS Unicode-normalisation aliases of the path prefix were not tried.
- `npm run test:node` (listed in the plan's `ci_commands`) was not run.
- A lying `core.fsmonitor` hook or untracked cache, and Git alternates, were not tried.
- Whether `git ls-tree` can realistically fail after `rev-parse HEAD^{commit}` succeeds (J19, J20), for example on a corrupt tree object.
- The HMAC tags in the `.provenance` files (no key).

## State left behind

- Worktree: `git status --short` is empty. `release-mode.cjs` and `git.cjs` were mutated during testing and restored; their blob ids equal HEAD (`d8a65aba…`, `2a3bc97c…`). Nothing was committed, pushed or posted. No real key, TSA or network service was used.
- This report is the only new file in the worktree (`.agent/` is git-ignored).
- Scratch directory outside the worktree: `C:\Users\krkna\AppData\Local\Temp\g4aud` with the harness (`h.cjs`), case scripts (`run1.cjs` to `run5.cjs`), the mutation runner (`mut.cjs`), an extract of `origin/main`'s G4 scripts (`main/`) and throwaway repositories under `tmp/`. It can be deleted.

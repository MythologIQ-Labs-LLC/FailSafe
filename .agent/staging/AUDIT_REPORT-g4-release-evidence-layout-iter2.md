# AUDIT REPORT (re-audit, iteration 2): G4 release-mode evidence layout (#638)

## Verdict

**PASS**

- Audited commit: `911505874c67aff0e15303ccb715942942e97e0b` (branch `fix/638-g4-release-evidence-layout`), two commits on `origin/main` `9f16548d83116e2d8ee7f9010545963c06e5c93a`: `2b223e5f` (first version, VETO) and this remediation.
- Host: Windows 11, NTFS (8.3 short names enabled on the volume), Git 2.55.0.windows.3, Node v22.23.4. Effective settings in a fresh clone here: `core.ignorecase=true`, `core.symlinks=false`, `core.filemode=false`, `core.autocrlf=true` (from configuration outside the repository), `core.protectNTFS` unset (built-in default on: the default clone refused trailing-dot, trailing-space, backslash and `:` paths with `invalid path`), `core.protectHFS` unset (off on Windows). No POSIX or macOS host was available.
- I found no blocking finding after 60+ crafted trees, a 40-row environment matrix and 60 mutants. No committed tree gave a release `PASS` that the change says is refused, and no genuine repository was refused.
- The PASS is for the claim as stated. Twelve non-blocking findings follow. Two of them (N1, N2) are trees that both new rules accept and that are stopped only by the older checks; they should be tracked.

## Risk grade

L3 (release-trust tooling). Confirmed.

## Status of B1 and B2

**B1: closed.** `treeEntry` takes the path as everything after the first tab. The three TAB trees, the `100755` control and the combined tree are refused by the layout rule itself.

| Tree under `g4-000002/` | Rule functions called directly | Library | CLI |
|---|---|---|---|
| five + `manifest.json<TAB>x` | layout refuses | `REFUSED RELEASE_EVIDENCE_LAYOUT`, release | same, exit 1 |
| five + `manifest.json<TAB>d/evil.sh` | layout refuses (on the tree entry `manifest.json<TAB>d`) | `REFUSED RELEASE_EVIDENCE_LAYOUT` | same, exit 1 |
| query removed, `timestamp.tsq<TAB>` added | layout refuses | `REFUSED RELEASE_EVIDENCE_LAYOUT` | same, exit 1 |
| control: `100755` `manifest.json<TAB>x` | layout refuses | `REFUSED RELEASE_EVIDENCE_LAYOUT` | same, exit 1 |
| query removed + `timestamp.tsq<TAB>` + `manifest.json<TAB>extra-payload.sh`, POSIX simulated (`fs.readFileSync` and `fs.existsSync` patched to serve the tab paths from their blobs) | layout refuses | `REFUSED RELEASE_EVIDENCE_LAYOUT` (was `PASS OK` in the previous audit) | not applicable |

**B2: closed.** The previous construction (head checkpoint moved to a case-variant prefix, query dropped, `notes.txt` and a `100755` `run.sh` added) now ends as follows. `git status` was clean in every row, and the disk directory `tools/g4/checkpoints/g4-000002` held `manifest.json, manifest.sig, notes.txt, run.sh, timestamp.tsr, tsa-chain.pem`, as before.

| Prefix | In place: library / CLI | Fresh `git clone`: library / CLI |
|---|---|---|
| `tools/g4/Checkpoints` | `REFUSED RELEASE_EVIDENCE_LAYOUT`, release / same, exit 1 | same / same, exit 1 |
| `Tools/g4/checkpoints` | `REFUSED RELEASE_EVIDENCE_LAYOUT` / exit 1 | same / exit 1 |
| `tools/G4/checkpoints` | `REFUSED RELEASE_EVIDENCE_LAYOUT` / exit 1 | same / exit 1 |

The message names the alias (`"tools/g4/Checkpoints" at <sha> differs from tools/g4/checkpoints only by case or Unicode form`). On `origin/main` the same repositories return `PASS OK`, exit 0.

## Blocking findings

None.

## Non-blocking findings

- **N1. The entry `tools/g4/checkpoints` itself is not examined (hole in this change's rule, masked by an older check).** `assertEvidenceLayout` filters on the prefix `tools/g4/checkpoints/`, so a tree where `tools/g4/checkpoints` is a symbolic link (`120000`) or a gitlink (`160000`) passes both new rules. Observed outcomes: gitlink, fresh clone, clean status: `REFUSED RELEASE_TREE_MISMATCH` (exit 1). Symlink to `../../elsewhere` holding a checkpoint with no query and an extra file: on this host (symlinks off) `BLOCKED INTERNAL_ERROR` (`ENOTDIR`); with a junction standing in for a POSIX checkout, `assertEvidenceMatchesHead` returns `REFUSED RELEASE_TREE_MISMATCH`. The refusal exists only because reading a directory as a file fails. The same holds for `tools/g4/keys` as a symlink (`REFUSED KEY_UNKNOWN` here). No PASS was obtained. Remediation: refuse unless `tools/g4/checkpoints` (and `tools/g4/keys`, `tools/g4`, `tools`) is a `tree` entry, with a test.
- **N2. Duplicate entries in a tree object are accepted by the layout rule (hole in this change's rule, masked by the clean check).** Trees written with `git hash-object -t tree --literally`: a second `manifest.json` entry with other bytes (6 entries), every file tripled (15), a second `g4-000002` directory entry without a query (9), an identical duplicate directory (10). Both rule functions accept all of them. Every fresh clone was `BLOCKED RELEASE_TREE_DIRTY` (exit 2), because Git's index cannot represent the duplicates, also with `core.ignoreCase=false`. `git fsck` reports `duplicateEntries`; a clone with `transfer.fsckObjects=true` fails. So "exactly five" is not enforced by the rule for a corrupt tree, though no PASS results. Remediation: refuse a repeated path, with a test.
- **N3. Aliases that are not case or NFKC variants are outside the alias rule; they are stopped by Git's path protection or by the clean check.** On this volume `checkp~1` and `CHECKP~1` (8.3 short name) and `checkpoints::$INDEX_ALLOCATION` open the evidence directory. Results: 8.3 name, default clone: the files land in the evidence directory and the run is `BLOCKED RELEASE_TREE_DIRTY` (Git reports them untracked). Trailing dot, trailing space, backslash, `::$INDEX_ALLOCATION`: the default clone fails with `invalid path` and the run is `BLOCKED RELEASE_TREE_DIRTY`; with `core.protectNTFS=false` they land in the evidence directory and are again reported untracked or modified, `BLOCKED RELEASE_TREE_DIRTY`. The claim is limited to case and Unicode form, so it is not false. The documents should say that other alias forms depend on the clean-checkout condition. HFS+ ignorable code points (U+200C and similar) could not be tested: on NTFS `check<U+200C>points` is a separate directory and the run is a correct `PASS`.
- **N4. The new path tests run on dirty checkouts and do not reproduce B2 as a PASS.** Against the audited code (`2b223e5f` library, new test file) all 11 tests fail, but tests 1 to 7 fail with `BLOCKED RELEASE_TREE_DIRTY`, not with a `PASS`: the trees exist only in the index, the files are absent from disk, and `expectRefused` does not assert a clean status. Test 8 fails only because the refusal text was reworded (the old code already refused each missing file). Tests 9, 10 and 11 fail for the reason they name. No test builds the B2 case on a clean checkout. The previous N4 (the submodule test passes only because the rule runs before the clean check) is unchanged, although the plan lists N4 as addressed. The tests are still valid regression tests: the rules read only the tree at HEAD, and moving them after the clean check is detected (mutant C1). Remediation: add one case-insensitive-only test that clones the crafted tree, asserts a clean status and expects the refusal.
- **N5. Twelve non-equivalent mutants survive all 108 tests** (table below): `git ls-tree` failing or failing open (H4, H5), an alias that is a leaf entry (F5, A3, A4), a near-prefix name such as `tools/g4/KEYS.md` being wrongly refused (F6), a gitlink in place of a checkpoint file (L3), the position of the rules before the input checks (C4), every redirect variable other than `GIT_DIR` and `GIT_WORK_TREE` (E4, E5, E6), and the case-insensitive variable-name match that Windows needs (E7). I confirmed by hand that the real code is correct in each case.
- **N6. `gitEnv` is sufficient for the variables it names, not for every redirect.** With the ten variables removed, none of `GIT_DIR`, `GIT_WORK_TREE` (any letter case), `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_NAMESPACE` changed a result. Configuration injected through `GIT_CONFIG_COUNT`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM` or an `includeIf` could not set `core.worktree` (Git reads it only from the repository) and changed no result. What remains, outside the stated claim and present on `main`: `core.worktree` written into the checkout's own `.git/config` hides an untracked file in the head checkpoint directory (`PASS OK`, exit 0, on HEAD and on `origin/main`), and a `git` planted earlier on `PATH` controls every answer (a no-op stub gave `BLOCKED REPO_UNREADABLE`). Both need control of the verifier's machine, not of the commit. The comment in `git.cjs`, "without anything that would make `-C repoRoot` read elsewhere", says more than the code does.
- **N7. Behaviour change for a repository found only through the environment.** A working tree whose Git directory lives elsewhere and is located by `GIT_DIR` plus `GIT_WORK_TREE` was `PASS OK` on `origin/main` and is now `BLOCKED REPO_UNREADABLE` ("has no HEAD commit"), in every mode. This follows from the stated design and fails closed. A Git hook environment (`GIT_DIR`, `GIT_INDEX_FILE` of the same repository), a linked worktree and a `.git` file all still pass. The operator documents do not mention that these variables are ignored.
- **N8. `GIT_GLOB_PATHSPECS=1` or `GIT_ICASE_PATHSPECS=1` blocks every release run** (`BLOCKED REPO_UNREADABLE`, genuine repository included), on `origin/main` as well: `git ls-tree` rejects pathspec magic. Fail-closed, not caused by this change. `GIT_LITERAL_PATHSPECS` and `GIT_NOGLOB_PATHSPECS` change nothing.
- **N9. `tools/g4/keys` is covered only against aliases of the directory.** A certificate committed only as `<FINGERPRINT>.CER` (upper case) gives `PASS OK` on Windows and would be `KEY_UNKNOWN` on a case-sensitive filesystem; the certificate bytes are still checked against the fingerprint. An extra certificate, a nested path and a `100755` file under `tools/g4/keys/` pass (documented as ignored). A case-variant certificate with different bytes beside the genuine one is `BLOCKED RELEASE_TREE_DIRTY`.
- **N10. Documentation and record precision.**
  - `G4_WITNESS_OPERATIONS.md`: "such a path would check out into the evidence directories on Windows or macOS" is true for letter case. For compatibility forms it is not true on NTFS (full-width `ｃ`, Kelvin sign, long s are separate directories here); the rule over-refuses them, which is safe.
  - CLI header: "only by case" omits the Unicode form that the code and both documents include.
  - Plan: the "Change" section still describes the first version (`assertEvidenceLayout(repoRoot, head)` with a `tools/g4/checkpoints` pathspec); "N3, N4" is listed as covered while N4 is not; the 22 mutants are not listed, so "21 of 22" cannot be checked; "The first ten ... all failed" is true (I saw 11 fail) but see N4 for why.
  - Gate record: `.qor/gates/2026-11-11T0032-37b50f/plan.json` is byte-identical to `plan-iter1.json`, says `"iteration": 1` and carries `plan_content_hash` `45208a6c…a83f`. The committed plan is iteration 2 with SHA-256 `998573526c60cc5b7ba21e331772ad39323ea71c3fcc9220cb3d3f8faab69b16`. There is no `plan-iter2.json`, unlike earlier sessions. The gate check is advisory.
  - The plan's "still operator-only" list is true but omits N1, N2, N3 and N6.
- **N11. Ordering.** The rules run after the commit check and before the clean check. Swapping the two rules (C2) or moving them before the input checks (C4) is not detected by a test; only the reported code changes when two conditions fail at once.
- **N12. Carried over, unchanged and not caused by this change:** a path over 260 characters gives `RELEASE_TREE_DIRTY` after a failed checkout (observed again); the effective `core.autocrlf=true` on this machine would break a repository without attributes, and the real repository is protected (`git check-attr` reports `binary: set` for `tools/g4/checkpoints/**` and `tools/g4/keys/**`); a checkpoint committed from a mount that sets the executable bit is refused by design.

## Falsification table

Every row was run through `verifyCheckpoints({release:true,…})` and through `g4-verify-checkpoint.cjs --release --json`; all results are `mode: release`. Unless stated, each tree was committed with plumbing and then verified on a fresh default `git clone` ("default") and on a clone made with `core.protectNTFS=false`, `core.protectHFS=false`, `core.symlinks=true` ("unprotected"). LAYOUT = `REFUSED RELEASE_EVIDENCE_LAYOUT` (exit 1); DIRTY = `BLOCKED RELEASE_TREE_DIRTY` (exit 2); MISMATCH = `REFUSED RELEASE_TREE_MISMATCH` (exit 1). Library and CLI agreed in every row.

| # | Construction | Result | Assessment |
|---|---|---|---|
| 1 | Control, unmodified base | PASS OK (0) | correct |
| 2-6 | Five TAB trees (B1 table) | LAYOUT | correct, B1 closed |
| 7-12 | Three case-variant prefixes, in place and fresh clone (B2 table) | LAYOUT | correct, B2 closed |
| 13 | Kelvin sign `checKpoints` (U+212A), extra file and moved head | LAYOUT | correct (separate directory on NTFS; over-refusal is safe) |
| 14 | Long s `checkpointſ`, extra and moved; `keyſ` | LAYOUT | correct (separate directory on NTFS) |
| 15 | Dotless i `checkpoınts`, extra file | PASS OK (0) | correct: NTFS keeps it a separate directory, the evidence directory is untouched; `fold` does not equate it |
| 16 | Dotless i, head checkpoint moved there | `REFUSED HEAD_MISMATCH` (1) | correct |
| 17 | ZWNJ `check<U+200C>points`, extra / moved | PASS OK (0) / `HEAD_MISMATCH` | correct on NTFS; HFS+ not verified (N3) |
| 18 | Trailing dot `checkpoints.`, extra / moved | default: clone fails, DIRTY; unprotected: files land in the evidence directory, DIRTY | outside the alias rule; refused by older checks (N3) |
| 19 | Trailing space `checkpoints ` | clone fails both ways, DIRTY | same |
| 20 | 8.3 short name `checkp~1`, extra / moved | files land in the evidence directory on both clones; DIRTY (`??` lines) | same; Git does not block this path |
| 21 | `checkpoints::$INDEX_ALLOCATION` | default: clone fails, DIRTY; unprotected: lands in the evidence directory, DIRTY | same |
| 22 | Backslash paths `tools\g4\checkpoints\…`, `tools/g4/checkpoints\g4-000002\notes.txt`, moved head | default: `invalid path`, DIRTY; unprotected: lands or fails, DIRTY | same |
| 23 | `manifest.json:stream` inside the exact directory | LAYOUT | correct |
| 24 | Vertical tab, CR in a file name; 240-character name; invalid UTF-8 file name | LAYOUT | correct |
| 25 | Invalid UTF-8 byte in the directory name; LF-embedded fake record as a top-level name | DIRTY | correct (not an alias; checkout cannot represent it) |
| 26 | `Tools/readme.txt`; `tools/G4/readme.txt` (parent alias, other content) | PASS OK (0) | correct: the file lands in `tools/` or `tools/g4/`, not in an evidence directory; those files are read from Git objects |
| 27 | Gitlink at `tools/G4` or `Tools` whose submodule holds `checkpoints/g4-000002/notes.txt` or `keys/<x>.cer`; plain clone and `--recurse-submodules` | PASS OK (0) | correct: Git refuses to populate it ("directory not empty"), the evidence directories are untouched |
| 28 | Gitlink at `tools/g4/Keys`; leaf blob `tools/g4/Checkpoints` | LAYOUT | correct |
| 29 | Symlink entry `tools/g4/cp` to `checkpoints` | default: PASS OK (0), the link is a plain file | correct; a real symlink could not be created here (no privilege) |
| 30 | `tools/g4/checkpoints` committed as a symlink, evidence moved to `elsewhere/` without a query | default: `BLOCKED INTERNAL_ERROR` (2); junction emulation: MISMATCH | both rules accept; refused by an older check (N1) |
| 31 | `tools/g4/keys` committed as a symlink | `REFUSED KEY_UNKNOWN` (1) | same (N1) |
| 32 | Gitlink exactly at `tools/g4/checkpoints` | MISMATCH, clean status | same (N1) |
| 33 | Duplicate tree entries, five variants | DIRTY | both rules accept; refused by the clean check (N2) |
| 34 | Tree entry named `g4-000002/notes.txt` (slash in the name) | LAYOUT, clean status | correct |
| 35 | Blob and tree both named `g4-000002` | LAYOUT | correct |
| 36 | `.gitattributes`: `eol=crlf` / `working-tree-encoding=UTF-16LE` / `ident` on evidence | DIRTY / MISMATCH / PASS OK (no `$Id$` present) | correct |
| 37 | `.gitignore` covering `tools/g4/**` | PASS OK (0) | correct: tracked files are not ignored files |
| 38 | Keys: upper-case-only certificate name; extra certificate; nested `100755` file | PASS OK (0) | outside the claim (N9) |
| 39 | Keys: case-variant certificate with other bytes beside the genuine one | DIRTY | correct |
| 40 | `core.sparseCheckout` + skip-worktree on a removed checkpoint file | MISMATCH | correct |
| 41 | Skip-worktree on an edited `docs/META_LEDGER.md` | PASS OK (0) | correct: the ledger is read from Git objects |
| 42 | `core.ignoreCase=false` on a genuine clone | PASS OK (0) | correct |
| 43 | 390-character path elsewhere | clone fails, DIRTY | pre-existing (N12) |
| 44 | 100,000 and 500,000 extra committed entries (sparse checkout) | PASS OK; `git ls-tree` 149 / 490 ms, both rules 32 / 147 ms, whole run 1.5 / 2.2 s | correct |
| 45 | Output larger than `maxBuffer` | `spawnSync` status `null` (`ENOBUFS`), so `headTree` blocks | correct (code path checked, not a full run) |

Rule functions called directly on synthetic entries (23 cases) agree with the table. Notable: a single file named with full-width slashes `tools／g4／checkpoints` is refused (absurd name, safe); `tools/g4/KEYS.md`, `tools/g4/Checkpoints-old/x`, `TOOLS/G4/x.txt`, `x/tools/g4/checkpoints/…` are accepted; a gitlink or symlink in place of a checkpoint file or directory, a tree named `manifest.json` and mode `100664` are refused.

False-refusal search, all `PASS OK`, release, exit 0, library and CLI: fresh clone at the genesis checkpoint (one checkpoint); six builder-made checkpoints, fresh clone and `git worktree add` (30 entries, all `100644`); a repository with `docs/été.md` in NFC and NFD, CJK names, `Docs2/TOOLS/G4/x.txt`, `tools/g4/tsa-roots/Extra.pem`, `tools/g4/<Kelvin>.txt`, `tools/g4/checkpoints.md`, `tools/g4/keys.txt`, `tools/g4/checkpoints-old/x`. Zero checkpoints: `BLOCKED NO_CHECKPOINTS` (2), as on `main`. The real tree: both rules accept `origin/main` (2,719 entries) and HEAD (2,728 entries); no path folds into `tools` with a different spelling and no path is non-ASCII; `git ls-tree` takes about 40 ms and the rules 2 to 3 ms. Linux file modes were not run; `checkpoint.cjs` contains no `chmod` or mode argument.

## Environment table

Real CLI, release mode. Repositories: **A** committed extra file (expect LAYOUT), **U** untracked file in the head checkpoint directory (expect DIRTY), **M** `--assume-unchanged` plus edited `tsa-chain.pem` (expect MISMATCH), **I** ignored file under `tools/g4` (expect DIRTY), **G** genuine (expect PASS). B is a clean copy used as the redirect target. "ok" means all five results were as expected.

| Environment | HEAD | `origin/main` (for contrast; A is PASS there by design) |
|---|---|---|
| none | ok | ok except A |
| `GIT_DIR=B` | ok | A `RELEASE_COMMIT_MISMATCH`, M DIRTY |
| `GIT_WORK_TREE=B` | ok | **U PASS, I PASS** |
| `GIT_DIR` + `GIT_WORK_TREE` = B | ok | **U PASS, I PASS** |
| `git_dir` + `Git_Work_Tree` = B (other letter case) | ok | **U PASS, I PASS** |
| `GIT_INDEX_FILE=B` | ok | A DIRTY, M DIRTY |
| `GIT_OBJECT_DIRECTORY=B`, `GIT_COMMON_DIR=B` | ok | A `REPO_UNREADABLE` |
| `GIT_ALTERNATE_OBJECT_DIRECTORIES=B`, `GIT_NAMESPACE=x` | ok | ok except A |
| `GIT_GRAFT_FILE`, `GIT_SHALLOW_FILE`, `GIT_REPLACE_REF_BASE` | ok | ok except A |
| `core.worktree=B` through `GIT_CONFIG_COUNT`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, `includeIf` | ok | ok except A |
| Injected `core.excludesFile` + `status.showUntrackedFiles=no`; `core.fsmonitor` hook + `core.untrackedCache`; `core.ignoreCase=false`; `core.protectNTFS=false` + `core.quotePath=false`; `core.sparseCheckout`; `core.bare=true`; `extensions.worktreeConfig`; `diff.ignoreSubmodules=all`; forced colour | ok | ok except A |
| `GIT_CEILING_DIRECTORIES`, `GIT_DISCOVERY_ACROSS_FILESYSTEM`, `GIT_EXEC_PATH` (bogus), `GIT_TRACE*`, `GIT_ATTR_SOURCE`, `GIT_NO_REPLACE_OBJECTS`, `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`, `GIT_PREFIX`, `GIT_QUARANTINE_PATH`, `GIT_IMPLICIT_WORK_TREE=0` | ok | ok except A |
| `GIT_LITERAL_PATHSPECS=1`, `GIT_NOGLOB_PATHSPECS=1` | ok | ok except A |
| `GIT_GLOB_PATHSPECS=1`, `GIT_ICASE_PATHSPECS=1` | M and G `BLOCKED REPO_UNREADABLE` | the same, and A (N8) |
| Hook environment on a genuine repository; linked worktree with and without it | PASS | PASS |
| Repository found only through `GIT_DIR` + `GIT_WORK_TREE` | `BLOCKED REPO_UNREADABLE` | PASS (N7) |
| `PATH` with a no-op `git.exe` first | `BLOCKED REPO_UNREADABLE` | not run; out of the claim |

Repository-local configuration (attacker can write `.git/config`, not the commit; out of the stated claim):

| Local setting | Result on HEAD |
|---|---|
| `core.worktree=B`, untracked file in the head checkpoint directory | **PASS OK (0)**; the same on `origin/main` (N6) |
| `core.worktree=B`, committed extra file | LAYOUT |
| `status.showUntrackedFiles=no` + `core.excludesFile` hiding the file | DIRTY (`!!` line) |
| `core.fsmonitor` hook that reports nothing + untracked cache, primed before the file existed | DIRTY (my attempt did not hide the file; not proof that none can) |
| `core.sparseCheckout` + skip-worktree, checkpoint file removed | MISMATCH |

Threat model. A committed tree that fools an honest operator on a fresh clone: not found. An attacker who controls the verifier's environment variables: closed for the ten listed variables. An attacker who controls the checkout's `.git/config`, the `git` binary or the scripts: not addressed and not claimed.

Existing suites with variables set: `GIT_ALTERNATE_OBJECT_DIRECTORIES` + `GIT_OPTIONAL_LOCKS=0` + `GIT_LITERAL_PATHSPECS=1`: 108 of 108. `GIT_NAMESPACE=audit` + `GIT_ICASE_PATHSPECS=1`: 96 pass, 12 fail, all from N8 (the test helper and the verifier both pass a pathspec to `git ls-tree`).

## Mutation table

Mutants were applied to a byte-identical sparse clone of HEAD outside the worktree (blob ids of `release-mode.cjs` `76aabe2f…` and `git.cjs` `e176e006…` equal HEAD; the clone runs 108 of 108). Each was run against the two layout suites (20 tests); survivors against all G4 suites.

| ID | Mutant | Result |
|---|---|---|
| T1 | `treeEntry`: last tab instead of first | killed (tab test) |
| T2 | `treeEntry`: no-tab guard removed | survived; equivalent in practice (Git never emits such a record) |
| T3 | `treeEntry`: path keeps the tab | killed, 17 fail |
| T4 | `treeEntry`: mode and type swapped | killed, 11 fail |
| T5 | `treeEntry`: old split-on-every-tab bug restored | killed (tab test) |
| T6 | `treeEntry`: path trimmed | killed |
| H1 | `headTree`: no `-r` | killed |
| H2 | `headTree`: no `-t` | killed (nested, empty directory) |
| H3 | `headTree`: no `-z` | killed |
| H4 | `headTree`: exit status not checked | **survived** |
| H5 | `headTree`: failure treated as an empty tree (fail-open) | **survived** |
| H6 | listing limited to `tools/g4` | killed |
| H7 | listing limited to `tools` | killed |
| H8 | listing limited to the two evidence directories | killed |
| F1 | `fold`: no normalisation | killed (full-width test) |
| F2 | `fold`: no lower-casing | killed |
| F3 | `fold`: NFC | killed |
| F4 | `fold`: NFKD | survived; equivalent for ASCII targets |
| F5 | `within`: equality branch removed | **survived** (a leaf alias entry is untested) |
| F6 | `within`: prefix without the slash | **survived** (false refusal of `tools/g4/KEYS.md` is untested) |
| F7 | alias: exact-path exemption removed | killed (control) |
| F8 | alias: fold on both sides | killed |
| F9 | `fold`: upper case | killed |
| A1 | alias roots: checkpoints only | killed (`tools/g4/Keys`) |
| A2 | alias roots: keys only | killed |
| A3 | alias: only tree entries inspected | **survived** |
| A4 | alias: only blob entries inspected | **survived** |
| A5 | alias: refusal downgraded to `BLOCKED` | killed |
| A6 | alias: call removed | killed, 6 fail |
| A7 | alias: only the first 20 entries inspected | killed |
| L1 | layout: filter prefix without the slash | killed (control) |
| L2 | layout: directories not inspected | killed |
| L3 | layout: any non-blob counts as regular | **survived** (gitlink in place of a checkpoint file is untested) |
| L4 | layout: mode test removed | killed |
| L5 | layout: `100755` accepted | killed |
| L6 | layout: file-name test removed | killed |
| L7 | layout: `$` dropped after the file-name group | survived; equivalent, the author's claim holds: a longer path needs a `tree` entry, which the directory pattern refuses, and `-t` is itself tested (H2) |
| L8 | layout: `$` dropped in the directory pattern | killed (empty directory) |
| L9 | layout: `^` dropped in the file pattern | survived; equivalent for the same reason |
| L10 | layout: `\d{6}` to `\d+` | killed |
| L11 | layout: missing-file loop removed | killed |
| L12 | layout: only the query required | killed |
| L13 | layout: empty directories not recorded | killed |
| L14 | layout: refusals downgraded to `BLOCKED` | killed, 11 fail |
| L15 | layout: call removed | killed, 11 fail |
| L16 | layout: file-name test case-insensitive | killed |
| L17 | layout: file-name test by prefix | killed |
| L18 | layout: only the first directory checked for missing files | killed |
| C1 | both rules after the clean check | killed, 9 fail (N4) |
| C2 | layout before alias | survived; equivalent in verdict and code |
| C3 | rules also run in diagnostic mode | killed (diagnostic test) |
| C4 | rules before the override, input and commit checks | **survived** |
| E1 | `gitEnv` not passed to `spawnSync` | killed |
| E2 | `GIT_WORK_TREE` kept | killed |
| E3 | `GIT_DIR` kept | killed |
| E4 | `GIT_INDEX_FILE` kept | **survived** |
| E5 | `GIT_OBJECT_DIRECTORY` and alternates kept | **survived** |
| E6 | only `GIT_DIR` and `GIT_WORK_TREE` removed | **survived** |
| E7 | variable-name match case-sensitive | **survived** (matters on Windows) |
| E8 | variables emptied instead of deleted | killed |
| E9 | `--no-replace-objects` dropped | survived the layout suites; killed by "a replace ref cannot hide a tampered ledger at HEAD" |

Totals: 60 mutants; 42 killed by the two layout suites; 1 killed by another suite; 17 survive all 108 tests, of which 5 are equivalent (T2, F4, L7, L9, C2) and 12 are not (H4, H5, F5, F6, A3, A4, L3, C4, E4, E5, E6, E7). The author's list of 22 is not recorded, so I could not re-run it as such; the areas it names are covered above.

Each of the 20 tests can fail: control (L1, T4, F7), extra file (L6), stray file (L15), nested and odd directory (H2, L10), query removed (L11), symlink (L4), executable (L5), submodule (C1), diagnostic (C3), tab (T1), the four case variants (A1, A2, H6, H7 between them), moved head (F2), full-width (F1), five files and near misses (L12, L16), empty directory (L8, L13), `GIT_DIR` + `GIT_WORK_TREE` (E3), `GIT_WORK_TREE` (E2).

## Tests run

- `node --test src/test/scripts/g4*.test.cjs` in the worktree: 108 tests, 108 pass, 0 fail, 0 skipped, before and after my work.
- New test file against the `2b223e5f` library: 11 of 11 fail (N4).
- Diagnostic mode, HEAD CLI versus the CLI extracted from `origin/main`, no redirect variables: 11 repositories (control, committed extra, query removed, untracked file, modified chain, assume-unchanged edit, case-alias tree, tab tree, executable file, sequence gap, zero checkpoints) times 6 argument sets (plain, `--json`, `--tsa-ca`, pinned, pinned with `--repository` and `--commit`, argument error): 66 of 66 identical in stdout, stderr and exit code. Release runs differ only for the committed extra, missing query, alias, tab and executable trees.
- Section 4 razor (TypeScript parser; function body counted as depth 1):

| File | Lines | Longest function | Nesting |
|---|---|---|---|
| `scripts/lib/g4/release-mode.cjs` | 163 | 15 (`assertEvidenceLayout`) | 3 |
| `scripts/lib/g4/git.cjs` | 64 | 10 (`git`) | 3 |
| `scripts/g4-verify-checkpoint.cjs` | 88 | 18 (`main`) | 3 |
| `src/test/scripts/g4ReleaseLayout.test.cjs` | 115 | 11 | 2 |
| `src/test/scripts/g4ReleaseLayoutPaths.test.cjs` | 160 | 12 | 2 |

  Within the limits (40 / 250 / 3).
- Documentation, sentence by sentence: the two table rows in `G4_WITNESS_OPERATIONS.md`, the "Why the Git checks matter" paragraph in `RELEASE_INTEGRATION_PATH.md` and the CLI header make no claim that my runs contradict. Check 4's shape (mode, five files, no other path) is covered by the rule, which also fixes the five names. "Ignores unused files under `tools/g4/keys/`" and "accepts an edited `tsa-chain.pem` that still verifies" are accurate. Counts (9 + 11 tests, 108 in all) are correct. Imprecisions are in N10.

## What I could not verify

- Any run on Linux or macOS: POSIX results for B1 and N1 are simulations; APFS and HFS+ aliases (normalisation, ignorable code points) were not run. My reasoning is that Git compares names with ASCII case folding only, so any other filesystem alias leaves the files untracked and the clean check blocks; I observed this on NTFS only.
- A real symbolic-link checkout (`core.symlinks=true` failed with "Permission denied").
- Whether GitHub rejects a pushed tree with duplicate entries (no network use).
- A lying `core.fsmonitor` hook: one attempt failed to hide a file.
- The author's 22-mutant list, the HMAC tags in the `.provenance` files, and `npm run test:node`.
- Linux file modes of builder-made checkpoints (code reading only).

## State left behind

- Worktree: `git status --short` is empty and HEAD is `911505874c67aff0e15303ccb715942942e97e0b`. No tracked file was written at any point; mutants ran in a separate clone. Nothing was committed, pushed or posted. No real key, TSA or network service was used. No global or system Git configuration was changed.
- This report is the only new file in the worktree (`.agent/` is git-ignored). The previous report was not modified.
- Scratch directory outside the worktree: `C:\Users\krkna\AppData\Local\Temp\g4a2` with the harness (`h.cjs`), case scripts (`r1.cjs` to `r7.cjs`, `r4b.cjs`, `syn.cjs`, `real.cjs`, `razor.cjs`), mutation runners (`mut.cjs`, `mut2.cjs`), their outputs, an extract of `origin/main`'s G4 scripts (`main/`), four `--shared` sparse clones (`mw` to `mw4`, which only read the worktree's object store) and throwaway repositories under `t/`. It can be deleted. The previous auditor's `g4aud` directory was read, not changed.

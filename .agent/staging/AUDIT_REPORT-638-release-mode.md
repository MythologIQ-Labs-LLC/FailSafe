# AUDIT REPORT: plan-v6013-638-g4-release-mode (iteration 1)

**Verdict: VETO**
**Risk grade: L3** (governance integrity; release-evidence gate)
**Findings categories:** `security-l3`, `specification-drift`, `coverage-gap`
**Judge:** independent QoreLogic Judge (native `/qor-audit`), 2026-11-10
**Candidate:** `fix/638-g4-release-mode-enforcement` HEAD `abaa5b31c53640dfcfe6840c1c02b0c7a32a9b8c`, delta against base `6022d7ef` (12 files, +388/-11)
**Plan:** `.failsafe/governance/plans/plan-v6013-638-g4-release-mode.md`, SHA-256 `6f38a060aec4173f5ac8376e212c3c1c5de1c790e720748cadb1e045fbe78712` (recomputed; equals `plan_content_hash` in `.qor/gates/2026-11-10T1844-963204/plan.json`).

Scope note: read-only on the repository. This file is the only thing written in the worktree (gitignored, `.gitignore:9 .agent/`). Nothing committed or pushed. No TPM key was created and no TSA was contacted; every run used the suite's local OpenSSL test TSA. Mutations and the full `test:node` ran in a scratch clone of `abaa5b31` outside the repository.

## Summary

The change does what it says for the ordinary cases: every listed precondition is enforced, runs before any working-tree content is trusted, fails closed, and is covered by tests that kill the corresponding mutants. Non-release behavior is unchanged.

Two things still let a command line carrying `--release` end in `PASS`, exit 0, with no limitation, when the stated release conditions are not met. Both were constructed and run, not inferred.

## Blocking findings

### B1 (security-l3, specification-drift): "clean checkout" is decided by `git status`, which does not prove the working-tree bytes equal the commit

`assertCleanCheckout` relies on `git status --porcelain`. Checkpoint and certificate files are then read from the working tree (`layout.listCheckpoints`, `readCheckpointFiles`, `certPathFor`). `git status` reports clean in three cases where those bytes differ from the committed blobs:

| Construction | `git status` | `--release` result |
|---|---|---|
| `git update-index --skip-worktree <checkpoint file>`, then replace the file | clean | **PASS OK** |
| `git update-index --assume-unchanged <checkpoint file>`, then replace the file | clean | **PASS OK** |
| No git command at all: overwrite a checkpoint file with same-size content and set its mtime back (same second) | clean | **PASS OK** (`git hash-object` of the file differs from `HEAD:` blob) |

Concrete false PASS, each run with all four release inputs correct and `HEAD == --commit`:

- Commit whose committed `timestamp.tsr` is garbage: clean tree gives `REFUSED TOKEN_INVALID`; with a valid token placed in the working tree under `--skip-worktree`: `PASS OK`.
- Commit whose committed `g4-000002/manifest.json` is `{}`: clean tree gives `REFUSED MANIFEST_MALFORMED`; with the good manifest in the working tree under `--assume-unchanged`: `PASS OK`.
- Commit whose committed token is a same-size corrupted token: clean tree `REFUSED TOKEN_INVALID`; valid token swapped in with mtime restored: `PASS OK`.

So a release PASS can be issued for a commit that does not itself carry valid G4 evidence. This is the case the plan lists under Problem ("checkpoint files that do not belong to the qualified commit") and the property the operations document now states as fact (line 135: "the checkpoint and certificate files read from the working tree are exactly the ones committed at that commit"). That sentence is false as implemented.

Bound on severity, stated honestly: substituted content must still be validly signed by the pinned key, timestamped under the committed TSA policy and match the external head, so this does not forge a chain. A fresh `git clone` is not affected. It needs write access to the verifying checkout. That is the same local-state threat the dirty-tree and `--checkpoints` refusals exist for, which is why it is in scope.

Required: in release mode, bind what the verifier reads to the commit, not to `git status`. Either read checkpoint and certificate bytes from `HEAD` blobs, or compare the content hash of every file under `tools/g4` in the working tree with its `HEAD` blob (and refuse any difference). Add tests for the three constructions above. Correct line 135 to match what is enforced.

### B2 (security-l3): `--release` can be silently consumed as the value of another flag, and a release PASS is not distinguishable from a non-release PASS

`parseArgs` takes whatever follows a value flag as its value. `... --commit --release` sets `expectedCommit = "--release"` and never sets `release`. Run:

```
g4-verify-checkpoint.cjs --repo-root <dir> --trust-fingerprint <fp> --trusted-head <id:sha> --repository <r> --commit --release
-> [g4-verify] PASS OK: 2 checkpoint(s) verified to g4-000002      exit 0, no limitation
```

The same command on a tree with an untracked file also exits 0, and its stdout is byte-identical to a genuine release PASS. This is what an empty unquoted shell variable or a PowerShell `$null` produces (`--commit $SHA --release`). With `--release` first, as in the document's example, the same mistake ends in exit 2, so the outcome depends on option order.

Underneath it: the result object (`verdict, code, detail, checkpoints, limitations`) and the text output carry no mode. A non-release run with fingerprint, head and repository given, on a dirty tree at any commit, prints exactly what a release run prints. "`--release` is the only mode that counts as release evidence" cannot be checked from the evidence.

Required: refuse a flag value that is itself an option (at minimum any value beginning with `--`), and record the mode in the result and the output (for example `release: true` in JSON and a distinct PASS line). Add tests for the swallowed flag and for the mode marker.

### B3 (specification-drift): the operations document contradicts itself

`docs/releases/G4_WITNESS_OPERATIONS.md` line 225 (Limitations, "Working tree") still says "The verifier does not itself check that the tree is clean." Line 115 and the new table say the verifier enforces it. The table itself matches the code (all seven rows, codes and verdicts checked against `release-mode.cjs`, `verify-witness.cjs` and `verify.cjs`). Fix line 225 together with line 135 (B1).

## Bypass probes (my runs, disposable repositories)

| Probe | Result | Blocking |
|---|---|---|
| Fingerprint absent / empty string | BLOCKED RELEASE_INPUT_MISSING | no |
| Fingerprint uppercase, 16-hex, trailing newline, leading space | BLOCKED RELEASE_INPUT_MALFORMED | no |
| Fingerprint wrong (64 hex) | REFUSED KEY_UNTRUSTED | no |
| Head absent / empty | BLOCKED RELEASE_INPUT_MISSING | no |
| Head uppercase, truncated, id only, trailing newline | BLOCKED RELEASE_INPUT_MALFORMED | no |
| Head wrong id or digest | REFUSED HEAD_MISMATCH | no |
| Repository absent / empty | BLOCKED RELEASE_INPUT_MISSING | no |
| Repository wrong, or different case | REFUSED REPOSITORY_MISMATCH | no |
| Repository with trailing `/` or newline | BLOCKED RELEASE_INPUT_MALFORMED | no |
| `--commit` absent / empty string | BLOCKED RELEASE_INPUT_MISSING | no |
| `--commit HEAD`, 12-hex, uppercase, trailing newline | BLOCKED RELEASE_INPUT_MALFORMED | no |
| HEAD not `--commit` (later commit; zero SHA) | REFUSED RELEASE_COMMIT_MISMATCH | no |
| Modified tracked file; staged new file; deleted tracked file | BLOCKED RELEASE_TREE_DIRTY | no |
| Modified tracked file, same size, mtime restored | **PASS** | **yes (B1)** |
| Untracked file (root or beside checkpoints); embedded git repo; extra junction `g4-000003` | BLOCKED RELEASE_TREE_DIRTY | no |
| `status.showUntrackedFiles=no` with an untracked file | BLOCKED RELEASE_TREE_DIRTY | no |
| Ignored file under `tools/g4` via `.gitignore`, `.git/info/exclude`, `core.excludesFile`, or a whole ignored `g4-000003/` | BLOCKED RELEASE_TREE_DIRTY | no |
| Ignored file outside `tools/g4`; empty untracked directory at root | PASS (by design, documented) | no |
| Empty untracked directory `g4-000003` | REFUSED CHECKPOINT_INCOMPLETE | no |
| `--tsa-ca` | BLOCKED TSA_OVERRIDE_NOT_RELEASE | no |
| `--checkpoints` (even the repository's own directory) | BLOCKED RELEASE_OVERRIDE_REFUSED | no |
| `--tsa-ca ""`, `--checkpoints ""` | PASS; the empty value is not used, policy and repository paths apply | no |
| `--assume-unchanged` / `--skip-worktree` on checkpoint files | **PASS** with substituted bytes | **yes (B1)** |
| Same flags on ledger or `tsa-policy.json` | PASS; these are read from Git objects, working-tree copy is not used | no |
| Same flags, tampered manifest | REFUSED SIGNATURE_INVALID | no |
| `tools/g4/checkpoints` or `tools/g4` replaced by a junction with identical content | PASS; git and the verifier read the same bytes through it | no |
| `g4-000002` replaced by a junction | REFUSED HEAD_MISMATCH (not listed as a directory) | no |
| Committed gitlink, submodule content modified | BLOCKED RELEASE_TREE_DIRTY | no |
| Same with `diff.ignoreSubmodules=all` | PASS | no (N2) |
| `git replace` on HEAD hiding a tampered ledger; `HEAD == --commit`, status clean | **PASS** (clean run: REFUSED PREFIX_BROKEN) | not for this delta (N1) |
| `--commit --release` (flag swallowed) | **PASS exit 0**, also on a dirty tree | **yes (B2)** |
| `--release` first vs last, all inputs | PASS both | no |
| Duplicate `--commit` | last one wins; mismatch refused | no |
| Trailing `--commit` with no value; `--release=true` | exit 2 | no |
| Non-string inputs through the API (arrays, `true`) | REFUSED or BLOCKED, never PASS | no |
| Not a git repository; repo root set to a subdirectory | BLOCKED REPO_UNREADABLE; REFUSED REGISTRY_MISSING | no |

Ordering: `assertReleasePreconditions` runs directly after HEAD resolves and before the registry, policy, checkpoints or certificates are read. A release run with a corrupt committed registry and no inputs returns RELEASE_INPUT_MISSING. Order inside is overrides, inputs, commit, tree.

## Regression and fail-open

- Non-release: dirty tree with no inputs gives PASS with the unanchored limitation; `--tsa-ca` gives PASS with the override limitation; `expectedCommit` is ignored. Unchanged from base.
- `g4FalsifyFields` N3: the changed assertion is correct. Bare `--release` was PASS at base and is now BLOCKED RELEASE_INPUT_MISSING.
- Errors: `git status` failure throws BLOCKED REPO_UNREADABLE; unexpected exceptions become BLOCKED INTERNAL_ERROR. No path from an error to PASS was found, apart from B1 and B2.

## Mutation results (scratch clone, `g4ReleaseMode` + `g4FalsifyFields`, 21 tests)

23 mutants, 19 killed, 4 survived.

Killed: drop each required input (M01 to M04); drop the missing-input throw (M05); drop the malformed throw (M06); loosen the fingerprint shape (M07) and head shape (M08); drop commit equality (M11); drop the whole clean check (M12); drop the modified/untracked scan (M13); drop the ignored scan (M14); `--untracked-files=no` (M15); drop `--tsa-ca` refusal (M16); drop `--checkpoints` refusal (M17); preconditions never run (M19); preconditions run without `--release` (M20); ignore `??` lines (M21); swap override/input order (M23).

Survived (coverage-gap, not blocking):
- M09 commit shape accepts anything, M10 repository shape accepts anything. Behaviorally covered downstream (RELEASE_COMMIT_MISMATCH, REPOSITORY_MISMATCH), but the MALFORMED code for these two inputs is untested.
- M18 `git status` failure ignored. The fail-closed branch has no test.
- M22 ignored-file scan narrowed to `tools/g4/checkpoints`. No test plants an ignored file under `tools/g4/keys`.

The plan's "nine mutants, one per precondition, each caught" holds: every one of the nine preconditions has a killed mutant.

## Commands and outcomes

Toolchain: Node v22.23.4, git 2.55.0.windows.3, OpenSSL 3.5.7.

| Command | Outcome |
|---|---|
| `node --test src/test/scripts/g4*.test.cjs` (audited worktree, OpenSSL on PATH) | 79 tests, 79 pass, 0 fail, 0 skipped |
| `G4_OPENSSL=/usr/bin/openssl node --test src/test/scripts/g4ReleaseMode.test.cjs` | 14 pass |
| `G4_OPENSSL=/nonexistent node --test src/test/scripts/g4*.test.cjs` | 79 tests, 6 pass, 73 skipped with "openssl CLI unavailable (set G4_OPENSSL); G4 falsification cannot run", 0 fail |
| New test file against the base implementation (scratch clone) | 11 fail, 3 pass, as the plan states |
| `npm run compile`, `npm run bundle`, `npm run test:node` in a scratch clone of `abaa5b31`, with `node_modules` junctioned from the sibling worktree `FailSafe-g4` (at base `6022d7ef`; the delta changes no TypeScript, `package.json` or lockfile) | compile 0, bundle 0; 1077 tests, 1056 pass, 18 skipped, 3 fail |

The three `test:node` failures, none in files this change touches:
- `ArchitectureLinks` "event loop stays responsive" (lag 104 ms): the known timing-sensitive test. 12/12 pass when run alone.
- `trustedExecutable.adversarial` T7 `resolvePrNumber`: failed under full-suite load, 9/9 pass when run alone. Timing-sensitive; not on the known list, reported separately.
- `bundleDeps` "holds chokidar 4": an artifact of my junctioned `node_modules`. esbuild wrote the real path of the sibling worktree into the bundle marker, so the `node_modules/chokidar/` prefix did not match. The bundle does contain `chokidar/esm/handler.js`.

`pythonResolution` T13(h) passed.

## Section 4 razor (scanner run on the changed files)

| File | Lines | Longest function | Max nesting |
|---|---|---|---|
| `scripts/lib/g4/release-mode.cjs` | 72 | under 25 | under 3 |
| `scripts/lib/g4/verify.cjs` | 158 | under 25 | under 3 |
| `scripts/g4-verify-checkpoint.cjs` | 76 | under 25 | under 3 |
| `src/test/scripts/g4ReleaseMode.test.cjs` | 132 | under 25 | under 3 |
| `src/test/scripts/g4FalsifyFields.test.cjs` | 74 | under 25 | under 3 |

No violation.

## Plan honesty and hygiene

- Scope: the diff is exactly what the plan lists, plus the gate files and `.qor/session/current`. No VSIX, ledger, key, policy or checkpoint change.
- Test-first: the 11-of-14 red count reproduces against the base implementation. Tests and implementation land in one commit, so the ordering cannot be confirmed from history.
- The plan claims the verifier now stops "checkpoint files that do not belong to the qualified commit". B1 shows that is not fully true.
- The plan proposes L3; the gate `plan.json` records `high_risk_target: false`. Inconsistent.
- `git ls-tree -r HEAD .qor/session` lists only `current`.

## Non-blocking items

- N1. `git replace`: with a replace ref on HEAD, a release run passes on a commit whose real ledger breaks the attested prefix. The cause is in base `git.cjs` (outside this delta) and needs a ref in the local repository; a fresh clone does not fetch `refs/replace`. Run git with `--no-replace-objects` (or `GIT_NO_REPLACE_OBJECTS=1`). Worth doing with the B1 fix.
- N2. Pass `--ignore-submodules=none` to `git status`, so repository config cannot hide a dirty submodule.
- N3. Coverage gaps M09, M10, M18, M22 above; no test for uppercase or abbreviated SHA, or `--commit HEAD`.
- N4. A non-string `trustedHead` passed through the API ends in BLOCKED INTERNAL_ERROR rather than RELEASE_INPUT_MALFORMED. Fail-closed.
- N5. `--checkpoints ""` and `--tsa-ca ""` are accepted in release mode because they have no effect. Refusing them would be tidier.

## Required for re-audit

1. B1: bind the bytes read from `tools/g4` to the `HEAD` commit in release mode; tests for skip-worktree, assume-unchanged and the same-size swap.
2. B2: refuse option-like flag values; mark release mode in the result and output; tests.
3. B3: correct lines 135 and 225 of `G4_WITNESS_OPERATIONS.md`.

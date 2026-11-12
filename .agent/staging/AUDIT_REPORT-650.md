# AUDIT REPORT: plan-v6013-636-g4-postseal-checkpoint-exception (iteration 1), draft PR #650

**Verdict: VETO**
**Risk grade:** L3
**Findings categories:** security-l3, infrastructure-mismatch, coverage-gap, specification-drift
**Auditor role:** independent Judge (native S.H.I.E.L.D. `/qor-audit`), adversarial, experiments run by the auditor
**Date:** 2026-11-10

## Target

| Item | Value |
|---|---|
| Worktree / branch | `C:\dev\mythologiq\FailSafe-650`, `fix/636-g4-postseal-checkpoint-exception` |
| Audited HEAD | `6922f7b8` (PR head `b9a1557c`; `git diff b9a1557c HEAD` = 4 plan-gate files + `.qor/session/current` only, confirmed) |
| Base | `origin/main` `6a7eced4` |
| Plan | `.failsafe/governance/plans/plan-v6013-636-g4-postseal-checkpoint-exception.md` |
| Plan hash audited | `e88952bfb6569dda2a7830e9bb62623702c46a40358975c4194c07d9e07f5458` (SHA-256 of the committed blob = LF-normalized working file; matches `.qor/gates/2026-11-10T2144-75f601/plan.json`. The CRLF working copy hashes `9d835ca9…`, an autocrlf artifact only) |
| Change | `docs/releases/RELEASE_INTEGRATION_PATH.md` (+16/-4), the plan, `.qor` gate files |

Section 4 razor: **not applicable** (documentation and gate artifacts only; no code changed).

## Method

1. `attacks.sh` (auditor scratch): 55 disposable Git repositories built with index-only commits (`update-index --cacheinfo`, `commit-tree`), so symlinks, gitlinks, case variants and Unicode names are exact tree entries. Each documented check was executed literally and reported separately:
   - `linear`: `git rev-list --merges S..H` empty (the doc states the requirement; it gives no command);
   - `cpdiff`: for each C in `S..H`, `git diff-tree --no-renames -r --name-status C^ C -- tools/g4/checkpoints`; every line must be `A`, path `tools/g4/checkpoints/g4-NNNNNN/<one of five names>`, five per directory, directory absent in `C^`;
   - `allpaths`: the same command without the pathspec; every non-checkpoint path must be on the governance list;
   - `lstree`: `git ls-tree -r H -- tools/g4/checkpoints`; every line `100644 blob`, allowed shape, five per directory;
   - `ext`: `git rev-parse H:FailSafe/extension` = S's;
   - for contrast: `netonly` (the superseded `git diff --name-only S H`), `scopedonly` (only the command the doc prints, without the "all paths" sentence), `Sanc` (`git merge-base --is-ancestor S H`, which the doc does not name).
2. `real.cjs` (auditor scratch): real signed and RFC 3161-timestamped checkpoints made with the repository's own `g4Scenario.cjs` helpers (ephemeral software test key, local OpenSSL 3.5.7 test TSA, Node 22.23.4), a release branch S → S+1 (seal record) → checkpoint commit → H, a `--no-ff` merge M, and `g4-verify-checkpoint.cjs` run through its CLI on fresh `git clone`s.
3. Code read: `scripts/g4-verify-checkpoint.cjs`, `scripts/lib/g4/{release-mode,verify,verify-ledger,checkpoint,layout,git}.cjs`, `scripts/g4-create-checkpoint.cjs`.

No TPM key was created. No TSA was contacted. The real repository was only read.

## Blocking findings

### B1. The one command the procedure prints fails open in `cmd.exe` (security-l3, infrastructure-mismatch)

`git diff-tree --no-renames -r --name-status C^ C -- tools/g4/checkpoints` is the only concrete command in the exception. In `cmd.exe`, `^` is the escape character, so the shell passes `C C` and Git diffs the commit against itself. Reproduced on the add-then-modify attack repository:

```
bash / PowerShell 5.1:  M  tools/g4/checkpoints/g4-000003/manifest.json
cmd.exe (same text):    <no output>   exit 0
cmd.exe with C~1:       M  tools/g4/checkpoints/g4-000003/manifest.json
```

Empty output is exactly what a clean post-seal commit prints. Executed literally in a standard Windows shell, on the Windows-only owner workstation, the per-commit check therefore reports every attack in classes 1 to 3 as clean (rewrite, delete, rename, type change). The `ls-tree` check does not compensate for content rewrites (it has no caret but it sees only H).

Required: write the parent as `C~1` (or quote it) and state the shell; require the operator to confirm that the checkpoint commit prints its five `A` lines, so an all-empty run cannot be read as a pass.

### B2. Nothing binds the verified checkpoint to this release's seal (coverage-gap, specification-drift)

The two `--release` runs bind HEAD to H and M. They do not bind what the head checkpoint attests. With real checkpoints:

| Case | Documented Git checks | `--release` on clean H |
|---|---|---|
| G1: seal record committed, **no** new checkpoint, previous head `g4-000002` supplied as "latest" | ALLOW | `mode: release`, `PASS OK: 2 checkpoint(s) verified to g4-000002`, exit 0 |
| G2: new five-file `g4-000003` added post-seal, but its manifest attests the **pre-seal** `main` commit (ledger without the seal entry) | ALLOW (five `A` lines, new directory, 100644) | `mode: release`, `PASS OK: 3 checkpoint(s) verified to g4-000003`, exit 0 |

So an operator who follows every documented check can merge and tag a release whose seal entry is not witnessed, holding a genuine release-mode PASS. Step 2 ("Every post-seal checkpoint must have … PASS") is vacuous when there is none, and "If G4 applies" does not say when it applies.

The wording also drifts between documents. Here S is the sealed commit and the seal record is committed *after* S (step 1), yet the exception says the checkpoint "attests a previously committed seal … commit" and is "added after S". `G4_WITNESS_OPERATIONS.md` calls the commit that *contains the seal entry* the "seal commit" and passes that to `--commit`. Read as "attest S", the checkpoint covers a ledger without the seal entry. The tasking for this audit used that reading ("the checkpoint attests S, committed at S+1"), which shows the ambiguity is live.

Required: state which commit the checkpoint must attest (the post-seal commit whose ledger contains the seal entry); require, when G4 applies, at least one new checkpoint in `S..H`; require the operator to compare the head checkpoint's `commit` (the `ok g4-NNNNNN commit …` line or `--json`) with that commit on both the H and M runs; and align the term with `G4_WITNESS_OPERATIONS.md`.

## Attack table

"Caught by" names the documented check that refused in the experiment. All rows are from `attacks.sh` unless marked (real).

| # | Attack | Result | Caught by |
|---|---|---|---|
| 1 | add in C1, modify in C2 | REFUSE | cpdiff (`M`). Net diff clean |
| 1 | add, modify, restore (net clean) | REFUSE | cpdiff. Net diff clean |
| 1 | add, delete, re-add different bytes (net shows five `A`) | REFUSE | cpdiff (`D`). Net diff clean |
| 1 | (real) trailing newline appended to committed `tsa-chain.pem` | REFUSE | cpdiff (`M`) **only**: `--release` still returns `PASS OK` |
| 2 | modify / delete pre-seal file; delete pre-seal directory | REFUSE | cpdiff (`M`/`D`), lstree for the 4-file remainder |
| 2 | rename file; rename directory to a new number | REFUSE | cpdiff (`D` + `A`, `--no-renames`) |
| 2 | delete and re-add same path in one commit | REFUSE | cpdiff (`M`) |
| 2 | type change to symlink; chmod of existing file | REFUSE | cpdiff (`T`/`M`), lstree |
| 3 | 6th file; extra file in old directory; nested subdirectory; file directly under `checkpoints/` | REFUSE | cpdiff + lstree |
| 3 | symlink (120000) or gitlink (160000) carrying an allowed name | REFUSE | **lstree only** (name-status shows a normal `A`) |
| 3 | gitlink as the directory; executable (100755) | REFUSE | lstree (cpdiff also for the directory gitlink) |
| 3 | 100755 in C1, chmod back in C2 | REFUSE | cpdiff (`M`) |
| 3 | `checkpoint-3`, 7 digits, `G4-000003`, `G4-000002` alias, full-width digit, Cyrillic `а` in a file name | REFUSE | cpdiff + lstree (Git quotes non-ASCII; see N4) |
| 3 | `Tools/G4/Checkpoints/...` (case-variant parent, outside the pathspec) | REFUSE | allpaths only (not a governance path) |
| 3 | 4-file directory; five files split 3 + 2 | REFUSE | cpdiff (and lstree for 4 files). (real) the verifier itself passes with `timestamp.tsq` deleted and with extra paths present |
| 3 | non-sequential `g4-000009` | Git checks ALLOW | (real) `--release`: `REFUSED CHECKPOINT_GAP` |
| 3 | reused number | REFUSE | impossible without `D`/`M` on the existing path (cpdiff) |
| 4 | `tools/g4/keys/**` (add; add then remove), TSA root, `tsa-policy.json`, `revocations.json`, `sign-checkpoint.ps1`, `.gitattributes`, `.gitignore`, `.github/workflows/**` | REFUSE | **allpaths only**. The printed scoped command shows nothing (N1) |
| 4 | G4 script under `FailSafe/extension/**` | REFUSE | allpaths + ext |
| 4 | product change then revert | REFUSE | allpaths only (ext and net are clean) |
| 4 | `tools/g4` or `tools/g4/checkpoints` replaced by a symlink | REFUSE | allpaths / cpdiff / lstree |
| 4 | `.gitattributes` inside a governance directory | ALLOW | permitted by the #929 `**` globs; cannot reach `tools/g4` (N5) |
| 5 | merge between S and H (evil, governance-only, merge of moved `main`) | REFUSE | linear (requirement stated, command not given: N2) |
| 5 | S rewritten, product commit; rebase onto moved `main` | REFUSE | allpaths (ext also for the rebase) |
| 5 | S rewritten, S a governance-only commit | **ALLOW by every concrete check** | only the unnamed `merge-base --is-ancestor S H` fails (N2) |
| 5 | H is a root commit | REFUSE | `C^` errors |
| 6 | diagnostic PASS offered as release evidence | Not substitutable | (real) without `--release`: `mode: diagnostic (NOT release evidence)`, exit 0 even with all four inputs. `mode: release` is printed only when `o.release` is set. Missing input: `BLOCKED RELEASE_INPUT_MISSING`; `--tsa-ca`: `BLOCKED`; dirty: `BLOCKED RELEASE_TREE_DIRTY`; stale head: `REFUSED HEAD_MISMATCH`. A release PASS cannot carry a limitation (both limitation sources are blocked first). The doc never names exit code as sufficient |
| 7 | genuine checkpoint | ALLOW | (real) `createCheckpoint` leaves exactly five untracked files, no staging residue; `diff-tree` shows exactly five `A`; `ls-tree` 100644; ext equal; `--release` on clean H: `PASS OK` |
| 8 | H versus M | Correct | (real) `M^{tree}` = `H^{tree}`; `--release --commit M` on clean M: `PASS OK`; `--commit H` on M and `--commit M` on H: `REFUSED RELEASE_COMMIT_MISMATCH`. Both runs are required (step 4, exception bullets 4 and 5) with retained pins. Trusted head "recorded at creation, before any … Release body" agrees with ops step 4 |
| 8 | checkpoint not tied to the seal | **NOT caught** | B2 |
| 10 | session key hygiene | Clean | `git ls-tree -r HEAD .qor/session` = `.qor/session/current` only |

## Non-blocking items

- **N1.** The only printed command is path-scoped. "Apply the same name-status check to all paths" plus step 2 is sufficient if read as intended, but 13 attack variants pass when only the printed command is run. Print the unscoped command.
- **N2.** No command for linearity or ancestry. Add `git merge-base --is-ancestor S H` and `git rev-list --merges S..H` (empty). The amended-S case gains nothing beyond what governance paths already allow, but the seal would cite an orphaned S.
- **N3.** Plan acceptance items 1, 2 and 4 are criteria, not evidence. The only evidence is this audit's experiments; there is no retained fixture. The doc says honestly that nothing is CI-enforced.
- **N4.** Look-alike names are caught because Git quotes non-ASCII paths by default (`core.quotePath` unset here). Say so, or give an exact pattern.
- **N5.** Symlinks, gitlinks and executables are still admissible *inside governance paths* (#929 scope; the mode rule covers checkpoints only).
- **N6.** The verifier does not notice extra paths, a missing `timestamp.tsq` or a whitespace edit to `tsa-chain.pem`. The Git checks are therefore the sole control for those; a future executable preflight should cover them.
- **N7.** `git show <sha>:<path>` in `git.cjs` fails with "Filename too long" when the clone path is deep (about 150+ characters); release mode then returns `REFUSED RELEASE_TREE_MISMATCH … not readable`. Fail-closed, verifier scope, observed on the auditor's first run.
- **N8.** The Status line and the "Acceptance test" section (PR #640) predate the exception. Say that the #640 result does not cover the G4 steps.
- **N9.** `G4_WITNESS_OPERATIONS.md` recovery (move the chain to `tools/g4/archive/`), revocation and root changes are all refused post-seal by this rule. That is consistent, but worth one sentence: they belong before S.

## Consistency

- PASS #929 rules are kept: merge-commit only, `--match-head-commit`, tree and subtree equality, rule-suite `result=pass`, cited decision files re-checked at H, residual risks unchanged. The per-commit rule is stricter than the net diff it replaces (three class 1 attacks pass the net diff).
- Scope statements are honest: operator checks only, no key, TSA, policy or checkpoint authorized; `tools/g4` on this branch holds no checkpoint and `tsa-policy.json` is unselected.

## Commands relied on

```
git diff --stat origin/main HEAD ; git diff --stat b9a1557c HEAD
git show HEAD:<plan> | sha256sum
git ls-tree -r HEAD .qor/session
bash attacks.sh            # 55 repositories; documented checks as listed under Method
node real.cjs              # Node 22.23.4, OpenSSL 3.5.7, g4Scenario.cjs helpers, CLI on fresh clones
cmd.exe /c "git diff-tree --no-renames -r --name-status <C>^ <C> -- tools/g4/checkpoints"
powershell -NoProfile -Command "git diff-tree … <C>^ <C> …"
```

Scratch scripts and raw output (session-scoped, not committed):
`C:\Users\krkna\AppData\Local\Temp\claude\6405f61d9b064ac4\b5cba55a-fbfb-453a-9069-0bb3c44a8e39\scratchpad\gitlab\{attacks.sh,results.txt,real.cjs,real.out,cmdtest.bat}`

## Remediation required for PASS

1. B1: caret-free, shell-safe parent syntax, and a positive expectation for the checkpoint commit's output.
2. B2: name the commit a checkpoint must attest, require a new checkpoint in `S..H` when G4 applies, and require the attested-commit comparison on H and M; align terms with `G4_WITNESS_OPERATIONS.md`.
3. Recommended in the same iteration: N1, N2, N8.

# Plan: v6.0.13 G4 release-mode enforcement (#638, audit #931 N-b and N5)

**iteration**: 2 (after VETO #933)
**change_class**: feature (release-governance tooling; not packaged in the VSIX)
**risk_grade (proposed)**: L3
**pr_target**: `feat/638-g4-witness-v6013-r2` (PR #644), so the audited #644 source stays frozen; it reaches `main` after #644.
**base**: `6022d7ef0bf125917cba2a669830eb3dbaede492` (PR #644 head)
**Ordering:** written test-first. The tests in `g4ReleaseMode.test.cjs` were run red (11 of 14 failing) before the implementation existed.

## Problem

`g4-verify-checkpoint.cjs --release` refused only the `--tsa-ca` override. A release verification could still PASS:
- with no pinned owner fingerprint, so any committed key could start a chain;
- with no externally retained checkpoint head, so truncation or re-genesis went unseen;
- with no repository identity;
- on a dirty checkout, or with checkpoint files that do not belong to the qualified commit;
- with `--checkpoints` pointing somewhere else.

The operations document required these conditions, but the code did not enforce them (audit #931 N-b, N5).

## Change

- New `FailSafe/extension/scripts/lib/g4/release-mode.cjs`, `assertReleasePreconditions(o, repoRoot, head)`, called from `verify.cjs` `buildContext` once HEAD is resolved. With `--release`:
  - `--trust-fingerprint`, `--trusted-head`, `--repository` and the new `--commit` are all required (`BLOCKED RELEASE_INPUT_MISSING`) and must be well formed (`BLOCKED RELEASE_INPUT_MALFORMED`);
  - HEAD must equal `--commit` (`REFUSED RELEASE_COMMIT_MISMATCH`);
  - the checkout must be clean: no modified or untracked file anywhere, and no git-ignored file under `tools/g4/` (`BLOCKED RELEASE_TREE_DIRTY`);
  - `--tsa-ca` (`BLOCKED TSA_OVERRIDE_NOT_RELEASE`, moved here unchanged) and `--checkpoints` (`BLOCKED RELEASE_OVERRIDE_REFUSED`) are refused.
- The CLI gains `--commit`. Non-release behavior is unchanged.
- `G4_WITNESS_OPERATIONS.md` documents the enforced conditions.

Invalid, revoked, expired, replayed or historically inconsistent witness evidence was already refused in every mode (audits #930/#931) and is not changed here.

## Acceptance

- `g4ReleaseMode.test.cjs` (14 tests): a control PASS with every input on a clean exact checkout and no limitation; each missing input; malformed inputs; a wrong fingerprint, head or repository; a later commit; a modified tracked file; an untracked file beside the checkpoints; an ignored file under `tools/g4`; both overrides; non-release unchanged; the CLI exit codes.
- Mutation check: nine mutants, one per precondition, each makes at least one test fail.
- All G4 suites pass (79), and they skip with a stated reason when OpenSSL is absent.

## Iteration 2 (VETO #933 remediation)

The independent audit found two constructions that still ended in a release PASS, and one stale doc line.

- **B1.** "Clean" was decided by `git status`, but checkpoints and certificates are read from the checkout. `update-index --skip-worktree`, `--assume-unchanged`, or a same-size swap with the mtime restored let different bytes through. Fix: in release mode every file under `tools/g4/checkpoints/` and `tools/g4/keys/` is compared byte for byte with its blob at HEAD (`REFUSED RELEASE_TREE_MISMATCH`). The binding covers exactly the files the verifier reads from the checkout; everything else it reads comes from Git objects.
- **B2.** `--commit --release` swallowed the flag as a value, giving a diagnostic PASS that looked like a release PASS. Fix: a value that is missing or starts with `--` is an argument error (exit 2), and every result and the CLI output carry the mode (`release`, or `diagnostic (NOT release evidence)`).
- **B3.** The stale operations-doc line is corrected, and the condition table gains the new row.
- **Non-blocking, done:** Git is run with `--no-replace-objects`, so a replace ref cannot hide a tampered ledger; `git status` uses `--ignore-submodules=none`; tests added for malformed commit and repository inputs and for an ignored file under `tools/g4` outside the checkpoints.
- **Non-blocking, not done:** a test for a failing `git status` (no practical way to induce it; the code blocks on a non-zero exit). The gate's `high_risk_target: false` is the schema's EU AI Act classification, not the plan's L3 risk grade.

Tests were again written first (`g4ReleaseBinding.test.cjs`, 9 tests, 7 red before the fix). All G4 suites: 88/88. Nine further mutants, one per new check, are each caught.

## Not changed

No key, TSA, policy or checkpoint is created. Implementation PASS is not operational G4 qualification: on this repository the verifier still reports `BLOCKED` until the owner decisions are made.

# Audit Report: G4 token-time validation, notices and key transitions (#638), iteration 4

- **Procedure:** native `/qor-audit` (Gate Tribunal), independent adversarial auditor.
- **Target commit:** `7cfe447f51794725ce9d70f27dcb19f9d17c1648` on `feat/638-g4-token-time-transitions` (draft PR #658), stacked on `origin/feat/638-g4-freetsa-root` = `2c7a58af`.
- **Reviewed diffs:** `git diff origin/feat/638-g4-freetsa-root 7cfe447f` (whole PR) and `git diff 95069d83 7cfe447f` (since iteration 3: `git.cjs` assertCompleteHistory, `crl-archive.cjs` explicit log flags, `verify.cjs` call site, 3 new tests, ops doc paragraph, plan iteration-4 section, ledger #959-#961).
- **Plan:** `.failsafe/governance/plans/plan-v6013-638-g4-token-time-transitions.md`, iteration 4. Risk grade L3.
- **Date:** 2026-11-12.

## Verdict: VETO

Two blocking violations. Both are the iteration-3 V7 class (the verifier reads a history or object database that a local `.git` can falsify while HEAD keeps its SHA). Both give `PASS` in **release mode** for a repository whose canonical history and content are `REFUSED`. Both survive a plain local `git clone` of the tampered repository. The ops doc recommends that clone and says complete history is "required and enforced".

All earlier fixes (V1 to V6, iteration-1 N1 and N2) hold under re-attack. Iteration-3 note N1 (local `log.*` settings) is closed.

## Checks

All attack scripts ran from a scratch directory (`...\scratchpad\a4\t1.cjs` to `t8.cjs`). They used the repository's own test helpers (`g4Scenario.cjs`, `g4TestPki.cjs`) against throwaway repositories under `%TEMP%\g4-falsify-*`. No network was used. The worktree was not modified except for this report.

### 1. Iteration-3 V7 (shallow and grafted history)

Scenario for every case: a base with two checkpoints, then a commit that adds a CRL revoking the TSA signer for keyCompromise, a commit that deletes it, and further commits. The canonical repository gives `REFUSED TSA_CRL_HISTORY`.

| Case | Result |
| --- | --- |
| `clone --depth 1`, `--depth 2` | BLOCKED REPO_INCOMPLETE_HISTORY |
| `--depth 1`, then `fetch --deepen 2` | BLOCKED REPO_INCOMPLETE_HISTORY |
| then `fetch --unshallow` | REFUSED TSA_CRL_HISTORY (correct) |
| `--shallow-since 2000-01-01` (whole history inside the window, so not shallow) | REFUSED TSA_CRL_HISTORY |
| `--shallow-exclude` | not exercised (my clone argument named a non-ref; the clone failed). Covered by the `is-shallow-repository` check in code. |
| empty planted `.git/shallow` | BLOCKED |
| `git worktree add` of a shallow clone | BLOCKED. `--git-path shallow` resolves to the common dir. |
| worktree of a full clone, grafts planted in the common `info/grafts` | BLOCKED |
| shallow/grafts planted in the per-worktree git dir | Git ignores both: full history, REFUSED TSA_CRL_HISTORY (correct) |
| `clone --filter=blob:none`, `--filter=tree:0` (lazy fetch from the `file://` origin) | REFUSED TSA_CRL_HISTORY |
| `clone --shared`, `clone --reference` (alternates) | REFUSED TSA_CRL_HISTORY |
| `git replace --graft HEAD <pre-CRL commit>` | REFUSED TSA_CRL_HISTORY (`--no-replace-objects` holds) |
| **forged `objects/info/commit-graph`** (HEAD's parent pointer moved to the pre-CRL commit) | **PASS OK, also in release mode: V8** |
| **substituted loose object** (blob id of the revoking CRL, bytes of the old non-revoking CRL) | **PASS OK, also in release mode: V9** |

**Iteration-3 note N1 (local log config).** Script `t6.cjs`: an `-s ours` merge that drops a revoking CRL, re-verified with each of these set locally: `log.follow=true`, `log.showRoot=false`, `log.diffMerges=off` / `first-parent`, `diff.renames=copies`, `log.showSignature=true`, `core.quotePath=false`, `log.mailmap=true`, `diff.noprefix=true`, `diff.relative=true`, `core.ignoreCase=true`. Every case gives REFUSED TSA_CRL_HISTORY. **N1 is closed.**

### 2. Earlier fixes, re-attacked

- **V1 (CRL files cannot add anchors).** Script `t5.cjs`. A CRL with a root certificate appended, two CRL blocks, and a foreign root certificate named `.crl` each give REFUSED TSA_CRL_MALFORMED ("exactly one PEM CRL"). Certificate base64 inside CRL armour gives TSA_CRL_MALFORMED ("does not parse"). A CRL file named `.pem` gives TSA_CRL_MALFORMED. A CRL from a foreign CA gives REFUSED TSA_CRL_UNTRUSTED. **Holds.** Only OpenSSL's canonical re-encoding reaches the trust file (code read).
- **V5 (RFC 3161 section 4 reasons).** The signer was revoked after the tokens, then a later CRL was committed:

  | Reason | Result |
  | --- | --- |
  | superseded, cessationOfOperation, affiliationChanged, unspecified | PASS (correct) |
  | certificateHold, removeFromCRL | REFUSED TSA_SIGNER_REVOKED |
  | keyCompromise, CACompromise, no reasonCode | REFUSED (suite) |

  The OpenSSL reason strings were checked against `KEEPS_EARLIER`. **Holds.**
- **V6 (append-only through merges).** An `-s ours` merge under hostile local config is refused (above). The suite cases for octopus, resolution and add-then-remove pass. **Holds.**
- **V2, V3, N1 (recovery notice-token time), N2 (manifest-digest binding).** Confirmed by reading `transition.cjs`: `checkBinding` checks `afterCheckpointManifestSha256`; the certificate window is applied at the transition token time; `checkRecovery` checks `ctx.noticeWitnessed` against the record's token time. `crl-archive.cjs` consults every archived CRL from the issuing root. The suite tests pass. **Hold.**

### 3. Newly weakened or bypassed; accuracy of disclosed limits

- Nothing on `main` is weakened. `assertCompleteHistory` adds checks only.
- The new protection is narrower than its documentation claims (V8, V9).
- `docs/releases/G4_WITNESS_OPERATIONS.md` line 195 says "Complete history is required and enforced". Line 145 says "Run it from a fresh `git clone` or `git worktree add`". Script `t3.cjs` shows that a plain local `git clone <path>` of a repository with a forged commit-graph copies `objects/info/commit-graph`, and that clone still verifies PASS. Script `t8.cjs` shows the same for a substituted loose object.

### 4. Tests (from `FailSafe/extension`)

- `node --test src/test/scripts/g4*.test.cjs`: 157 tests, 157 pass, 0 fail (exit 0).
- `node --test src/test/docs/*.test.cjs`: 145 pass, 0 fail (exit 0).
- The full `npm run test:node` was not run (optional).

### 5. Section 4 razor and overstatement

- **Razor.** The largest file is `release-mode.cjs` at 163 lines; new or changed files are at most 140. No function exceeds 40 lines (scan of the PR's lib, CLI and test files). Nesting within a function is at most 3. There are no nested ternaries. **OK.**
- **Overstatement.**
  - In the ops doc, "enforced" and "fresh git clone" overstate the guarantee (V9).
  - The plan's iteration-4 section ("This also protects the existing revocation-registry history check") is true only for shallow and grafts; commit-graph and object substitution hide registry history in the same way.
  - The evidence README makes no claim about history completeness.
- **Security, Ghost UI, dependency, orphan and macro passes.**
  - There is no placeholder auth, no hardcoded secret, no UI and no new dependency.
  - `assertCompleteHistory` is reached from `verify.cjs` `buildContext`. It has no cycle.

### 6. Ledger

- `git diff origin/feat/638-g4-freetsa-root 7cfe447f -- docs/META_LEDGER.md` has one hunk at `@@ -36511,3 +36511,63 @@` with 0 removed lines. It adds only Entries #959, #960 and #961, and the appended text is ASCII.
- `python -I -m qor.cli verify-ledger --post-anchor` printed `post-anchor clean (boundary=#382)`, after the two disclosed pre-anchor breaks (#340, #382).
- Per the brief, this auditor made no ledger, SHADOW_GENOME or gate edits. The caller records the verdict.

## Violations

### V8 (blocking, L3): a forged commit-graph hides CRL history; release-mode PASS

- **Reproduction (`t2.cjs`).**
  1. Full clone. Run `git commit-graph write --reachable`.
  2. In the CDAT chunk, change HEAD's parent position to the commit before the revoking CRL was added. The file's checksum is left stale; Git does not check it on load.
  3. HEAD's SHA is unchanged. `rev-list --count` gives 5 instead of 7.
- **Result.**
  - The verifier returns `PASS OK 2 checkpoint(s) verified to g4-000002`, in diagnostic mode and in `release: true` with every release input and `expectedCommit` = HEAD. There are no limitations.
  - The canonical repository is `REFUSED TSA_CRL_HISTORY`.
  - `git commit-graph verify` and `git fsck` both detect the forgery: "commit-graph parent for ... is ... != ...".
  - A plain local `git clone` of the tampered repository copies the graph and still PASSes (`t3.cjs`).
- **Why blocking.** This is exactly the V7 effect ("hides commits while HEAD keeps its SHA"), through the one sibling the brief named (`core.commitGraph`). The same hiding applies to `commitsTouching` (the revocation registry and notices). The ops doc calls complete history "enforced".
- **Remediation.** Run every verifier Git call with commit-graph use disabled (`-c core.commitGraph=false` in `git.cjs` `git()`), or refuse to verify unless `git commit-graph verify` / `git fsck` passes. Add a falsification test with a forged graph, a planted-defect check, and a local re-clone case.

### V9 (blocking, L3, disclosure): the local object database is trusted without integrity checking; the documented "fresh clone" does not remove that trust

- **Reproduction (`t4.cjs`).**
  1. Clone with `--no-local` and unpack the packs into loose objects.
  2. Overwrite the loose object of the revoking `later.crl` blob (same object id) with the bytes of the old, validly signed, non-revoking CRL.
- **Result.**
  - `git cat-file blob` returns the substituted bytes.
  - The verifier returns `PASS OK`, also in release mode. The canonical result is `REFUSED TSA_SIGNER_REVOKED`.
  - A plain local `git clone` of that repository still PASSes (`t8.cjs`).
  - `git fsck --full` reports "hash-path mismatch" (exit 3).
- **Why blocking.** The iteration-4 change makes planted `.git` state part of the threat model by blocking `.git/shallow` and `.git/info/grafts`. The ops doc then states that complete history is "enforced" and that a fresh `git clone` or `git worktree add` is a sufficient basis. Neither holds when the local object store is tampered. That is an inaccurate disclosed limit on a release-verification path. The same substitution can rewrite any blob the verifier reads from Git: the registry, the TSA policy, the roots, notice tokens and transition records.
- **Remediation.** Either:
  - make the verifier check object integrity before it reads anything, for example `git fsck --full --strict` (or `--connectivity-only` plus `commit-graph verify`, if that is judged sufficient), returning BLOCKED on failure; or
  - state the trust assumption precisely in the ops doc and the plan: the verifier trusts the local object database; a release verification must run on a clone made with object verification (a network fetch, or `git clone --no-local`) from the canonical remote, never on a local path clone or a worktree of an untrusted repository; and "enforced" covers only shallow and grafts.

  Then test whichever choice is made.

## Notes (non-blocking)

- **N1.** The registry history (`commitsTouching`) still uses default history simplification, without `--full-history` or `-m`. This is pre-existing on main and disclosed in the ops doc (see the iteration-2 report). It is unchanged.
- **N2.** A combination of hostile local settings (all of the `t5.cjs` set together) produced `REFUSED REGISTRY_MISSING "has no committed history"`. This fails closed but gives a misleading reason. Each setting alone is handled.
- **N3.** The partial-clone cases passed because Git lazily fetched from the local `file://` origin. Offline lazy-fetch failure was not exercised; by code reading, a missing blob gives a refusal or `BLOCKED INTERNAL_ERROR`, never a PASS. `readTransition` returning null leads to `KEY_RESET`; `showBlob` returning null leads to `REVOCATION_UNSTAMPED` or `KEY_TRANSITION_INVALID`.
- **N4.** `RELEASE_INTEGRATION_PATH.md` line 94 ("The verifier does not see history") is about checkpoints. It now sits beside verifier checks that do read CRL and registry history; its scope could be misread.
- **N5.** Iteration-3 notes N2 to N4 (one entry per serial; the iteration-2 notes; the TSA accuracy field) are unchanged and were not re-litigated.
- **N6.** A CRL in a subdirectory of `tools/g4/tsa-crls/` is accepted when it is valid. This is consistent with the recursive `ls-tree` and is not a defect.

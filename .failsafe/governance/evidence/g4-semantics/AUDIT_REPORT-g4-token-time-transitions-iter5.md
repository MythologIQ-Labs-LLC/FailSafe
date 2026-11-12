# Audit Report: G4 token-time validation, timestamped notices, key transitions (iteration 5)

- **Target commit:** `4bb2c324bd504f679f2d387914c7b5c322ff7664`, branch `feat/638-g4-token-time-transitions`, draft PR #658, stacked on `origin/feat/638-g4-freetsa-root` (`2c7a58af`, PASS ledger #958).
- **Plan:** `.failsafe/governance/plans/plan-v6013-638-g4-token-time-transitions.md`, iteration 5 (all Iteration sections read).
- **Diffs reviewed:** `git diff origin/feat/638-g4-freetsa-root 4bb2c324` (146 files) and `git diff 7cfe447f 4bb2c324` (15 files; code change only in `scripts/lib/g4/git.cjs`, new test `g4RepoIntegrity.test.cjs`, ops doc section on repository trust).
- **Risk grade:** L3.
- **Auditor:** independent, fresh context, 2026-11-12. Git 2.55.0.windows.3, Node 24.19.0.
- **Threat model applied (from the ops doc):** verification on a full clone fetched from the canonical remote, on a machine the verifier controls, trusting the local Git and OpenSSL binaries and SHA-1 ids.

## VERDICT: PASS

No blocking violation found. Iteration-4 V8 and V9 are closed, the earlier fixes hold on spot-check, nothing is weakened relative to `main`, and the disclosed trust statement matches what the code enforces. Two non-blocking notes follow.

All probes were scratch scripts outside the worktree (`attack.cjs`, `attack2.cjs` in the session scratchpad), building disposable repositories with the suite's own `g4Scenario.cjs` helpers. Base fixture for each probe: two good checkpoints, then a commit adding `tools/g4/tsa-crls/later.crl` that revokes the TSA signer for keyCompromise. Expected honest result: `REFUSED TSA_SIGNER_REVOKED`.

## 1. Iteration-4 V8 (commit-graph never trusted) and V9 (fsck --full required)

Code read: `git.cjs` `git()` now runs every call as `git --no-replace-objects -c core.commitGraph=false -C <repo> ...`, and `assertCompleteHistory` runs `git fsck --full --no-dangling --no-progress` and returns `BLOCKED REPO_INTEGRITY` on any non-zero exit. `assertCompleteHistory` is called from `verify.cjs` `buildContext` before `assertReleasePreconditions`, the registry history check and the CRL archive load.

| Probe | Result |
| --- | --- |
| Control, base and plain full clone | REFUSED TSA_SIGNER_REVOKED |
| Forged commit-graph (HEAD's parent rewired past the add and delete of the revoking CRL), no env | REFUSED TSA_CRL_HISTORY (graph ignored) |
| Same, with `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.commitGraph GIT_CONFIG_VALUE_0=true` | REFUSED TSA_CRL_HISTORY; `git -c core.commitGraph=false config core.commitGraph` reports `false` |
| Same, with `GIT_CONFIG_PARAMETERS='core.commitgraph'='true'` | REFUSED TSA_CRL_HISTORY; effective value `false` |
| Same, with repo-config `includeIf.gitdir:**.path` to a file setting `core.commitGraph=true` | REFUSED TSA_CRL_HISTORY |
| Split commit-graph chain present | REFUSED TSA_CRL_HISTORY |
| Loose substitution (revoking CRL id, bytes of older CRL; `cat-file` confirmed to return the older bytes) plus repo `fsck.skipList` naming that id | BLOCKED REPO_INTEGRITY ("hash-path mismatch") |
| Loose substitution plus 55 demotable `fsck.<msg-id>=ignore` settings (non-demotable ids rejected by Git as "Cannot demote") | raw `git fsck` exit 3; verifier BLOCKED REPO_INTEGRITY |
| Packed substitution: hand-built pack holding the older CRL bytes, v2 `.idx` naming it with the revoking id, valid pack and idx checksums, loose copy removed; `cat-file` confirmed to return the older bytes | BLOCKED REPO_INTEGRITY ("packed ... is corrupt") |
| Multi-pack-index forgery: OOFF offset of the revoking id pointed at the older blob, MIDX trailer recomputed; substitution confirmed effective for `cat-file` | BLOCKED REPO_INTEGRITY ("incorrect object offset for oid") |
| Corrupted pack `.idx` (one byte flipped) | BLOCKED REPO_INTEGRITY ("Packfile index ... hash mismatch") |
| `repoRoot` is a linked worktree; substitution in the common object store | BLOCKED REPO_INTEGRITY (fsck runs against the common dir) |
| `repoRoot` is a linked worktree; `.git/shallow` planted in the common dir | BLOCKED REPO_INCOMPLETE_HISTORY (`--git-path shallow` resolves to the common dir) |

`fetch.fsckObjects` and `receive.fsck.*` do not affect a local `git fsck` run and are not used by the verifier. Every verifier Git call (`rev-parse`, `cat-file`, `log`, `ls-tree`, `merge-base`, `fsck`, `status`) was checked; none is redirected by the stripped `GIT_DIR`-style variables, and `-c` on the command line wins over env and repository config. **V8 and V9 are closed.** Planting `-c core.commitGraph=false` out would still be caught by fsck (which verifies an enabled commit-graph), so the forged-graph test would then fail with REPO_INTEGRITY instead of TSA_CRL_HISTORY; both layers fail closed.

Real repository: `node scripts/g4-verify-checkpoint.cjs --json` from `FailSafe/extension` returns `BLOCKED NO_CHECKPOINTS` in 4.98 s, so fsck passes on the canonical history (consistent with the plan's 4.5 s).

## 2. Earlier fixes (spot-check)

- **V1.** Code read of `crl-archive.cjs` `loadOne`: one PEM CRL per file and nothing else, re-encoded by `openssl crl`, must verify against one pinned root; only the canonical re-encoding reaches the trust file. Suite tests pass. Holds.
- **V5.** `KEEPS_EARLIER` is exactly Unspecified, Affiliation Changed, Superseded, Cessation Of Operation; a hit with any other reason, or none, refuses regardless of date. Reproduced: keyCompromise revocation after the tokens gives REFUSED TSA_SIGNER_REVOKED for g4-000001. Holds.
- **V6.** `crlLog` keeps `--diff-merges=separate --root --full-history --no-renames`, and the blob-presence check is unchanged. Suite merge tests pass; the forged-graph probes above return TSA_CRL_HISTORY through this path. Holds.
- **V7.** `--is-shallow-repository`, `.git/shallow` and `.git/info/grafts` checks unchanged and still ahead of fsck; worktree common-dir case above is BLOCKED. Holds.
- V2, V3, V4, N1, N2: suites `g4KeyTransition`, `g4CrlArchive`, `g4TokenTime` pass unchanged; no code in those paths changed since iteration 4.

## 3. Weakening, bypass, disclosed limits

- Relative to `main`: the change only adds refusals (fsck BLOCKED, commit-graph disabled). A repository with no transitions or notices verifies exactly as before when its objects are sound. Nothing weakened.
- The ops doc (lines 195 to 202) now says what is enforced (complete history, genuine objects via `git fsck --full`, no replace refs or commit-graph, env redirects removed) and what is trusted (Git and OpenSSL binaries, SHA-1 ids, a full clone from the canonical remote on a controlled machine). This matches the code. The force-push limit (checkpoints do not bind the CRL set) remains disclosed.

## 4. Tests

- `node --test src/test/scripts/g4*.test.cjs` (from `FailSafe/extension`): tests 159, pass 159, fail 0, exit 0 (106 s).
- `node --test src/test/docs/*.test.cjs`: tests 145, pass 145, fail 0, exit 0.
- Full `npm run test:node` not run (optional).

## 5. Razor and overstatement

| Check | Limit | Found | Status |
| --- | --- | --- | --- |
| Max function lines | 40 | `assertCompleteHistory` about 20; no changed function over 40 | OK |
| Max file lines | 250 | `git.cjs` 98, `g4RepoIntegrity.test.cjs` 77; largest lib file `release-mode.cjs` 163 | OK |
| Max nesting depth | 3 | 2 | OK |
| Nested ternaries | 0 | 0 | OK |

- Security pass: no placeholder auth, no hardcoded secret, no disabled check. Ghost UI: none (no UI). Dependencies: none added. Orphans: `assertCompleteHistory` reached from `verify.cjs`; test file is picked up by the `g4*.test.cjs` glob. Macro: no cycle, Git access stays centralised in `git.cjs`.
- Plan iteration 5 and the ops doc: claims checked above are accurate. The evidence README is unchanged since iteration 4 and makes no claim about repository integrity.

## 6. Ledger

- `git diff origin/feat/638-g4-freetsa-root 4bb2c324 -- docs/META_LEDGER.md`: one hunk `@@ -36511,3 +36511,83 @@`, 0 removed lines, adds only Entries #959, #960, #961, #962.
- `python -I -m qor.cli verify-ledger --post-anchor` (run in the worktree): `post-anchor clean (boundary=#382)`, after the disclosed pre-anchor residuals (#340, #382 breaks).
- Per the brief, no ledger, SHADOW_GENOME or gate files were edited by this auditor.

## Violations

None.

## Notes (non-blocking)

- **N1. Repository config can make the verifier run a command; fsck widens this to diagnostic mode.** With `core.fsmonitor` set in the repository's `.git/config` to a script, the script ran during a diagnostic verification. Isolated per command: `git fsck --full` and `git status` run it; `rev-parse`, `cat-file`, `log`, `ls-tree`, `merge-base` do not. On `main`, only release mode (via `git status`) reached it; the new fsck call makes diagnostic mode reach it too. Other config-driven executables (for example `gpg.program` if `log.showSignature` were set) are of the same kind. This is outside the stated model: a fresh clone from the canonical remote has Git-written config, and the ops doc says "A local copy of someone else's `.git` is no substitute." It is a consequence of using an unsupported repository rather than an acceptance of bad evidence, so it is not a VETO. A cheap hardening is `-c core.fsmonitor=false` in `git()` (and one sentence in the ops doc that verifying a foreign `.git` can execute its configured commands).
- **N2. Ops doc wording.** Line 145 says "Run it from a fresh `git clone` or `git worktree add` of the release commit"; line 200 says a full clone from the canonical remote. They are compatible only if the worktree is added from such a clone; line 145 could say so. Integrity is enforced either way (fsck on the common dir, shown above).

## Scratch artefacts

Probe scripts and outputs: `C:\Users\krkna\AppData\Local\Temp\claude\6405f61d9b064ac4\b5cba55a-fbfb-453a-9069-0bb3c44a8e39\scratchpad\iter5\` (`attack.cjs`, `attack2.cjs`, `attack-out.txt`, `g4tests.txt`, `doctests.txt`). Disposable repositories created by the probes were removed. The worktree was left as found apart from this report.

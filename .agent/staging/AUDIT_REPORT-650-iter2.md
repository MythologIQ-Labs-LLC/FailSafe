# AUDIT REPORT: plan-v6013-636-g4-postseal-checkpoint-exception (iteration 2), draft PR #650

**Verdict: PASS**
**Risk grade:** L3
**Findings categories:** none
**Auditor role:** independent Judge (native S.H.I.E.L.D. `/qor-audit`), adversarial, experiments re-run by the auditor from the new text
**Date:** 2026-11-10
**Supersedes for this iteration:** VETO #936 (`.agent/staging/AUDIT_REPORT-650.md`, sha256 `fddeb1a6…28c3`, confirmed committed verbatim at HEAD)

## Target

| Item | Value |
|---|---|
| Worktree / branch | `C:\dev\mythologiq\FailSafe-650`, `fix/636-g4-postseal-checkpoint-exception` |
| Audited HEAD | `4dae836468dc18fc52ca696251f7344f96216941` |
| Plan hash audited | `a085bed5608229a4943a92ba1030b5a12422acb4ea7450ac2a74b43663cc1360` (committed blob; equals `plan-iter2.json`) |
| Delta since iteration 1 | `docs/releases/RELEASE_INTEGRATION_PATH.md` (step 2, step 4, the exception section), the plan's "Iteration 2" section, ledger #936, gate files, the iteration 1 report. No change under `FailSafe/`, `tools/`, `.github/` or `G4_WITNESS_OPERATIONS.md` |

Section 4 razor: **not applicable** (documentation and gate artifacts only).
Session key hygiene: `git ls-tree -r HEAD .qor/session` lists `.qor/session/current` only.
No TPM key was created and no TSA was contacted. The real repository was only read; nothing was committed.

## B1 (cmd.exe fail-open): closed

The printed command is now `git diff-tree --no-renames -r --name-status C~1 C`, unscoped. Run on the iteration 1 add-then-modify repository:

```
Git Bash:        M  tools/g4/checkpoints/g4-000003/manifest.json
PowerShell 5.1:  M  tools/g4/checkpoints/g4-000003/manifest.json
cmd.exe:         M  tools/g4/checkpoints/g4-000003/manifest.json
```

The new text is correct in all three shells, including the one it forbids. `git merge-base --is-ancestor` (exit 0), `git rev-list --merges` and a `foreach` over `git rev-list --reverse S..H` with `"$c~1"` also ran correctly in PowerShell 5.1. Check 3 requires K's five `A` lines, so an all-empty run is no longer a pass (`n_no_new_checkpoint`: check 3 FAIL).

## B2 (checkpoint not bound to the seal): closed

Checks 5 and 7 were executed literally against real signed, RFC 3161-timestamped test checkpoints on fresh clones (`real2.cjs`). "Check 7 accepted" means all three required lines were present: `mode: release`, `ok <new id> commit <first 12 hex of R>`, and `PASS OK` with no limitation.

| Construction | Check 5 | Verifier | Check 7 accepted |
|---|---|---|---|
| Genuine: K attests R, H = K + governance commit | ok | `PASS OK`, `ok g4-000003 commit <R>` | **yes** |
| Genuine, on M (`--commit M`, `M^{tree}` = `H^{tree}`) | ok | `PASS OK`, same `ok` line | **yes** |
| Genuine, previous checkpoint's head supplied | ok | `REFUSED HEAD_MISMATCH` | no |
| Iteration 1 G1: no new checkpoint, previous head | FAIL (no new checkpoint) | `PASS OK` (2 checkpoints) | no (no `ok` line for R; check 3 also fails) |
| Iteration 1 G2: new checkpoint attests pre-seal `main` | FAIL (commit != R) | `PASS OK` | no (`ok` line shows the wrong commit) |
| New: attests S | FAIL | `PASS OK` | no |
| New: attests a commit after R | FAIL | `PASS OK` | no |
| New: two new checkpoints, second head supplied | FAIL (head attests K1) | `PASS OK` (4) | no; check 3 also refuses (two commits carry checkpoint lines) |
| New: two new checkpoints, first named as "the new one" | ok | `REFUSED HEAD_MISMATCH` | no; check 3 also refuses |
| New: operator takes a later commit R2 that also contains the entry | FAIL when R is taken as defined ("first commit") | `PASS OK` | no. It is accepted only if the operator substitutes R2 for R (N-a) |
| New: K before R | FAIL (a manifest cannot name a descendant; synthetic run) | n/a | no |
| New: governance-only rewritten S | n/a | n/a | refused by check 1 (`merge-base --is-ancestor S H` exits 1) |

The verifier still returns a release PASS in six of these cases. The document no longer treats that as sufficient: the attested-commit line is what refuses them. Terms S, R and K are defined, and R is tied to the "seal commit" of `G4_WITNESS_OPERATIONS.md` (line 92 to 94 there: the seal entry is committed, then `--commit <seal commit>`), which removes the iteration 1 drift.

## Full re-run of the synthetic matrix

`attacks2.sh`: 64 repositories, checks 1 to 6 executed literally (check 5 using R as defined). Result: 61 REFUSE, 3 ALLOW. The three allowed cases are the genuine ones (`g_genuine`, `n_genuine_K_is_H_with_gov_file`, `n_genesis_first_checkpoint`).

| Attack class | Result | Refusing check(s) |
|---|---|---|
| 1. add then modify; add, modify, restore; add, delete, re-add | REFUSE | 2 (status `M`/`D`), 3 (checkpoint lines in more than one commit) |
| 2. modify, delete, rename file or directory, same-path replace, type change, chmod of pre-seal evidence | REFUSE | 2, plus 4 where the tree at H is affected |
| 3. 6th file, nested directory, file under `checkpoints/`, bad, 7-digit, uppercase, alias or Unicode names | REFUSE | 2 and 4 |
| 3. 4 files; 3 + 2 split; two new directories in one commit | REFUSE | 3 |
| 3. symlink or gitlink with an allowed name; 100755 | REFUSE | **4 only** |
| 3. 100755 then chmod back | REFUSE | 2 |
| 3. non-sequential `g4-000009` | REFUSE | 3 ("numbered one above the previous"); the verifier also gives `CHECKPOINT_GAP` (iteration 1 real run) |
| 4. keys (add; add then remove; added inside K), TSA root, `tsa-policy.json`, `revocations.json`, `sign-checkpoint.ps1`, `.gitattributes`, `.gitignore`, workflows, product change then revert, `Tools/G4/…` case variant, `tools/g4` or `checkpoints` turned into a symlink | REFUSE | 2 (now the printed command; the iteration 1 "scoped only" gap is gone) |
| 4. G4 script under `FailSafe/extension/**` | REFUSE | 2 and 6 |
| 5. merges (evil, governance-only, moved `main`) | REFUSE | 1 |
| 5. S rewritten (product or governance-only); rebase onto moved `main`; H a root commit | REFUSE | 1 |
| B2 family (see above) | REFUSE | 3 and/or 5 |
| Genuine checkpoint (K = H with a governance file; genesis `g4-000001`; K followed by a governance commit) | ALLOW | all six ok |

Attack 6 (diagnostic substitution) and attack 8 (H versus M) were established in iteration 1 against unchanged verifier code and re-confirmed here on H and M. Check 7 now also states that the exit code alone is never evidence.

## Consistency

- **Steps 1 to 6.** Step 2 "Seal scope" and step 4 restate the exception's checks without conflict: same commands, same shell rule, same three required lines, "the new checkpoint's externally retained head". Merge method, `--match-head-commit`, tree and subtree equality, rule-suite `result=pass`, cited decision files and the residual risks from PASS #929 are unchanged.
- **`G4_WITNESS_OPERATIONS.md`.** R equals its "seal commit"; the five file names, the `g4-NNNNNN` shape, the release-mode inputs and the `ok … commit <12 hex>` output format (`g4-verify-checkpoint.cjs` line 76) match. Revocation, root and archive changes are stated as pre-seal, which agrees with the strict rule.
- **Authorization.** The text authorizes no key, TSA choice or checkpoint ("No live checkpoint is authorized or created by this document"; a missing owner key or approved TSA is NO-GO). The plan's Boundaries section is unchanged.
- **Honesty.** The section states that these are operator checks, not CI enforcement, that #640 did not exercise them, and that the evidence is the audits' runs. The verifier's blind spots are disclosed. The plan now labels acceptance items 1, 2 and 4 as criteria evidenced by the audit.

## Non-blocking items

- **N-a.** Check 5 prints "R's ledger contains the entry" but not a test that R is the *first* such commit. A later commit that also contains the entry passes if the operator names it R. The seal entry is still witnessed in that case, so this is not a bypass; add "`git show R~1:docs/META_LEDGER.md` does not contain it".
- **N-b.** Check 7 says the head is written down "before it was committed"; `G4_WITNESS_OPERATIONS.md` lists retaining it as step 4, after the commit. Both are satisfiable (the manifest digest is fixed at creation). Align the order when either document is next edited.
- **N-c.** "Numbered one above the previous checkpoint" has no wording for the genesis case (`g4-000001`, no previous). Intent is clear and the verifier enforces contiguity.
- **N-d.** "Exactly one new directory" and "a later RC promotion that needs another checkpoint repeats all of the above" are compatible only if a promotion means a new seal (a new S). Say so.
- **N-e.** "When G4 applies" is still an owner scope decision that this document does not define; the ops doc's cadence says every release seal.
- **N4 (carried).** Look-alike names are caught because Git quotes non-ASCII paths by default; the document does not say so.
- **N5, N7 (carried, deliberately unchanged).** Symlinks and executables inside governance paths (#929 scope); the `git show` long-path limit, which fails closed.
- **Auditor harness note.** The first `attacks2.sh` pass reused a shell variable and produced invalid output. It was discarded and the matrix re-run; only the corrected run is reported.

## Commands relied on

```
git diff --stat 6922f7b8 HEAD ; git show HEAD:<plan> | sha256sum ; grep plan_content_hash plan-iter2.json
git show HEAD:.agent/staging/AUDIT_REPORT-650.md | sha256sum
git ls-tree -r HEAD .qor/session
bash attacks2.sh     # 64 repositories; checks 1-6: merge-base --is-ancestor, rev-list --merges,
                     # diff-tree --no-renames -r --name-status C~1 C (unscoped), ls-tree -r H, manifest commit == R, rev-parse H:FailSafe/extension
node real2.cjs       # Node 22.23.4, OpenSSL 3.5.7, g4Scenario.cjs helpers; g4-verify-checkpoint.cjs --release on fresh clones of H and M
cmd.exe /c, powershell -NoProfile -Command, bash: the new diff-tree command text
```

Scratch scripts and raw output (session-scoped, not committed):
`C:\Users\krkna\AppData\Local\Temp\claude\6405f61d9b064ac4\b5cba55a-fbfb-453a-9069-0bb3c44a8e39\scratchpad\gitlab\{attacks2.sh,results2.txt,real2.cjs,real2.out}`

## Scope of this PASS

It covers the documented operator procedure at plan hash `a085bed5…1360`. It is not a release GO, not approval of any item in `V6_0_13_G4_OWNER_DECISIONS.md`, and not evidence that any live checkpoint, key or TSA exists.

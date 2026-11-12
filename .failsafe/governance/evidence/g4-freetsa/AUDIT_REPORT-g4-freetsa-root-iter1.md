# Audit report: G4 FreeTSA production TSA root (#638), plan iteration 1

- Procedure: native /qor-audit (Gate Tribunal), independent adversarial auditor. The auditor did not write this change.
- Repository: MythologIQ-Labs-LLC/FailSafe, worktree C:\dev\mythologiq\FailSafe-g4tsa
- Target commit: c2102207aecf3a81e788abbb33a0ba05974b467d (branch feat/638-g4-freetsa-root)
- Baseline: main 29b819feaf07ca991c9b6a75f8e0f01549e3cd11 (also the merge base of PR #647 head c9635dc05be2479b7d72d6e381ad75dec56ae420)
- Plan: .failsafe/governance/plans/plan-v6013-638-g4-freetsa-root.md (iteration 1)
- Risk grade: L3 (production trust anchor for G4 checkpoint witnessing)
- Audit date: 2026-11-12

## Verdict: VETO

The trust anchor itself is correct and I could not find any widening of trust or weakening of fail-closed behaviour. The committed PEM is the genuine FreeTSA root, the policy pins exactly one root with the right DER SHA-256, and the verifier, the release clean-checkout check and the new test all behave as claimed. The VETO rests on one blocking violation (V1): after this change, the operator runbook and the owner-decision document on main state that the TSA policy is empty and unselected, which is false for the production trust configuration this change commits. The remediation is a small documentation edit in this PR; no code or trust change is needed.

## Check 1: root identity, re-derived independently

Commands (Git Bash, OpenSSL 3.5.7, scratch directory outside the worktree):

    curl -sS https://freetsa.org/files/cacert.pem -o live.pem
    curl -sS https://www.freetsa.org/files/cacert.pem -o www.pem
    curl -sSL "https://web.archive.org/web/2019id_/https://freetsa.org/files/cacert.pem" -o wb2019.pem
    curl -sSL https://raw.githubusercontent.com/trbs/rfc3161ng/master/data/freetsa_cacert.pem -o trbs.pem
    curl -sSL https://raw.githubusercontent.com/huridocs/preserve/main/files/freetsa/cacert.pem -o huridocs.pem
    git show c2102207:tools/g4/tsa-roots/freetsa-root-ca.pem > committed.pem
    for f in *.pem; do sha256sum < $f; openssl x509 -in $f -outform DER | sha256sum; done
    cmp live.pem committed.pem

Observed (all six identical, 2833 bytes each):

| Source | File SHA-256 | DER SHA-256 |
|---|---|---|
| committed blob at c2102207 | 2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438 | a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc |
| live https://freetsa.org/files/cacert.pem | same | same |
| live https://www.freetsa.org/files/cacert.pem | same | same |
| Internet Archive 2019 capture (id_) | same | same |
| GitHub trbs/rfc3161ng | same | same |
| GitHub huridocs/preserve | same | same |

- cmp live.pem committed.pem: identical (byte-for-byte).
- DER SHA-256 equals the owner's inventoried candidate a6379e7c...18aabc. No mismatch; no STOP condition.
- tools/g4/tsa-policy.json at c2102207 has exactly one trustedRoots entry, certificatePath tools/g4/tsa-roots/freetsa-root-ca.pem, sha256 a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc, status selected, schema failsafe-g4-tsa-policy/v1.
- The committed PEM contains exactly one certificate (grep -c BEGIN = 1), LF endings, ends with a newline.
- The worktree files under tools/, FailSafe/ and .gitignore equal the commit (git diff --quiet c2102207 succeeded).
- .gitattributes marks tools/g4/tsa-roots/** and tools/g4/tsa-policy.json as -text, so core.autocrlf=true (set on this host) cannot rewrite the root on checkout. A fresh clone checked out with autocrlf=true gave file SHA-256 2151b611...044438.
- I also recomputed every committed evidence copy (root-sources/*.pem.txt and run2/part-a/pinned-root.pem.txt): each contains the a6379e7c root; the chainloop copy additionally contains the previous FreeTSA signer (4694be23...), as the README says. The wayback-2016 capture is the older text+PEM form of the file, fetched over http, and carries the same DER. FreeTSA's index_en.php in the evidence prints 2151b611...044438.

Result: PASS for this check.

## Check 2: trust widening, fail-closed behaviour, .gitignore negation, release clean checkout

Code read: FailSafe/extension/scripts/lib/g4/verify.cjs (policyCaFile, buildContext, verifyCheckpoints), verify-witness.cjs, timestamp.cjs (verifyToken), release-mode.cjs (porcelain, tree checks). No code under scripts/lib/g4 changed in the diff (git diff --stat shows only .gitignore, tools/g4/tsa-policy.json, the new root, the test, the plan and evidence).

- The policy and root are read from the HEAD commit via requireBlob, not the working tree. Missing/unparseable policy is REFUSED; status not selected or empty roots is BLOCKED TSA_POLICY_UNSELECTED; DER digest mismatch is REFUSED TSA_ROOT_MISMATCH; openssl ts -verify runs with -CAfile containing only the policy roots (no partial-chain flag), the checkpoint chain only as -untrusted.
- Live demonstration in a scratch clone (local commit in the scratch clone only): one hex digit changed in the policy digest -> "REFUSED TSA_ROOT_MISMATCH". Unmodified clone in diagnostic mode -> "BLOCKED NO_CHECKPOINTS" (policy accepted, no checkpoints yet).
- .gitignore: the negation is "!tools/g4/tsa-roots/*.pem" after "*.pem" and "*.key". git check-ignore -v --no-index:
  - tools/g4/tsa-roots/freetsa-root-ca.pem -> not ignored (line 109)
  - tools/g4/tsa-roots/x.pem -> not ignored (line 109)
  - tools/g4/tsa-roots/x.key -> ignored (*.key, line 107)
  - tools/g4/tsa-roots/sub/x.pem -> ignored (*.pem, line 106)
  - tools/g4/x.pem -> ignored (*.pem, line 106)
  The negation only un-ignores direct-child .pem files of tools/g4/tsa-roots. It could let a private key saved as tools/g4/tsa-roots/<name>.pem show up as untracked instead of ignored. It does not commit anything by itself, and such a file is caught three ways: git status shows it, the new test's readdirSync assertion fails, and release mode refuses the tree (below). Keys under *.key stay ignored. Acceptable.
- Release clean-checkout behaviour, fresh clone of c2102207 (autocrlf=true):
  - git status --porcelain --untracked-files=all --ignored -- tools/g4: empty.
  - g4-verify-checkpoint.cjs --release with well-formed dummy inputs -> "BLOCKED NO_CHECKPOINTS" (passes the tree-clean and policy steps).
  - after adding tools/g4/tsa-roots/evil.pem -> "BLOCKED RELEASE_TREE_DIRTY ... ?? tools/g4/tsa-roots/evil.pem".
  - after adding tools/g4/tsa-roots/evil.key -> "BLOCKED RELEASE_TREE_DIRTY ... !! tools/g4/tsa-roots/evil.key".
- Real repository (worktree): diagnostic -> "BLOCKED NO_CHECKPOINTS" exit 2; --release without inputs -> "BLOCKED RELEASE_INPUT_MISSING" exit 2. The existing "CLI never reports PASS" test still holds.
- No fallback TSA, no second root, no new override path. --tsa-ca in release mode stays BLOCKED TSA_OVERRIDE_NOT_RELEASE (confirmed by my re-run, check 4).

Result: no widening and no weakening introduced by this diff. See non-blocking note N1 for a pre-existing verifier gap.

## Check 3: does the new test fail on relevant policy/root changes

Method: scratch clone of c2102207, plant one change, run
`node --test --test-name-pattern="exactly one root" src/test/scripts/g4Witness.test.cjs`, then `git checkout -- .` and `git clean` before the next plant. The real worktree was not touched.

| Planted change | Test result |
|---|---|
| none (baseline) | pass |
| second trustedRoots entry (duplicate of the first) | FAIL |
| digest uppercased | FAIL |
| certificatePath aliased via ../ | FAIL |
| root PEM with the same certificate appended | FAIL |
| root PEM with a forged same-DN certificate appended | FAIL |
| extra file tools/g4/tsa-roots/other.pem | FAIL |
| status reverted to pending-owner-decision | FAIL |
| schema changed to v2 | FAIL |
| extra unknown JSON fields added | pass (see N3) |

Note: my first forged-cert attempt passed only because Git Bash path conversion broke the openssl -subj argument and nothing was appended; with MSYS_NO_PATHCONV=1 the forged cert was appended and the test failed. Recorded so the table above is not misread.

Result: the test fails on every change that affects which root is trusted.

## Check 4: test suites and qualification re-run

- `cd FailSafe/extension && node --test src/test/scripts/g4*.test.cjs`: tests 109, pass 109, fail 0.
- `node --test src/test/docs/pro-retirement.test.cjs`: tests 4, pass 4, fail 0.
- `node .failsafe/governance/evidence/g4-freetsa/scripts/qualify-freetsa.cjs C:/dev/mythologiq/FailSafe-g4tsa <scratch>/qual` (out dir outside the worktree; 5 FreeTSA requests for random digests, 2 s spacing): "42/42 expectations met", exit 0. Highlights from my run:
  - 3 fresh tokens (genTime 2026-11-12T15:28:16Z..19Z) granted, SHA-256, embedded signer 32e841a9..., verify OK against the pinned root alone.
  - Mozilla bundle and same-DN forged root: FAIL ("self-signed certificate in certificate chain").
  - Substituted imprints: FAIL ("message imprint mismatch").
  - Truncated, signature flip, genTime flip, nonce flip, random, empty: all FAIL.
  - -attime before signer validity: "not yet valid"; after signer expiry: "certificate has expired"; after root expiry: root reported "has expired".
  - Release verifier over throwaway repos with the exact policy bytes: "PASS OK mode:release limitations:0"; stale head REFUSED HEAD_MISMATCH; pending status and empty roots BLOCKED TSA_POLICY_UNSELECTED; digest off REFUSED TSA_ROOT_MISMATCH; root missing REFUSED TSA_POLICY_MISSING; forged root with updated digest REFUSED TOKEN_INVALID; substituted token REFUSED TOKEN_IMPRINT_MISMATCH; flipped token REFUSED TOKEN_INVALID; --tsa-ca in release BLOCKED TSA_OVERRIDE_NOT_RELEASE; public roots in diagnostic REFUSED TOKEN_INVALID.
  - Six outage cases left no checkpoint or staging directory.
- I did not run the full `npm run test:node`; the plan's 1091/2 figure is not independently confirmed here.
- After all runs: `git status --short` in the worktree shows only " M .qor/session/current" (as found), plus this report.

Result: PASS for this check.

## Check 5: overstatement and Section 4 razor

Overstatement review of the plan and evidence README:
- Root identity, interoperability and rejection claims match what I reproduced.
- "Corroborated by 10 sources": I independently reproduced 5 live sources and re-hashed all 10 committed copies. The first-commit dates of the GitHub copies (2018, 2022, 2025) were not independently verified; I fetched current branch heads only. Not material.
- "There is no verifier code change and no change to trust semantics": true.
- "Any change to the trusted root must also change this test": true for the root file and policy roots (check 3).
- Not overstated, but not covered: the plan's change table does not update operator documentation that describes the policy file this PR changes (V1).

Simplicity razor (new code only):

| Check | Limit | Observed | Status |
|---|---|---|---|
| Max function lines | 40 | new test 20; qualify-freetsa.cjs largest about 14 (main IIFE); qualify-part-a.cjs largest about 16 (rejections); qualify-part-b.cjs largest about 16 (run) | OK |
| Max file lines | 250 | test file unchanged scale; scripts 92 / 124 / 143 | OK |
| Max nesting depth | 3 | at most 3 (outages for/await, variant callbacks) | OK |
| Nested ternaries | 0 | 0 | OK |

Other passes:
- Security: no credentials, keys or secrets committed. The ephemeral test signer is a public .cer only; forged-root keys are deleted after use (forgedRoot rmSync). Evidence replaces local paths with <scratch>. PASS.
- Ghost UI: not applicable (no UI).
- Dependencies: none added. PASS.
- Orphans: the new test is picked up by the g4*.test.cjs glob and test:node; the evidence scripts are manual, documented tools under the evidence folder and require only existing g4 libraries and test helpers. PASS.
- Macro architecture: single source of truth for the trust configuration is tools/g4/tsa-policy.json plus the root blob; see V1 for documentation that contradicts it.

## Check 6: policy note citing a file only on PR #647

- docs/releases/V6_0_13_G4_TSA_OWNER_SELECTION_2026-11-12.md does not exist at c2102207 (git cat-file fails) and exists on origin/fix/638-g4-owner-decision-proposal (c9635dc0). Its content records the FreeTSA selection, the candidate digest, single root, no fallback, and that the root and single-root policy are to be committed "through a separate qualified PR", which is this change.
- The note is free text; no code reads it, and no test or link check fails on it.
- The plan states a merge precondition (PR #647 merged first or together). This is acceptable provided the precondition is enforced at merge time; see N2.

## Violations

### V1 (blocking): operator and governance documentation contradicts the committed trust configuration

After c2102207 (and also after PR #647, which does not change these lines), main would say:
- docs/releases/G4_WITNESS_OPERATIONS.md line 22: `tools/g4/tsa-policy.json` | Trusted TSA roots (`pending-owner-decision`, none). False: the policy is now selected with one FreeTSA root.
- docs/releases/G4_WITNESS_OPERATIONS.md line 85, step 3 "Commit the selected TSA root ... set tsa-policy.json to selected": now done, but still listed as a pending step.
- docs/releases/V6_0_13_G4_OWNER_DECISIONS.md line 3: "no TSA is selected, tools/g4/tsa-policy.json is pending-owner-decision, and g4-verify-checkpoint.cjs returns BLOCKED TSA_POLICY_UNSELECTED on this repository". False: the verifier now returns BLOCKED NO_CHECKPOINTS on this repository (observed). Line 71 still recommends DigiCert with no pointer to the FreeTSA selection.

For an L3 change that installs the production trust anchor, the runbook's description of what the verifier trusts is part of the trust configuration's documentation. Leaving it stating "none" means an operator reading the runbook gets the trust anchor wrong.

Required remediation (documentation only, in this PR):
1. G4_WITNESS_OPERATIONS.md line 22: describe the policy as selected, one root, FreeTSA Root CA, tools/g4/tsa-roots/freetsa-root-ca.pem, DER SHA-256 a6379e7c...18aabc. Mark step 3 at line 85 as done for v6.0.13 (or reword it as the procedure for a future owner-approved replacement).
2. V6_0_13_G4_OWNER_DECISIONS.md: add a short dated status line that item 3 (TSA selection) is decided by the 2026-11-12 owner record and implemented by this change, and that the "BLOCKED TSA_POLICY_UNSELECTED" sentence describes the state before it. Without rewriting the historical record. If the author decides this file belongs to PR #647, the plan must say so and #647 must carry the edit before merge; either way the merged main must not state that no TSA is selected.
3. Add both files to the plan's change table, re-run the g4 suites and the pro-retirement guard, and re-submit (iteration 2).

## Non-blocking notes

- N1 (pre-existing verifier gap, not introduced here): policyCaFile checks the DER SHA-256 of only the first certificate parsed from each root PEM (crypto.X509Certificate) but writes the whole PEM file into the CAfile. A root file with additional certificates appended after the pinned one passes TSA_ROOT_MISMATCH and all its certificates become trusted. Reproduced in a scratch clone: same-DN forged certificate appended to freetsa-root-ca.pem, policy digest unchanged, committed -> verifier reached "BLOCKED NO_CHECKPOINTS" instead of refusing the policy. For the committed state this is covered by the new test's file SHA-256 and single-file pins (check 3), and in threat terms an attacker who can commit could also change the digest, so it is not a widening by this change. Recommend a follow-up issue: refuse a root file that does not contain exactly one certificate, or pin the file SHA-256 in the policy as well.
- N2: The merge precondition on PR #647 is only stated in prose. Record it on the PR (for example a blocking checklist item or "depends on #647") so the policy note never lands on main citing a missing file.
- N3: The pin test does not reject unknown extra fields in tsa-policy.json or in the root entry. The verifier ignores such fields, so there is no trust effect today.
- N4: The evidence README and plan contain non-ASCII characters (for example the ellipsis character in abbreviated digests; 16 lines across both files). Fine for these documents, but do not paste them into the ASCII-only ledger.
- N5: The evidence scripts hard-code the Git for Windows Mozilla bundle path; they are manual Windows-host tools, so this is acceptable but should stay out of automated suites.
- N6: In the "after the root expires" -attime case, the signer has also expired by then; OpenSSL reported the root as expired in my run, so the claim holds, but the case does not isolate root expiry from signer expiry.
- N7: The README's "Retrieved" column lists capture dates for the archive rows rather than retrieval dates; the headers files show retrieval on 2026-11-12. Cosmetic.

## Constraints observed

Read-only on the repository except this report. No commit, push, branch, PR, key enrollment or TPM access. No ledger or gate file modified (the skill's ledger and shadow-genome steps were not performed, per the caller's constraints). Scratch work used a local clone outside the worktree. External traffic: GETs of public certificate files from freetsa.org, web.archive.org and raw.githubusercontent.com, and the qualification script's 5 RFC 3161 queries over random digests. No repository content, path, key or secret was sent.

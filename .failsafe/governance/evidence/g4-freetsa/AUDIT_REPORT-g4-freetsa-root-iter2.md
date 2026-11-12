# Audit report: G4 FreeTSA production TSA root (#638), plan iteration 2

- Procedure: native /qor-audit (Gate Tribunal), independent adversarial auditor. The auditor did not write this change and saw earlier reviews only as recorded in the repository (Entry #956 and the iteration 1 report).
- Repository: MythologIQ-Labs-LLC/FailSafe, worktree C:\dev\mythologiq\FailSafe-g4tsa
- Target commit: 5288dde6e6b551d6204998248a2a50ad99fe0f9a (branch feat/638-g4-freetsa-root)
- Baseline: main 29b819feaf07ca991c9b6a75f8e0f01549e3cd11. Iteration 1 commit: c2102207aecf3a81e788abbb33a0ba05974b467d.
- Merge precondition reviewed: PR #647 local head 5836d38e309fc62f3092c2175ad803925a0d3ef5 (worktree C:\dev\mythologiq\FailSafe-647, branch fix/638-g4-owner-decision-proposal-local); pushed head c9635dc05be2479b7d72d6e381ad75dec56ae420.
- Plan: .failsafe/governance/plans/plan-v6013-638-g4-freetsa-root.md (iteration 2)
- Risk grade: L3 (production trust anchor for G4 checkpoint witnessing)
- Audit date: 2026-11-12

## Verdict: VETO

The trust anchor is correct and the iteration 2 edit to G4_WITNESS_OPERATIONS.md is accurate. Trust is not widened and fail-closed behaviour is not weakened. The commit and the PR #647 local head were each reviewed alone and in the merged picture (this PR's tree with #647's three files laid over it; the two change sets touch disjoint files). The VETO rests on two blocking findings:

- V1: iteration 1's V1 is only partly remediated. In the merged picture, the dated owner TSA selection record still says that technical trust admission is PENDING. It also lists committing the root and the single-root policy under "not yet authorized or completed".
- V2: the iteration 2 section of the plan says two things are done that are not true at the audited commit.

Both fixes are documentation only.

## Check 1: root identity, re-derived independently

Commands (Git Bash, OpenSSL 3.5.7, scratch directory outside the worktree):

    curl -sS -o live.pem https://freetsa.org/files/cacert.pem
    curl -sS -o livewww.pem https://www.freetsa.org/files/cacert.pem
    curl -sSL -o wb.pem "https://web.archive.org/web/2019id_/https://freetsa.org/files/cacert.pem"
    curl -sSL https://raw.githubusercontent.com/trbs/rfc3161ng/master/data/freetsa_cacert.pem
    curl -sSL https://raw.githubusercontent.com/huridocs/preserve/main/files/freetsa/cacert.pem
    curl -sSL https://raw.githubusercontent.com/huridocs/preserve/master/files/freetsa/cacert.pem
    sha256sum < f ; openssl x509 -in f -outform DER | sha256sum
    git show 5288dde6:tools/g4/tsa-roots/freetsa-root-ca.pem | sha256sum

Observed:

| Source | File SHA-256 | DER SHA-256 |
|---|---|---|
| committed blob at 5288dde6 | 2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438 | a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc |
| live https://freetsa.org/files/cacert.pem | same | same |
| live https://www.freetsa.org/files/cacert.pem | same | same |
| Internet Archive 2019 capture (id_) | same | same |
| GitHub trbs/rfc3161ng data/freetsa_cacert.pem | (not compared) | same |
| GitHub huridocs/preserve main and master | (not compared) | same |

- The DER SHA-256 equals the owner's candidate a6379e7c...18aabc and the single sha256 in tools/g4/tsa-policy.json. There is no mismatch, so the STOP condition does not apply.
- The committed PEM holds exactly one certificate. Subject and issuer are both O=Free TSA, OU=Root CA, CN=www.freetsa.org (self-signed). It is valid from 2016-03-13 to 2041-03-07.
- tools/g4/tsa-policy.json: schema failsafe-g4-tsa-policy/v1, status selected, exactly one trustedRoots entry (certificatePath tools/g4/tsa-roots/freetsa-root-ca.pem). tools/g4/tsa-roots holds only that one tracked file.
- The root file and policy are unchanged since iteration 1 (git diff c2102207 5288dde6 does not touch tools/, .gitignore or the test).
- A first attempt at the trbs path data/tsa.crt returned a 14-byte 404 body. It is not a copy and is disregarded; the correct path is above.

Result: PASS.

## Check 2: iteration 1 V1 remediation in the merged picture, and verifier output

Commands:

    git -C C:\dev\mythologiq\FailSafe-647 diff c9635dc0 5836d38e
    git archive 5288dde6 docs tools/g4 | tar -x -C <scratch>/merged
    git -C FailSafe-647 show 5836d38e:<file> > <scratch>/merged/<file>   (three #647 files)
    grep -rn -i -E "TSA_POLICY_UNSELECTED|no TSA is selected|pending-owner-decision|policy is pending|under (independent )?audit|admission.*PENDING|neither FreeTSA|selected no TSA" <scratch>/merged
    node FailSafe/extension/scripts/g4-verify-checkpoint.cjs --repo-root .

Verifier output on the worktree at 5288dde6:

    [g4-verify] mode: diagnostic (NOT release evidence)
    [g4-verify] BLOCKED NO_CHECKPOINTS: no checkpoints to verify
    exit=2

Fixed relative to iteration 1:
- docs/releases/G4_WITNESS_OPERATIONS.md: the status line, the tsa-policy.json row, the new root row and step 3 now describe the committed single-root policy. The status line's claim that the verifier returns BLOCKED NO_CHECKPOINTS matches the output above.
- docs/releases/V6_0_13_G4_OWNER_DECISIONS.md (#647 at 5836d38e): the status line records item 3 as decided, keeps the 2026-11-10 text as history and says the DigiCert recommendation is superseded. The sentence "main reports BLOCKED TSA_POLICY_UNSELECTED until the separately audited single-root policy PR merges" depends on that PR merging, so it stays true after the merge.
- docs/releases/V6_0_13_G4_OWNER_DECISION_RECORD_PROPOSED.md line 13: past-tense, dated, with the same "until it merges" qualifier. Acceptable.

Still wrong in the merged picture (see V1):
- docs/releases/V6_0_13_G4_TSA_OWNER_SELECTION_2026-11-12.md line 3: "**Status:** OWNER SELECTED PROVIDER; technical trust admission and release qualification PENDING." This is unconditional. After this PR merges, technical trust admission is exactly what has happened.
- The same file, line 16, heading "Operational prerequisites, not yet authorized or completed". Only item 1 is marked done. Item 2 (fresh token, rejection cases) and item 3 ("commit the root PEM and the single-root tools/g4/tsa-policy.json update through a separate qualified PR. Do not turn status to selected until ...") are still presented as not completed. On merged main, status is already selected.
- docs/releases/V6_0_13_G4_OWNER_DECISION_RECORD_PROPOSED.md line 87 (item 3 owner response: "Root qualified 2026-11-12; policy PR under audit.") and line 106 (section 2a, item 3: "policy PR under independent audit" | "Merge of the policy PR (owner)" as authorization still required). Both go stale when this PR merges, and they are not conditioned on it.

No remaining statement in the merged docs/ or tools/g4/ (META_LEDGER.md excluded as history) says that no TSA is selected. No remaining statement unconditionally says that the verifier returns TSA_POLICY_UNSELECTED on this repository.

Result: FAIL (V1).

## Check 3: no widening of trust or weakening of fail-closed behaviour

- Diff scope since baseline: .gitignore (+2 lines), tools/g4/tsa-policy.json, the new root PEM, g4Witness.test.cjs, docs/releases/G4_WITNESS_OPERATIONS.md, META_LEDGER.md (append only), .qor gate and session files, the plan, and evidence. No file under FailSafe/extension/scripts changed.
- .gitignore: `!tools/g4/tsa-roots/*.pem` after `*.pem` and `*.key`. git check-ignore -v --no-index:
  - tools/g4/tsa-roots/freetsa-root-ca.pem and tools/g4/tsa-roots/x.pem: not ignored (line 109)
  - tools/g4/tsa-roots/x.key: ignored (*.key, line 107)
  - tools/g4/tsa-roots/sub/x.pem, tools/g4/x.pem, tools/g4/keys/x.pem: ignored (*.pem, line 106)
  The negation covers only direct-child .pem files of tools/g4/tsa-roots. It makes nothing trusted by itself, since trust comes only from the policy digest read from HEAD. A stray file there would fail the new readdirSync pin and appear in git status. .gitattributes keeps tools/g4/tsa-roots/** and tsa-policy.json as -text.
- The policy has exactly one root and no fallback. The new test requires length 1, the exact path, the DER and file SHA-256 literals, a self-signed CA and FreeTSA's subject. It replaces the old "pending, empty" assertion and loosens nothing.
- Verifier behaviour is unchanged (no code diff). The committed qualification evidence and Check 5 cover the refusal codes.

Result: PASS.

## Check 4: test suites

Commands, run from FailSafe/extension:

    node --test src/test/scripts/g4*.test.cjs   -> tests 109, pass 109, fail 0
    node --test src/test/docs/*.test.cjs        -> tests 145, suites 15, pass 145, fail 0

The new test "committed TSA policy trusts exactly one root: the pinned FreeTSA Root CA" passed, and so did "the CLI never reports PASS for the real repository". I did not run the full npm run test:node, so the plan's 1091/2 figure is not independently confirmed.

Result: PASS.

## Check 5: real tokens and rejection cases

Live re-run:

    node .failsafe/governance/evidence/g4-freetsa/scripts/qualify-freetsa.cjs C:/dev/mythologiq/FailSafe-g4tsa <scratch>/iter2audit/qual

- Three FreeTSA tokens were granted for random digests (genTime 2026-11-12T15:36:59Z, 15:37:01Z, 15:37:03Z). The embedded signer is the published tsa.crt, and each token verified OK against the pinned root alone.
- Rejected as expected: the Mozilla bundle and a forged same-DN root ("self-signed certificate in certificate chain"), two substituted imprints ("message imprint mismatch"), a truncated token, a flipped last signature byte, and a flipped genTime digit.
- The script then stopped with "Error: marker 0101ff0208 not found" in qualify-part-a.cjs line 60 (the nonce-flip case). Part B did not run. The run used 3 FreeTSA requests. I did not re-run, to stay within the 5-request limit. See N2: this is a flaw in the evidence tool, not in the verifier, and the script failed closed (it reported no pass).

Offline verification of the committed evidence (no network), against the committed root:

    openssl ts -verify -queryfile <d>/token.tsq -in <d>/token.tsr -CAfile tools/g4/tsa-roots/freetsa-root-ca.pem -untrusted <d>/chain.pem.txt

- run1 token-1..3 and run2 token-1..3: all "Verification: OK" (genTime 15:15:40Z to 15:16:55Z on 2026-11-12).
- run2 token-1 against the Git Mozilla CA bundle: FAILED (self-signed certificate in certificate chain).
- run2 malformed-*.tsr (genTime flip, empty, signature flip, random bytes, nonce flip, truncated) against token-1's query: all FAILED.
- run2 unsigned-embedded-certificate-byte-flipped.tsr with the genuine chain: OK, as the README documents (the CMS certificate set is outside the signature).
- run2/console.log ends "42/42 expectations met", matching the README.

Result: PASS for the evidence of real tokens and rejection cases. See N2 for the reproducibility gap.

## Check 6: ledger integrity

Commands:

    <qor-env>\python.exe -I -m qor.cli verify-ledger --post-anchor     (in the worktree)
    git diff 29b819fe 5288dde6 -- docs/META_LEDGER.md

- The output ends "post-anchor clean (boundary=#382)", exit 0, with "OK Entry #955" and "OK Entry #956: chain hash verified (post-anchor)".
- The ledger diff has one hunk (@@ -36451,3 +36451,23 @@) at the end of the file and 0 removed lines. Entries up to #955 are unchanged against the baseline. Only Entry #956 is appended.
- Entry #956's content hash 447d013d...89153e equals the LF-normalized SHA-256 of the committed iteration 1 report.
- Fairness: Entry #956 quotes its report accurately: the root identity sources and hashes, no widening, the .gitignore and RELEASE_TREE_DIRTY results, the pin test failing on every planted change except unknown JSON fields, 109/109, 42/42 with 5 requests, the V1 text, N1 and N2. It leaves out notes N3 to N7, which are not material.

Result: PASS.

## Check 7: overstatement and Section 4 razor

Plan, iteration 2 section:
- "Commits 04aec572 and 5836d38e on fix/638-g4-owner-decision-proposal do this": false at the audited time. `git branch -a --contains 5836d38e` lists only the local branch fix/638-g4-owner-decision-proposal-local, and `git ls-remote origin refs/heads/fix/638-g4-owner-decision-proposal` returns c9635dc0, which contains neither commit. See V2.
- "N2. The PR #647 merge precondition is stated on the PR as well as here": false at the audited time. `gh pr list --head feat/638-g4-freetsa-root` returns [], so there is no PR for this branch yet. Searches of PR #647's body and comments for "precondition", "freetsa-root" and "policy PR" find no statement that #647 must merge before this PR. See V2.
- "Once #647 merges, no statement on main says that no TSA is selected": literally true (Check 2), but not enough. Statements that trust admission is pending remain (V1).
- "The verifier on this repository now returns BLOCKED NO_CHECKPOINTS": true (observed).
- "There is no verifier code change": true.
- The evidence README and the qualification summary match the committed runs (Check 5).

Simplicity razor: no code changed since iteration 1. The test and the three evidence scripts (92, 124 and 143 lines) are as the iteration 1 report measured: largest function about 20 lines, nesting at most 3, no nested ternaries. PASS.

Other passes: Security PASS (no secrets, keys or credentials, public certificates only). Ghost UI not applicable. Dependencies: none added, PASS. Orphans: the test is picked up by the g4*.test.cjs glob, and the scripts are documented manual evidence tools, PASS. Macro architecture: the single source of truth is tsa-policy.json plus the root blob. V1 is the remaining documentation that contradicts it.

## Violations

### V1 (blocking, specification-drift, residual of iteration 1 V1)

After both PR #647 (5836d38e) and this PR (5288dde6) merge, main would contain these statements contradicting the committed trust configuration:
1. docs/releases/V6_0_13_G4_TSA_OWNER_SELECTION_2026-11-12.md line 3: "technical trust admission and release qualification PENDING". Trust admission is complete: the root is committed and status is selected.
2. The same file, line 16 and items 2 and 3: the token test and the root-plus-policy commit are still presented as "not yet authorized or completed". Item 3 tells the reader not to set status to selected, while main has it selected.
3. docs/releases/V6_0_13_G4_OWNER_DECISION_RECORD_PROPOSED.md line 87 ("policy PR under audit") and line 106 ("policy PR under independent audit"; "Merge of the policy PR (owner)" still listed as required): these go stale on merge and are not conditioned on it.

This is the same class of defect iteration 1 vetoed. A reader of the dated owner record for the production trust anchor would conclude that the root is not yet admitted.

Required remediation (documentation only):
- Either word these #647 statements so that they depend on the policy PR merging (as #647 already does at OWNER_DECISIONS.md line 5 and PROPOSED.md line 13), or update them in whichever PR merges last, so that after the second merge the status line, the prerequisite list and the item-3 rows record trust admission as done (root committed, single-root policy selected, the audit entry that passes it), while release qualification stays pending.
- Re-grep the merged picture for "PENDING", "not yet ... completed", "under audit" and "Do not turn status", re-run the g4 and docs suites, and submit for a new independent audit.

### V2 (blocking, overstatement in the governance record)

The iteration 2 section of the plan says that commits 04aec572 and 5836d38e are on fix/638-g4-owner-decision-proposal, and that the #647 merge precondition "is stated on the PR". At the audited time the commits exist only on a local, unpushed branch, no PR exists for feat/638-g4-freetsa-root, and #647 does not state the precondition. A gate record for an L3 change must not report remediation that has not happened.

Required remediation: state the facts as they are (local branch name, not yet pushed; precondition to be stated when the PR is opened), or push the commits and record the precondition on both PRs before the next audit. The next auditor should be able to verify each claim.

## Non-blocking notes

- N1 (pre-existing verifier gap, carried from iteration 1): policyCaFile hashes only the first certificate in a root file but trusts every certificate in it. The plan says the fix is in a separate PR. For the committed state, the new test's file-SHA-256 and single-file pins cover it.
- N2: qualify-part-a.cjs locates the TSTInfo nonce with the fixed marker 0101ff0208. That assumes FreeTSA's nonce encodes as an 8-byte INTEGER right after an ordering TRUE. Depending on the random nonce, DER can encode it in 9 bytes (high bit set) or fewer (leading zero), so a fresh run can fail with "marker ... not found", as mine did. The tool fails closed and the committed run2 evidence is intact. But the plan and README present the script as the way to reproduce the evidence, and it does not reliably reproduce it.
- N3: the committed gate .qor/gates/2026-11-12T1524-662da3/plan.json at 5288dde6 still records iteration 1 (plan_content_hash 3771b3ce...). The iteration 2 gate (iteration 2, hash 87743ad9..., equal to the SHA-256 of the committed plan) exists only as an uncommitted modification in the worktree. It was present before this audit started, and I left it untouched.
- N4: unknown fields in tsa-policy.json are still neither pinned nor rejected (iteration 1 N3; no trust effect today).
- N5: the plan and evidence README still contain non-ASCII characters (the ellipsis character in shortened digests). Do not copy them into the ASCII-only ledger.

## Constraints observed

Read-only except this report. No commit, push, branch, PR, key enrollment or TPM access. No ledger, gate or shadow-genome file was modified, per the caller's constraints; the skill's ledger and shadow-genome steps were therefore not performed. Scratch work was outside both worktrees: a git archive extract and overlaid file copies. Neither worktree was checked out, merged or rebased. External traffic: GETs of public certificate files from freetsa.org, www.freetsa.org, web.archive.org and raw.githubusercontent.com, read-only gh queries, and 3 RFC 3161 requests over random digests from the qualification script. No repository content, path or secret was sent. Final git status in C:\dev\mythologiq\FailSafe-g4tsa: the two pre-existing .qor gate modifications. This report is matched by the .failsafe/ rule at .gitignore line 11, so it shows only under --ignored and must be force-added (git add -f) if committed, as the iteration 1 report evidently was. In C:\dev\mythologiq\FailSafe-647: clean.

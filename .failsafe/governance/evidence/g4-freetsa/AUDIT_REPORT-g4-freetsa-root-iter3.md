# Audit report: G4 FreeTSA production TSA root (#638), plan iteration 3

- Procedure: native /qor-audit (Gate Tribunal), independent adversarial auditor. The auditor did not write this change and saw earlier reviews only as recorded in the repository (Entries #956 and #957 and the iteration 1 and 2 reports).
- Repository: MythologIQ-Labs-LLC/FailSafe, worktree C:\dev\mythologiq\FailSafe-g4tsa
- Target commit: 9a9dc0aabe9b4aa4308d9d9ca5ec0a4a93fe0b19 (branch feat/638-g4-freetsa-root, draft PR #657)
- Baseline: main 29b819feaf07ca991c9b6a75f8e0f01549e3cd11. Iteration 2 commit: 5288dde6. Stacked on PR #647 head 5836d38e309fc62f3092c2175ad803925a0d3ef5, merged into this branch at dca93572 (parents 0aa0bf7d and 5836d38e).
- Diffs reviewed: git diff 29b819fe 9a9dc0aa (merged picture), git diff 5836d38e 9a9dc0aa (this PR beyond #647), git diff 5288dde6 9a9dc0aa (since the iteration 2 audit).
- Plan: .failsafe/governance/plans/plan-v6013-638-g4-freetsa-root.md, iteration 3 (SHA-256 LF d9a1e646...49fc, equal to plan_content_hash in the committed gate .qor/gates/2026-11-12T1524-662da3/plan.json, iteration 3)
- Risk grade: L3 (production trust anchor for G4 checkpoint witnessing)
- Audit date: 2026-11-12

## Verdict: PASS

The trust anchor is the genuine FreeTSA Root CA, independently re-derived. Exactly one root is trusted, with no fallback. No trust is widened and no fail-closed behaviour is weakened: since iteration 2 nothing under tools/, FailSafe/ or .gitignore changed, and the #647 merge brings in only three documents. Both iteration 2 violations are remediated: the merged docs/ and tools/g4/ contain no statement contradicting the committed trust state, and every factual claim in the plan's iteration 3 section was verified true. The g4 and docs suites pass, the ledger is clean and append-only, and a fresh live qualification run met 42 of 42 expectations. Non-blocking notes follow.

## Check 1: root identity, re-derived independently

Commands (Git Bash, OpenSSL 3.5.7, scratch directory outside the worktree):

    curl -sS -o live.pem https://freetsa.org/files/cacert.pem
    curl -sSL -o wb.pem "https://web.archive.org/web/2019id_/https://freetsa.org/files/cacert.pem"
    curl -sSL -o trbs.pem https://raw.githubusercontent.com/trbs/rfc3161ng/master/data/freetsa_cacert.pem
    sha256sum < f ; openssl x509 -in f -outform DER | sha256sum
    git show 9a9dc0aa:tools/g4/tsa-roots/freetsa-root-ca.pem   (then the same two hashes)

| Source | File SHA-256 | DER SHA-256 |
|---|---|---|
| committed blob at 9a9dc0aa | 2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438 | a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc |
| live https://freetsa.org/files/cacert.pem | same | same |
| Internet Archive 2019 capture (id_) | same | same |
| GitHub trbs/rfc3161ng data/freetsa_cacert.pem | same | same |

- The DER SHA-256 equals the owner's candidate and the single sha256 in tools/g4/tsa-policy.json. No mismatch; the STOP condition does not apply.
- The committed PEM holds exactly one certificate (one BEGIN line). Subject = issuer = O=Free TSA, OU=Root CA, CN=www.freetsa.org, emailAddress=busilezas@gmail.com, L=Wuerzburg, ST=Bayern, C=DE; valid 2016-03-13 to 2041-03-07.
- tools/g4/tsa-policy.json at 9a9dc0aa: schema failsafe-g4-tsa-policy/v1, status selected, exactly one trustedRoots entry, certificatePath tools/g4/tsa-roots/freetsa-root-ca.pem. Its file SHA-256 is 738f5cb1...5bf670, equal to the policy hash recorded in run3/results.json. git ls-tree lists only that one file under tools/g4/tsa-roots.

Result: PASS.

## Check 2: prior violations remediated, factual claims, verifier output

Commands:

    git diff 5836d38e 9a9dc0aa -- docs/releases/
    git grep -n -i -E "TSA_POLICY_UNSELECTED|no TSA is selected|selected no TSA|pending-owner-decision|policy is pending|under (independent )?audit|admission.*PENDING|not yet authorized|Do not turn|neither FreeTSA|NOT EXECUTED|Nothing below|Step B" 9a9dc0aa -- docs tools/g4 ':!docs/META_LEDGER.md'
    git grep -n -i -E "tsa-policy|tsa-roots|FreeTSA|DigiCert" 9a9dc0aa -- docs tools/g4 FailSafe/extension/scripts ':!docs/META_LEDGER.md'
    git ls-remote origin fix/638-g4-owner-decision-proposal feat/638-g4-freetsa-root main
    gh pr view 657 --json body,isDraft,headRefOid,createdAt,state
    gh pr view 647 --comments
    node FailSafe/extension/scripts/g4-verify-checkpoint.cjs --repo-root .

Iteration 2 V1 items, at 9a9dc0aa:
1. V6_0_13_G4_TSA_OWNER_SELECTION_2026-11-12.md line 3 now reads "Technical trust admission is DONE ... Release qualification is PENDING." Fixed.
2. The same file, line 16 heading now reads "items 1 to 3 done 2026-11-12; items 4 and 5 not yet authorized or completed". Items 2 and 3 carry "Done" annotations. The original item 3 instruction ("Do not turn status to selected until ...") is kept but followed by "Done: the root is committed ... and the policy is selected with that one root." Fixed.
3. V6_0_13_G4_OWNER_DECISION_RECORD_PROPOSED.md: line 13 says the policy and root are committed and the verifier reports BLOCKED NO_CHECKPOINTS; the item 3 cell ends "single-root policy committed"; the section 2a row lists "None" as owner authorization still required; section 4 and Step B are marked done, Steps A, C and D still NOT EXECUTED. Fixed.
4. V6_0_13_G4_OWNER_DECISIONS.md line 5 now says the single-root policy is committed and the verifier reports BLOCKED NO_CHECKPOINTS. Fixed.
5. G4_WITNESS_OPERATIONS.md (from iteration 2) is unchanged and still accurate.

The remaining grep hits are historical and labelled as such: PROPOSED.md line 13 ("At the 2026-11-11 checkpoint ... pending-owner-decision") and line 14 ("superseded"); tools/g4/enroll-tpm-key.ps1 ("NOT EXECUTED BY ANY AUTOMATION", a script header). TSA_POLICY_UNSELECTED now appears only in verifier source. The DigiCert recommendation in OWNER_DECISIONS.md is under "Recommendation (not a decision)" and is declared superseded in the status line and in item 3. No statement in docs/ or tools/g4/ says that no TSA is selected, that the policy is pending, that admission is pending, that the policy PR is under audit as an unmet condition, that the verifier returns TSA_POLICY_UNSELECTED on this repository, or that Step B is not executed.

Iteration 2 V2 / plan iteration 3 factual claims:
- `git ls-remote origin fix/638-g4-owner-decision-proposal` returns 5836d38e309fc62f3092c2175ad803925a0d3ef5. True. The remote feat/638-g4-freetsa-root is 9a9dc0aa; main is 29b819fe.
- dca93572 has parents 0aa0bf7d and 5836d38e. True (stacked).
- PR #657: isDraft true, state OPEN, head 9a9dc0aa, created 2026-11-12T15:44:05Z. The body states "Merge precondition: PR #647 merges first", says the branch is stacked on #647, and says "Do not merge without a PASS." True.
- PR #647 (draft, head 5836d38e): its latest comment states "Merge order: this PR first, then #657, which is stacked on this branch." True.
- git diff 29b819fe 5836d38e touches only the three #647 documents. A standalone #647 merge keeps the "until it merges" conditional wording, which is true before #657 lands.

Verifier output on the worktree at 9a9dc0aa:

    [g4-verify] mode: diagnostic (NOT release evidence)
    [g4-verify] BLOCKED NO_CHECKPOINTS: no checkpoints to verify
    exit=2

With --release and no inputs: BLOCKED RELEASE_INPUT_MISSING, exit 2. Both fail closed, and both match the documents.

Result: PASS.

## Check 3: no widening of trust or weakening of fail-closed behaviour

- git diff --stat 5288dde6 9a9dc0aa -- tools .gitignore FailSafe is empty. The root, the policy, the .gitignore negation and the pin test are byte-identical to what iteration 2 audited.
- What the #647 merge brings in (git diff 29b819fe 5836d38e): three Markdown files under docs/releases/. No code, configuration, workflow or ignore rule.
- .gitignore (diff vs baseline): only `!tools/g4/tsa-roots/*.pem` plus a comment, after `*.pem` and `*.key`. It un-ignores only direct-child .pem files of tools/g4/tsa-roots and confers no trust; trust comes only from the policy digest. Keys stay ignored. (The iteration 2 report's check-ignore matrix still applies, since the file is unchanged.)
- No file under FailSafe/extension/scripts changed. Unselected or empty policy -> BLOCKED TSA_POLICY_UNSELECTED, digest mismatch -> REFUSED TSA_ROOT_MISMATCH, missing root -> REFUSED TSA_POLICY_MISSING, forged same-DN root -> REFUSED TOKEN_INVALID, --tsa-ca in release mode -> BLOCKED TSA_OVERRIDE_NOT_RELEASE, public roots only -> REFUSED TOKEN_INVALID. All re-observed live in Check 6.
- No .github/workflows change.

Result: PASS.

## Check 4: test suites

Commands, run from FailSafe/extension:

    node --test src/test/scripts/g4*.test.cjs   -> tests 109, pass 109, fail 0
    node --test src/test/docs/*.test.cjs        -> tests 145, suites 15, pass 145, fail 0

I did not run the full npm run test:node, so the 1091/2 figure in the plan and PR body is not independently confirmed.

Result: PASS.

## Check 5: ledger

Commands:

    <qor-env>\python.exe -I -m qor.cli verify-ledger --post-anchor
    git diff 29b819fe 9a9dc0aa -- docs/META_LEDGER.md
    git show 9a9dc0aa:<iter1 and iter2 reports> | tr -d '\r' | sha256sum

- Output ends "post-anchor clean (boundary=#382)", exit 0, with OK lines for #955, #956 and #957 (chain hash verified, post-anchor).
- The ledger diff is one hunk (@@ -36451,3 +36451,43 @@) at the end of the file, 0 removed lines, 41 added lines: Entries #956 and #957 only.
- Content hashes: #956 = 447d013d...89153e and #957 = 234d2c66...b0fd7a. Each equals the LF-normalised SHA-256 of the committed iteration 1 and 2 report.
- Fairness of #957: it quotes the iteration 2 report accurately. That covers: the sources and digest; no widening; BLOCKED NO_CHECKPOINTS; 109/109 and 145/145; ledger clean; the offline token checks; V1 (the selection record still saying PENDING, and PROPOSED still saying "policy PR under audit"); V2 (the remote-branch and precondition claims); and N2 (the nonce-marker crash after three tokens). It omits N1 and N3 to N5, which are not material. #956 was found fair by the iteration 2 audit and is unchanged.

Result: PASS.

## Check 6: evidence (corrected script and run3)

Script change since iteration 2 (git diff 5288dde6 9a9dc0aa -- scripts/): one case in qualify-part-a.cjs. The nonce flip at marker 0101ff0208 is replaced by `flip(b, at(b, "180f", 17))`, the byte right after the 15-byte GeneralizedTime (tag 18, length 0f) of genTime, which lies inside the signed TSTInfo. Nothing else changed.

Committed run3, offline against the committed root (no network):

    openssl ts -verify -queryfile <d>/token.tsq -in <d>/token.tsr -CAfile tools/g4/tsa-roots/freetsa-root-ca.pem -untrusted <d>/chain.pem.txt

- run3 part-a token-1..3: Verification: OK. run3 part-b-base-checkpoints g4-000001 and g4-000002 (timestamp.tsq/tsr, tsa-chain.pem.txt): Verification: OK.
- token-1 against the Git Mozilla bundle: FAILED.
- All six run3 malformed-*.tsr against token-1's query: FAILED.
- run3/console.log ends "42/42 expectations met". results.json records policySha256 738f5cb1f1c094e30ca0069a008a9c213dcb9faf1a4ced862933c2fcc15bf670, equal to the committed policy file.

Live re-run (5 FreeTSA requests, random digests, output outside the worktree):

    node .failsafe/governance/evidence/g4-freetsa/scripts/qualify-freetsa.cjs C:/dev/mythologiq/FailSafe-g4tsa <scratch>/iter3audit/qual

- 42/42 expectations met, exit 0. Tokens were granted at genTime 2026-11-12T15:47:14Z, 15:47:16Z and 15:47:18Z, signed by the published tsa.crt, and each verified against the pinned root alone.
- Part B ran fully: release verification PASS OK, mode:release, 0 limitations, over 2 real FreeTSA-witnessed checkpoints. Every refusal, block and outage case gave the expected code.
- The script is now reproducible, which closes iteration 2 N2.

README run3 section: accurate. It describes the cause of the crash, the replacement case and the 5 extra requests, and keeps run2 as produced. The query count ("15 from the implementer, 8 more from independent auditors") was correct at the commit: 5 + 3 auditor requests. This audit adds 5.

Result: PASS.

## Check 7: overstatement and Section 4 razor

- Plan iteration 3 claims (remote head, stacking merge, three records updated, merge order, PR body precondition, #647 comment, 42/42 run3, ASCII cleanup, gates committed): each verified true (Checks 2, 5, 6). The plan and README contain 0 non-ASCII bytes. The committed gate plan.json is iteration 3 and its hash matches the plan.
- The PR body's "VETO #957 ... Both are remediated. The iteration-3 audit is pending" was accurate when written.
- Razor: one changed line of evidence tooling, no product code. Script sizes are 92, 125 and 143 lines (each under 250). Functions are unchanged in shape: largest about 20 lines, nesting at most 3, no nested ternaries. PASS.
- Other passes: Security PASS (public certificates only; no secrets or keys; the run3 test signer certificate is public, and its key was not retained). Ghost UI not applicable. Dependencies: none added. Orphans: none (the test is in the g4*.test.cjs glob; the scripts are documented manual evidence tools). Macro architecture: the single source of truth is tsa-policy.json plus the root blob, and the documents now agree with it.

Result: PASS.

## Violations

None.

## Non-blocking notes

- N1 (carried, pre-existing verifier gap): policyCaFile hashes only the first certificate of a root file but trusts all of them. The committed file holds one certificate and is pinned by file SHA-256 in the test. The plan places the fix in the separate verification PR.
- N2: two sentences use the present tense "under independent audit (ledger Entries #956 onward)": selection record line 3 and PROPOSED.md line 13. Both also say the policy is committed and admission is DONE, so they do not contradict the trust state. After merge, "admitted through the independent audit recorded from Entry #956" would be the more exact reading.
- N3: selection record item 1 says the evidence is "on branch feat/638-g4-freetsa-root". After merge it is on main. The path stays correct.
- N4 (#647 content, not introduced here): OWNER_DECISIONS.md item 3 says "the 2026-11-10 recommendation of DigiCert below is superseded", but the recommendation is above. The 2026-11-10 sentence "None has been given" stands under a status line that declares the 2026-11-10 text historical.
- N5: the replacement rejection case (byte after genTime) is rejected at ASN.1 decoding ("pkcs7 to ts tst info failed"), not at the signature check. Tamper detection over signed TSTInfo content is still shown by the genTime-digit case (digest failure). The README's "still inside the signed TSTInfo, and it is rejected" is accurate.
- N6 (carried): unknown fields in tsa-policy.json are neither pinned nor rejected. They have no trust effect today.
- N7: the full npm run test:node figure (1091/2) was not re-run by this auditor.

## Constraints observed

Read-only except this report. No commit, push, branch, PR edit or comment, key enrolment or TPM access. No ledger, gate or shadow-genome file was modified, per the caller's constraints, so the skill's ledger and shadow-genome steps were not performed. Scratch work was outside the worktree. External traffic:
- GETs of the public root from freetsa.org, web.archive.org and raw.githubusercontent.com;
- read-only gh and git ls-remote queries;
- 5 RFC 3161 requests over random digests from the qualification script.

No repository content, path or secret was sent. git status --short in the worktree was empty before and after, apart from this report. The report is matched by the .failsafe/ ignore rule, so it must be force-added if committed.

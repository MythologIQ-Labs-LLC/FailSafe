# SUBSTANTIATE ledger entry (VETO; not a SESSION SEAL)

Append to docs/META_LEDGER.md directly after Entry #973, in the same ordered step as the substantiate-doc-edits.md edits. The text between the markers is ASCII only. Content Hash = SHA256 of the LF-normalized `.failsafe/governance/evidence/issue-707/SUBSTANTIATE.md` (`ledger_hash.content_hash`); Chain Hash = SHA256(content_hash + "|" + previous_hash). Before appending, recompute both hashes and verify them. If SUBSTANTIATE.md has changed since, they will differ and this entry must be regenerated.

----- BEGIN ENTRY -----

### Entry #974: SUBSTANTIATE - plan-707-voice-dependency-isolation (iteration 3) VETO; not sealed

**Timestamp**: 2026-11-23T06:10:24Z
**Phase**: SUBSTANTIATE
**Author**: Judge
**Session**: `2026-11-23T0340-d5e334`
**Risk Grade**: L3
**Verdict**: VETO
**Entry ID**: `95ae924f0724`
**Target**: PR #712, origin/main 0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc ... f4251d8908e27d5ad088a7150b21d1c69afe7521, against `.failsafe/governance/plans/plan-707-voice-dependency-isolation.md` (iteration 3, sha256 6191b7a3218fd639b0925ceffcb0e00f65a58ea9ce48176f5470a520776bfbe7)
**Report**: `.failsafe/governance/evidence/issue-707/SUBSTANTIATE.md` (Content Hash = SHA256, LF-normalized)
**Gate**: `.qor/gates/2026-11-23T0340-d5e334/substantiate.json` (verdict FAIL)
**SSDF Practices**: PO.1.4, PS.2.1, PW.1.1

**Content Hash**: `d53edc5973afd55701d2a066fb637c2ff335a6c6c570e1163bddf389a83a7f77`
**Previous Hash**: `77d3bfc13666326cd8d9f9afd8bc18021c3fe09f828bb55075195a8ea9d78108`
**Chain Hash (Merkle seal)**: `81dba9657d2bff4d9e45f4ebf07d016ca75f9472e038228cab33d26cb964467e`

**Decision**: SUBSTANTIATE VETO for plan-707 iteration 3 (PASS #972, IMPLEMENT #973), by a fresh-context independent Judge; the session is NOT sealed. Reality matches Promise for the #707 change, verified by execution. fix.patch (sha256 2ff29ced70c74795f0c3a9c0393a710c201308b78315ff41fe69ddd07ada8458, archive 89e9f70ac7ed174941c9c05630595b937663a7f967fb2f7180733233373e5377) applied to the a465bd85 blobs is blob-identical to 477955a7. Phase 1b, prerelease and oversized-bound mutations each fail their test, and the baseline red run fails. The TS-AST body digests give 30 names, 29 equal test bodies, the 1 declared exception with its assertion lines unchanged, and 3 equal helpers. Every #712 function and test body is 40 lines or fewer with nesting at most 3; bundle.cjs main is 93 and the file is 296 lines. Focused Windows run: 36 passing, 11 pending (exactly C8), 0 failing. verify:voice-pins exits 0 on Windows. Lint has 0 errors. Local test:node: 1160 pass and 1 fail, the pre-existing g4Witness full-clone premise, which passes on the depth-1 CI checkout. C2: run 45118465441 at f4251d89 checked out merge f01c36c9 (parents 0c0e30e0 and f4251d89, tree equal to the head tree) and ran 35 vendor and 12 packaging tests, all passing and none pending; the extension host ran 6215 passing and 15 pending, and the two #532 suites passed 10/10 and 71/71. Conditions C1-C8 are met. The intent lock is VERIFIED. Ledger post-anchor is clean, and the #970-#973 hashes recompute. Blocking (S1): skill Step 4.7 strict doc_integrity raises ValueError, an ABORT with no waiver path: the 'Vacuous pass' glossary home (qor/references/glossary.md:111) names a gitignored RESEARCH_BRIEF that is absent on this host. This is pre-existing at origin/main and was flagged by audit #972, and it is the only 4.7 error. Disclosed: publication_boundary_lint rc 1 (528 at origin/main; #712 records add 9 generic OS-path findings); the secret_scanner pre-existing ledger fixture will block a staging that includes META_LEDGER.md unless the fixture token is allowlisted; doc currency WARN (README/CHANGELOG, no release in scope); UNPLANNED: docs/architecture/integrations/acp-devin.md citation rebind in 04c69c85, forced by the bundle.cjs line shift and verified by FX1003; planned files missing: none; Step 7.5/7.6/9.5.5 SKIP (no root version manifest; the plan forbids bump, tag or release). Required next action: point the glossary home at an existing tracked file (recorded as UNPLANNED), prepare the allowlist, and re-run /qor-substantiate. No commit, tag, release or PR state change was made.

----- END ENTRY -----

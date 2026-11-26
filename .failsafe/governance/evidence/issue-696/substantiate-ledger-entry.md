# SUBSTANTIATE ledger entry (SESSION SEAL, PASS)

Appended to docs/META_LEDGER.md directly after Entry #994 by the Judge on 2026-11-26. Layout: the file ended with Entry #994, a blank line and `---`; appended a blank line, the text between the markers, a blank line and `---`, then a final newline. The working copy is CRLF (`git ls-files --eol`: `i/lf w/crlf`), so the entry was written with CRLF and git stores LF. ASCII only (checked with `str.isascii()`).

Hashes (skill Step 6.8 / Step 7; GAP-GOV-01): Content Hash = `ledger_hash.content_hash` of the audited plan `.failsafe/governance/plans/plan-696-g4-witness-fixtures.md` (LF-normalized; equal to its raw sha256), the same binding as the #984 and #991 SESSION SEALs. Previous Hash = the Chain Hash of Entry #994. Chain Hash = `ledger_hash.chain_hash(content_hash, previous_hash)`. All four values passed `hash_guard.validate_sha256`. Entry ID = `entry_id.derive_entry_id("2026-11-26T00:53:13Z", "SUBSTANTIATE", content_hash)`.

----- BEGIN ENTRY -----

### Entry #995: SESSION SEAL - plan-696-g4-witness-fixtures (iteration 2)

**Timestamp**: 2026-11-26T00:53:13Z
**Phase**: SUBSTANTIATE
**Author**: Judge
**Session**: `2026-11-25T2335-247ff7`
**Risk Grade**: L3
**Verdict**: PASS (Reality = Promise, with disclosures)
**Entry ID**: `1b3ec379e80e`
**Plan**: `.failsafe/governance/plans/plan-696-g4-witness-fixtures.md` (iteration 2, sha256 49019d3a53590799959d0ce005fd28edc66abc7decf880b4915a0a07ddbff50d; VETO #992, audit PASS L3 #993, implement #994)
**Target**: draft PR #737 (issue #696), origin/main 0550c4135c1d6d29aa03b2107f7b16aa78d08422 ... 939a53b9515cc26bb85b334cfab7399cf0d94248 (implementation e32bb62f6f373a9eb4dab872d45b720f0ca5baf0, cherry-pick -x of 834607018a3166a59351f59261d67cbbb7c6ef98)
**Report**: `.failsafe/governance/evidence/issue-696/SUBSTANTIATE.md`
**Gate**: `.qor/gates/2026-11-25T2335-247ff7/substantiate.json` (verdict PASS)
**SSDF Practices**: PS.2.1, RV.2.1
**Feature Inventory**: Total: 805 / verified: 765 / unverified: 0 / n/a: 40
**Newly unverified**: none (feature_index_verify --snapshot 2026-11-25T1958-4f4867 rc 0)
**Spec Corpus Hash**: none (spec_fold: no deltas declared)

**Content Hash**: `49019d3a53590799959d0ce005fd28edc66abc7decf880b4915a0a07ddbff50d`
**Previous Hash**: `2230077dd50499dfde405446695c401fa25eab69366e43c34a2759f108f6f381`
**Chain Hash (Merkle seal)**: `2d777ace1916aadeaee236cfefeafee9091d0233c003e2c2edc802cdd3aa0da8`

**Decision**: SESSION SEAL for plan-696 iteration 2 (#696), by a fresh-context independent Judge. Reality = Promise, with disclosures. Custody: e32bb62f (single parent 0550c413) changes only g4Witness.test.cjs (+32/-6, blob 59abc40d = 83460701's); 939a53b9 changes no source. H3: Node v22.23.5 zip 4a191082... equals the freshly downloaded nodejs.org SHASUMS256 line and node.exe 247e9693... equals the zip member; fresh full clone main 0550c413 RED 10/9/1 (stale real-repo case sees PASS OK g4-000001), candidate GREEN 11/11, head worktree 11/11. H1/H2: the two CLI fixture cases pass; mutants696.py M1-M7 KILLED under Node 22, map identical; verifier, library and g4Scenario sha256 unchanged after mutants and probe, git status clean. H5: teardown probe T1-T3 refused with sentinel kept, T4 deleted, identical to the record; junction removed without following, leaked work dirs removed, temp dir back to its pre-run state. H6: depth-1 main 10/10 (masked), depth-1 head 11/11; Linux exact-head PR Full Test 45730044400 success on depth-1 merge 1fb4547 (ok 533, ok 534, not skipped). H4: no change under scripts/, g4Scenario, g4TestPki, tools/g4 or witness evidence. Razor: 163-line file, added bodies 2-8 lines, nesting 1, no nested ternary, stub or console.log. Ledger #992-#994 recompute. Local test:node under Node 22 1199/1189 pass/0 fail/10 skipped. Exact-head CI at 939a53b9, all seven runs success: PR Full Test (extension host 6249 passing 15 pending, architecture 19, test:node 1164 pass 0 fail 35 skipped, test:ui 264 passed), Repo Standards pull_request and push, Cross-platform compile, OSS SAST, Dependency Review, VSIX Proprietary Guardrails. Gates: governance-health 8/8 OK; intent_lock VERIFIED; skill_admission ADMITTED; gate_skill_matrix 0 broken; secret_scanner, procedural_fidelity, dod_check, merge_velocity (strained) rc 0; skill_size_budget WARN only; data_api_acl SKIP with a disclosed-skip event; install_drift OK; doc_integrity strict PASS; governance-index enforce rc 0; doc currency no warnings; ledger_commitment OK; ac_close_guard WARN only. Disclosures: N1 publication_boundary_lint rc 1, 558 at main and 565 here, the 7 added absolute local paths in the pushed teardown696.txt (pre-existing class); N2 Entry #994 Target says iteration 4 for iteration 2; N3 Judge relied on CI for npm test and prepush; N4 release-mode and installed-host verification not claimed by the audited plan; N5 substantiate_gates needs --skill and the plan path was passed explicitly; N6 two PROCESS_SHADOW_GENOME events; N7 uncommitted .qor/session/current; N8 Node 22 put first on PATH for the scripts. SKIP or inapplicable: version_applicability and Steps 7.5/7.6/9.5.5 (no root manifest; hotfix), seal_artifacts, dist_compile, continuity_gate. BACKLOG has no open blockers. Not merged, released or tagged; no version bump. Owner GO remains outstanding.

----- END ENTRY -----

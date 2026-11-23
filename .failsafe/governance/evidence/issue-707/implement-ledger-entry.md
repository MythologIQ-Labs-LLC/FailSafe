# IMPLEMENT ledger entry

----- BEGIN ENTRY -----

### Entry #973: IMPLEMENT - plan-707-voice-dependency-isolation (iteration 3); not sealed

**Timestamp**: 2026-11-23T05:26:06Z
**Phase**: IMPLEMENT
**Author**: Specialist
**Session**: `2026-11-23T0340-d5e334`
**Risk Grade**: L3
**Target**: `.failsafe/governance/plans/plan-707-voice-dependency-isolation.md` (iteration 3, sha256 6191b7a3218fd639b0925ceffcb0e00f65a58ea9ce48176f5470a520776bfbe7)
**Report**: `.failsafe/governance/evidence/issue-707/IMPLEMENTATION.md` (Content Hash = SHA256, LF-normalized)
**Gate**: `.qor/gates/2026-11-23T0340-d5e334/implement.json`

**Content Hash**: `a701b695710c3cab25ae22fefff312e35e3bd641a061875505ff87c285b86de8`
**Previous Hash**: `8cd8b4b6f0859b44d559f2df0f6a11309604fa9bd3e9b35a6991880495b9d2c8`
**Chain Hash (Merkle seal)**: `77d3bfc13666326cd8d9f9afd8bc18021c3fe09f828bb55075195a8ea9d78108`

**Decision**: IMPLEMENT record for plan-707 iteration 3 after independent PASS L3 Entry #972; the iteration 1 and 2 VETOs (Entries #970, #971) stand. Commits 477955a7, 3d73c539, 4c49f98c, 04c69c85, b7c3cd0b on fix/707-isolate-optional-voice-vendoring over audited source a465bd85. Phase 1 applied fix.patch verbatim (sha256 2ff29ced70c74795f0c3a9c0393a710c201308b78315ff41fe69ddd07ada8458) after the LD1 checks. Phase 1b: the strengthened oversized-asset test fails under the recorded readFileSync mutation and against the baseline source. Phase 1c: .gitattributes -text for the piper and whisper vendor directories; check-attr red then green; verify:voice-pins exit 0 on Windows. Phase 2: vendor-voice split into four modules plus the CLI, tests into five files plus support; body-digest inventory 30 names, 29 test and 3 helper digests equal, one declared exception; packageVoicePack(repoRoot, run) seam with prerelease cleanup (red, green, guard mutation fails); assertCommittedVoiceAssets refuses oversized assets; vendor-piper.cjs deleted. Razor: every Phase 2 file at most 198 lines, no function or test body over 40, bundle.cjs main 93 and file 297. Windows focused run 36 passing, 11 pending (the 11 win32-skipped tests), 0 failing. Full gate: lint 0 errors, test:ui 264, build:package 6 assets, test:node one fixed citation and the pre-existing g4Witness failure, npm test 4 Windows-host timeouts in #532 suites that #712 does not touch. Outstanding: condition C2 (post-split Linux run) and substantiation. This entry is not a seal, merge or release.

----- END ENTRY -----

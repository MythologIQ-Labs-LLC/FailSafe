# Pending META_LEDGER entry (not yet appended)

Append the block between the markers to `docs/META_LEDGER.md` once, in order, after chain verification. It was computed against ledger head Entry #969 (chain 9aecdbf5f3650ebce54675fbdccfecc2874347076821883cbe892081c367ffc9), which is the head at both a465bd85 and origin/main 0c0e30e0. If the head differs at append time, renumber the entry and recompute the Previous Hash and the Chain Hash (qor.scripts.ledger_hash.chain_hash(content, prev) = SHA256(content + "|" + prev)). Content Hash = SHA256 of AUDIT-PLAN-iter1.md, LF-normalized; if that report is edited, recompute it.

----- BEGIN ENTRY -----

### Entry #970: GATE TRIBUNAL - plan-707-voice-dependency-isolation (iteration 1) VETO

**Timestamp**: 2026-11-23T03:54:10Z
**Phase**: GATE
**Author**: Judge
**Session**: `2026-11-23T0340-d5e334`
**Risk Grade**: L3
**Verdict**: VETO
**Target**: `.failsafe/governance/plans/plan-707-voice-dependency-isolation.md` (iteration 1, sha256 283c74365940e83fa321a3c6606eb1d0b08d36e5b9835fa71dead7e605f0fc60)
**Report**: `.failsafe/governance/evidence/issue-707/AUDIT-PLAN-iter1.md` (Content Hash = SHA256, LF-normalized)
**Gate**: `.qor/gates/2026-11-23T0340-d5e334/audit-iter1.json`

**Content Hash**: `d8918b322d732d117a27606930e75c385a24826af64fe90ec581c10f1115ac1b`
**Previous Hash**: `9aecdbf5f3650ebce54675fbdccfecc2874347076821883cbe892081c367ffc9`
**Chain Hash (Merkle seal)**: `2ab41b3864fe196e163c5500e13bbdbf96d5b74bedd4549424693f7132ee8949`

**Decision**: GATE TRIBUNAL VETO for plan-707-voice-dependency-isolation.md iteration 1 (PR #712 head a465bd85249862a9e355ad584a338ca6fc9aeb25, merge base 0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc, plus fix.patch sha256 2ff29ced70c74795f0c3a9c0393a710c201308b78315ff41fe69ddd07ada8458), by a fresh-context independent auditor, solo mode; risk grade L3. Eight grounds. V1 test-failure: the patch test "refused without reading" counts io.openSync on a copied fs object, cannot see io.readFileSync, and a mutant restoring the unbounded read before the size check still passes it. V2 coverage-gap: verify:voice-pins exits 1 at head on a default Windows checkout (core.autocrlf=true, no .gitattributes rule for the vendor assets; piper.min.js and transformers.min.js check out CRLF), and no CI command or DoD item runs it. V3 coverage-gap: package-voice-pack.cjs failure cleanup accepts only X.Y.Z (line 64) while readVersion accepts prereleases (line 84); untested. V4 razor-overage: vendor-voice.cjs main nesting 4 is kept, a 44-line test body (603-646) is moved verbatim, and LD5 is incomplete. V5 specification-drift: the exclusion says bundle.cjs is untouched, but the planned diff grows it from 313 to 323 lines. V6 orphan-file: scripts/vendor-piper.cjs has no remaining caller. V7 coverage-gap: the Phase 2 proof compares test names only, 7 of 28 tests are pending on Windows, and no POSIX run is required. V8 specification-drift: the patch refuses an empty existing asset that bundle.cjs:38 tells the operator to repair with vendor:voice; undisclosed. Verified clean: all LD citations reproduce; git apply --check passes; SHA-512 pins match the live registry tarballs; the lock is consistent (npm ls offline) with no onnxruntime, sharp or @img entries; the patched suite passes on Windows (23 passing, 7 pending with bsdtar); the red run fails as planned. Required next actions: Governor amends the plan (V1, V3, V5, V7, V8); /qor-debug (V2); /qor-refactor (V4); /qor-organize (V6); re-run /qor-audit.

---

----- END ENTRY -----

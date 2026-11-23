# Pending docs/SHADOW_GENOME.md entry (not yet appended)

Append once, in the same ordered records step as the ledger entry. Number it after the current last Failure Entry in docs/SHADOW_GENOME.md at append time.

----- BEGIN ENTRY -----

## Failure Entry #[next]

**Date**: 2026-11-23T03:54:10Z
**Verdict ID**: GATE TRIBUNAL plan-707-voice-dependency-isolation iteration 1 VETO (session 2026-11-23T0340-d5e334; report .failsafe/governance/evidence/issue-707/AUDIT-PLAN-iter1.md)
**Failure Mode**: COMPLEXITY_VIOLATION; GHOST_PATH (untested qualification path); ORPHAN

### What Failed
The native plan for PR #712 (#707 voice dependency isolation) together with the supplied bounded-read patch.

### Why It Failed
- A regression test claimed "refused without reading" but spied on io.openSync, which fs.readFileSync never calls. A mutant that restores the exact defect passes it.
- The new read-only release-integrity command (verify:voice-pins) compares working-tree bytes with no .gitattributes protection, so it fails on every default Windows checkout. The plan never ran it.
- The plan's Razor measurements were incomplete: it kept a nesting-4 main and moved a 44-line test body "verbatim". Its exclusion text called a file it modifies untouched.
- Behaviour-preservation of a module split was "proved" by test names only, on a host where 7 of 28 tests skip.
- A legacy wrapper (vendor-piper.cjs) was left with no caller.
- The packaging failure cleanup's version guard is narrower than the accepted version format.
- The patch silently removed the documented repair path for an empty existing asset.

### Pattern to Avoid
- A spy must intercept the code path the defect actually uses. Prove each regression test with a mutant that reintroduces the defect.
- Any byte-equality check against the working tree must account for line-ending conversion, or the files must be marked -text/binary as the G4 files are.
- A "verbatim move" claim must be reconciled with the Razor limits before the plan asserts compliance.
- Prove a split by body digests on a host where the moved logic actually executes.
- Boundary text must not call a file untouched when the scoped diff changes it.

### Remediation Attempted
None yet. VETO issued; the Governor must amend the plan, and the defects route to /qor-debug (V2), /qor-refactor (V4) and /qor-organize (V6).

----- END ENTRY -----

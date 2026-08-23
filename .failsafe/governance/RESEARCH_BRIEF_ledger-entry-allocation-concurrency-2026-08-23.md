# Research Brief — META_LEDGER entry-number allocation under concurrent governed cycles

**Date**: 2026-08-23
**Analyst**: The Qor-logic Analyst
**Target**: `docs/META_LEDGER.md` entry allocation; `qor.scripts.ledger_hash` chain validator; `qor.scripts.ledger_fragment` canonicalizer
**Scope**: The live Entry #597 collision between open PRs #432 and #433; the validator's actual detection surface; upstream remedies available but unadopted
**Toolchain under test**: `qor-logic` 0.155.0, `qor-logic-plus` 2.31.3 (venv `D:\Myth-TechForge\Alden_Calindron\venv`)

---

## Executive Summary

Open PRs #432 and #433 each append a **different `### Entry #597`** to `docs/META_LEDGER.md`, both chaining off Entry #596's chain hash. Both entries are internally honest — their recorded content and chain hashes independently reproduce — so the defect is purely the collision.

The critical finding is not the collision itself but that **the operative gate cannot see it**. `verify_post_anchor()` — the function `governance-health` reports and the one the release gates check — returns **exit 0, "post-anchor clean"** on the both-merged ledger, printing `OK Entry #597` twice. The detection logic that would catch it exists and is **self-silencing**: sharing a `previous_hash` is precisely the condition that buys immunity from the check that would flag it, and no attestation is required to earn that immunity.

Upstream already ships the correct fix (Phase 56 fragments, Phase 76 content-addressable Entry IDs). FailSafe has adopted **neither**, and the one mitigation its own `/qor-substantiate` skill declares mandatory has zero occurrences in the last twelve ledger entries.

**Verdict: this is a governance-integrity defect in the consumer, not an upstream gap.** The upstream surface exists; the consumer does not call it.

---

## Findings

### F1 — Allocation is `max(N)+1` computed against the local working copy (RQ1)

`ledger_fragment.next_entry_number()` (`ledger_fragment.py:95-104`) returns `(max(nums) + 1)` over `### Entry #(\d+):` matches in the **local** ledger text. Reproduced directly:

```
next_entry_number(main)         -> 597
```

Both sessions branched from the same `main` (ledger head #596) and both were *correct* to compute 597. There is no reservation, no lock, and no author-time cross-branch check. The race is structural, not a mistake by either session.

Nothing in the repo reserves or validates the number at author time. `.qor/ledger/` **does not exist** — the fragment pipeline has never been used here. Repo-side tooling (`tools/`, `.github/`) contains **zero** references to `ledger_fragment`, `canonicalize_fragments`, `write_fragment`, `work_claim`, or `derive_entry_id`.

### F2 — The operative gate is blind to the collision (RQ2) — **CRITICAL**

Verified empirically by constructing the both-merged ledger and running the real validator, not by reading its docs:

| Ledger | duplicate `#597` | `verify_post_anchor()` |
|---|---|---|
| `main` baseline | no | exit **0** — `post-anchor clean (boundary=#596)` |
| both PRs merged | **yes** | exit **0** — `post-anchor clean (boundary=#597)` |
| remediated (#597/#598) | no | exit **0** — `post-anchor clean (boundary=#598)` |

The collided ledger is **indistinguishable from the remediated one** by the gate. It emits `OK Entry #597: chain hash verified (post-anchor)` twice and reports clean.

Strict `verify()` is not a backstop either: it already exits 1 on `main` because of the disclosed pre-anchor `#331` taint, so its exit code carries no signal about this change. Its stderr grows by exactly the two extra `TAINTED` lines — **no new error class appears**.

**Mechanism — the check is self-silencing.** `verify()` passes `_duplicate_previous_hash_members(entries)` into the tolerated set at `ledger_hash.py:543-545`:

```python
errors += _report_sequence(
    entries, reconciled | grandfathered | _duplicate_previous_hash_members(entries)
)
```

`_sequence_breaks()` then skips any entry in that set (`ledger_hash.py:390-401`). Falsified by re-running the same function with an empty tolerated set:

```
breaks WITH the tolerated set verify() passes : 2   (none mention #597)
breaks with tolerated = EMPTY  (falsifier)    : 4
  -> BREAK Entry #597: previous_hash 5ffb1d60772bd691 was not produced by
     the preceding entry (chain 190c2339c613000e); an entry may have been removed
```

The detector works. It is disarmed by the very condition it detects.

Two aggravating details in the same file:
- **No duplicate-number check exists anywhere.** `_number_gaps()` (`ledger_hash.py:412-419`) reports holes only. On the collided ledger it returns `[158, 298]` — the known gaps — and says nothing about `#597`.
- **The forward-only invariant is enforced on one path but not the other.** `find_grandfathered_entries()` takes `cutoff=207` explicitly to preserve "the forward-only-no-new-grandfathering invariant" (`ledger_hash.py:224-237`), but the `_duplicate_previous_hash_members()` call feeding `_report_sequence` has **no cutoff**. A duplicate created today gets the same free pass as a pre-V1 residual.

### F3 — 18 pre-existing duplicate entry numbers, none fence artifacts

Genuine duplicates already on `main`: `#113, #204(×3), #205(×3), #218, #222–#230, #232–#236`. Confirmed genuine by re-running the count after stripping fenced code blocks with the fragment dialect's own `_FENCE_RE` — the duplicate set is **identical**, so none are quoted-text false positives.

Note the two modules disagree on parsing: `ledger_fragment.next_entry_number` strips code fences (its M2 fix), `ledger_hash.ENTRY_RE` does not. Same artifact, two dialects.

### F4 — Prior occurrence: Entry #447 is only a *partial* precedent (RQ3)

`docs/META_LEDGER.md` Entry #447 (`RECONCILIATION`, Author: Operator) resolved the #397/#401 fork:

```
**Reconciled Entries**: #397, #401
**Scope**: Operator-authorized forward-only reconciliation of 2 duplicate-previous_hash
residual entries (#397, #401) per SG-ConcurrentLedgerRace-A. No sealed entries
renumbered or rewritten.
```

It was **hand-authored** — an operator-signed entry carrying a `Proposal ID` and an `Entry ID` — and honored by `verify()` through `RECONCILED_ENTRIES_RE` (`ledger_hash.py:167`), gated so it only tolerates genuine duplicate-`previous_hash` members and cannot launder content tampering (`ledger_hash.py:491`).

**Reconciliation is structurally unavailable for the #597 case.** `RECONCILED_ENTRIES_RE` captures entry **numbers** (`#(\d+)`). #397 and #401 had *distinct* numbers and a shared `previous_hash`. Two entries both numbered #597 cannot be disambiguated by an attestation line that can only say "#597" — it names both or neither. The precedent does not extend.

The remedy must therefore prevent the duplicate number from landing at all. That is legal here precisely because **neither entry is on `main` yet**: nothing downstream chains off either, so renumbering invalidates nothing.

### F5 — Upstream ships the fix; FailSafe has not adopted it (RQ4)

This is **not** an upstream gap. Two upstream surfaces address exactly this:

- **`ledger_fragment.py` (Phase 56, GH #51)** — module docstring, lines 1-11: workers write fragments to `.qor/ledger/fragments/<uid>.json` and *"do NOT guess `Entry #N`"*; the sealing worker canonicalizes, sorting by `(ts, uid)` and assigning sequential numbers. *"Sequential `Entry #N` is PRESENTATION ONLY post-Phase-56. UID is the cross-worker identity."* `write_fragment` raises on a UID collision with a differing payload (`ledger_fragment.py:57-62`).
- **`entry_id.py` (Phase 76, GH #51)** — content-addressable ID from `(ts, phase, content_hash)` so *"concurrent federation workers cannot produce colliding entry identifiers."*

Adoption in FailSafe:

| Surface | Status |
|---|---|
| `.qor/ledger/fragments/` | **does not exist** |
| `ledger_fragment` / `work_claim` referenced in `tools/`, `.github/`, `.claude/` | **none** |
| `**Entry ID**:` on entries #585–#596 | **0 of 12** |
| `**Entry ID**:` in either colliding #597 | **0 of 2** |

`.claude/skills/qor-substantiate/SKILL.md:382` states each new SESSION SEAL entry **MUST** carry an `**Entry ID**` line derived via `entry_id.derive_entry_id`. It is absent from twelve consecutive entries. Entry #447 *does* carry one (`ebf5fc119e7f`) — so this is a **regression**, not a never-adopted feature.

Adjacent unadopted surface: `work_claim.py` / `work_claim_ledger.py` / `work_claim_policy.py` (Phase 192, ADR-0004) provide claim/conflict semantics (`conflict_detected`, `claim_superseded`) for parallel actors on the same issue/branch.

### F6 — Minimal correct resolution for #597 (RQ5), verified

Both entries' recorded hashes independently reproduce, and **neither content-hash preimage contains an entry number**:

```
SHA256("plan-430-qorlogic-stale-install-upgrade|audit-PASS|2026-08-23")  -> matches recorded
SHA256("plan-233-read-ledger-once|audit-VETO-iter4|2026-08-22")          -> matches recorded
```

So renumbering costs only `previous_hash` + `chain_hash`. `content_hash` is invariant.

**Ordering criterion — upstream's own canonical rule, not a coin flip.** `read_fragments` sorts by `(ts, uid)` (`ledger_fragment.py:76`) and `canonicalize_fragments` assigns numbers in that order (`ledger_fragment.py:118-129`). By timestamp:

- PR #433 / plan-233 — `2026-08-22T00:00:00Z` → **keeps #597**
- PR #432 / plan-430 — `2026-08-23T13:47:52Z` → **becomes #598**

Recomputed values for PR #432's entry:

```
content_hash  (UNCHANGED) 82fd913b69de1c704ce7d5992ec699adc0faa27aea884275ccc739d6f492ad0e
previous_hash (NEW)       594224147b11de45fdae1af139e0461289e4185f5c55c1ce71a234996e96333d
chain_hash    (NEW)       cde08fe4a9d917d3e371a47340b0899fa2f3c470e9dcbdc02946f683056f5a9e
```

Plus the prose reference `(Entry #596 Chain Hash)` → `(Entry #597 Chain Hash)`.

**Verified**, not asserted — the remediated ledger was constructed and run through the validator:

```
duplicate entry numbers >=590  : NONE
post-anchor gate exit          : 0  | post-anchor clean (boundary=#598)
raw sequence breaks in 59x band: NONE      <- the falsifier that fires on the collision
```

The raw-sequence-break falsifier fires on the collided ledger and is silent on the remediated one. That is the check that distinguishes them; the shipped gate does not.

**Merge order is therefore load-bearing**: #433 must merge before #432, and #432 must be rebased and re-chained after.

---

## Secondary findings (recorded, not in scope to fix here)

### S1 — PR #434 creates a second governance root and has no GATE entry

PR #434 changes production Sentinel source (`VerdictEngine.ts`, `VerdictArbiter.ts`, `sentinel.ts`) with **no `docs/META_LEDGER.md` entry at all** — no GATE TRIBUNAL PASS recorded before implementation. This is the same violation Entry #597/plan-430 was retroactively authored to close ("the fix and its tests were implemented and pushed before `/qor-audit` ran").

It also places its plans under `FailSafe/.failsafe/governance/plans/`:

```
FailSafe/.failsafe/  tracked on main            : 0 files
FailSafe/.failsafe/  tracked on PR #434 branch  : 2 files
.failsafe/governance/plans/  tracked on main    : 15 files
```

A new nested governance root that has never existed in this repo. Both PRs #432 and #433 correctly use the repo-root path.

### S2 — PR #433 is a routing violation against Entry #594

Entry #594 states verbatim:

> **Verdict**: VETO (third consecutive) - routed to `/qor-remediate`, **NOT to a fourth plan iteration**
> Required next action: `/qor-remediate`. The target is the process defect — a plan-authoring and self-review habit that produces completeness claims whose falsifying case is never exercised — not a fourth [iteration].

PR #433 delivers exactly the prohibited artifact: plan-233 iteration 4 and a fourth `/qor-audit` VETO. The escalation to `/qor-remediate` recorded at #594 has still not been executed.

This matters beyond bookkeeping: the process defect #594 named — *checks that never exercise their falsifier* — **is the same defect this brief found in `ledger_hash.verify()`** (F2). The pattern the remediation was supposed to address is now confirmed present in the toolchain the governance itself depends on.

---

## Blueprint Alignment

| Claim | Actual finding | Status |
|---|---|---|
| META_LEDGER is a tamper-evident Merkle chain | True per-entry; **duplicate entry numbers are undetected**, and duplicate-`previous_hash` self-tolerates without attestation | **DRIFT** |
| `verify_post_anchor` is the release-gate surface | True — and it returns clean on a forked ledger | **DRIFT** |
| Entry IDs make concurrent append safe (qor-substantiate SKILL.md:382, "MUST") | 0 of last 12 entries carry one; present at #447 | **DRIFT (regression)** |
| Forward-only, no new grandfathering (`cutoff=207`) | Enforced on the chain-math path; **not** on the sequence-break path | **DRIFT** |
| Reconciliation (Entry #447) can resolve this class | Only for *distinct-numbered* duplicates; number-keyed attestation cannot disambiguate two `#597`s | **DRIFT** |

---

## Recommendations

**P0 — unblock the merge queue, in this order.**
1. Merge PR #433 first (keeps #597, earlier `ts`).
2. Rebase PR #432 onto new `main`; renumber its entry to #598 with the three recomputed values in F6.
3. Do **not** merge #432 before #433. Do not merge #434 at all yet (S1).

**P1 — make the collision detectable.** Add a duplicate-entry-number check and stop feeding the unattested `_duplicate_previous_hash_members` set into `_report_sequence`'s tolerated argument; require a `**Reconciled Entries**` attestation or a `<= cutoff` grandfather, matching the chain-math path. This is an upstream change to `qor.scripts.ledger_hash` — surface it to the Qor-logic repo rather than patching the installed package. A consumer-side pre-merge CI check on `docs/META_LEDGER.md` is the local mitigation.

**P2 — adopt the upstream concurrency surface.** Either enforce the `**Entry ID**` line already mandated at `qor-substantiate/SKILL.md:382` (cheap, restores #447-era behavior), or adopt the Phase 56 fragment pipeline so entry numbers stop being authored by hand. The second is the real fix; the first stops the bleeding.

**P3 — execute the `/qor-remediate` that Entry #594 ordered.** It is the recorded next action, it is now four VETOs overdue, and F2 shows its target defect reaches into the validator itself.

**P4 — PR #434 (S1)**: needs a GATE entry before merge and its plans relocated to the repo-root governance path.

---

## Updated Knowledge

For `docs/SHADOW_GENOME.md` — extends `SG-ConcurrentLedgerRace-A` beyond its pre-V1 framing:

> **Concurrent ledger race is live, not historical.** Two sessions branching from the same ledger head both compute the same `next_entry_number` and both are correct to do so. The shipped gate (`verify_post_anchor`) reports a forked ledger as clean, and `verify()`'s sequence-break detector is disarmed by the duplicate condition itself. Detection must happen **before merge**; after merge, the number-keyed reconciliation mechanism cannot disambiguate same-numbered entries. Merge order between ledger-touching PRs is load-bearing and must be sequenced explicitly.

---

## Ledger entry — deliberately withheld

This brief's own `RESEARCH BRIEF` entry would be **the third Entry #597**. Appending it now would deepen the exact fork under investigation. The entry is held until the #597/#598 resolution lands, at which point it takes the next free number and chains off the accepted head. Disclosed rather than silently skipped.

---

_Research complete. Findings are advisory — implementation decisions remain with the Governor._

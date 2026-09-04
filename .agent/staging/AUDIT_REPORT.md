# AUDIT REPORT — plan-fx935-collision-renumber.md

**Session**: 2026-09-04T0430-62ca33 · **Iteration**: 1 · **Risk grade**: L2
**Mode**: solo (`option_b_required: false`)

## VERDICT: PASS

**Verdict**: PASS

*Qualified: a process violation is recorded below. The verdict on the changeset stands; the violation is against the cycle order, not the work.*

The changeset is sound and every falsifier was re-run by the Judge rather than accepted from the plan. **The cycle order was violated**, and that is recorded here as a finding against the process, not against the work.

## Process violation — ordering inversion

`/qor-plan` and `/qor-audit` were skipped. Implementation ran directly from the operator ruling: fixtures, detector, renumber, and FEATURE_INDEX edits all landed in the working tree before any plan existed. The plan under audit was authored afterwards and **declares this in its own body** rather than presenting itself as prospective.

Mitigating, and verified: `git status` shows no commit on this branch, so **no repository mutation landed ahead of the cycle** — the working tree is the only thing that ran ahead. The governance boundary is the first mutation, and it has not been crossed.

Not mitigating: the audit is now reviewing a completed changeset. An audit's leverage is that it can send work back before it exists; that leverage was forfeited here. Had a blocking finding surfaced, the remedy would have been rework rather than redesign.

This is the same class as Entry #601's implement → merge → release → substantiate inversion, and is recorded the same way — a disclosed deviation an auditor can weigh, not a sanctioned path. A severity-2 `gate_override` event accompanies this verdict.

## Falsifiers — re-run, not accepted

The plan explicitly instructed the Judge to re-run rather than trust its claims. Done:

| claim | Judge's observation |
|---|---|
| detector fires on `duplicate-id.md` | `ok 1` |
| detector silent on `clean.md` | `ok 2` |
| live index allocates each id once | `ok 3` |
| FX935 no longer reads as `.qorlogic/config.json` | `ok 4` |
| **control can fail** — collide the clean fixture | `not ok 2 - reports the clean fixture as clean` |

That last row is the one that matters. A detector verified only against a fixture built to trip it proves it can fire, not that it discriminates. Breaking the control proves it does both.

## Findings the plan rests on, confirmed

- FX935 double-allocation is a genuine identifier fork: PR #445 (2026-08-24T16:25:51Z) vs Entry #602 (2026-09-03), each computing `max(FX)+1` against divergent views. Structurally Entry #597, one artifact over.
- FX934 likewise, and the older claim there is the plan for a detector scoped to catch "a FEATURE_INDEX with two FX930 rows" — it collided on its own id before implementation. Both dispositions are operator rulings, correctly recorded as such rather than derived.
- `ledger_commitment` cannot bind any of the last twenty entries: `_ARTIFACT_RE` requires a `**Plan**:` / `**Artifact**:` / `**Brief**:` line; 175 entries carry one, zero of the last twenty do. Mutating Entry #602's plan moved its digest `7e20b449…` to `a8ab7cdd…` with the gate still at exit 0. **Correctly diagnosed as consumer-side**, not filed upstream — the plan records that it was nearly filed as an upstream bug before `_ARTIFACT_RE` was read.

## Scope discipline

The non-goals are load-bearing and correct: not editing `plan-qor169-sprint1-seal-unblock.md` (a sealed content-hash source), not rewriting Entry #602's body, not touching `.qor/gates/**`, and not backfilling `**Plan**:` into sealed entries per the operator ruling. A cycle that "tidied" any of these would have damaged evidence to improve a metric.

## Non-blocking residuals

- N1 The detector sees one repository state and cannot catch a cross-branch collision — which is how both of these arose. Stated in the plan rather than mechanised; the cross-branch case belongs to the dormant `check-governance-structure.cjs` cycle.
- N2 Entries #602-#604 remain unbindable by `ledger_commitment`. Disclosed, per the operator ruling against editing sealed bodies.

## Required next action

`/qor-substantiate`. The seal MUST carry the ordering inversion, not only the outcome.

# AUDIT REPORT — plan-governance-index-publication-status.md

**Session**: 2026-09-04T0055-551683 · **Iteration**: 1 · **Risk grade**: L2
**Mode**: solo (`option_b_required: false`)

## VERDICT: PASS

No blocking findings. The plan's baselines were measured before the assertions were written —
the standing correction adopted at Entry #603 was actually applied this cycle, and it changed
the design: the classification run revealed 14 pattern/template rows (`plan-*.md`,
`AUDIT_REPORT_<plan>.md`, `entry-<N>-body.md`) that a naive existence check would have flagged
as missing. Had the assertion been written from reasoning rather than measurement, it would have
produced 14 false positives on its first run.

## Findings the plan rests on, re-verified by the Judge

| class | count |
|---|---|
| pattern / template rows (skipped) | 14 |
| literal, tracked | 38 |
| literal, untracked, under `.failsafe/` or `docs/` | 15 |
| literal, untracked, **unexplained** | **1** — `confidentiality.md` |

`docs/GOVERNANCE_INDEX.md:66` registers `` `confidentiality.md` (root) `` as Tier 2 while the file
exists nowhere in the repository — not tracked, not on disk. The row's own Owner cell reads
"operator memory + manual", so the row's author knew its nature and still asserted a repo-root
path. Correcting it into the existing `## Out-of-tier paths` section is the right disposition:
that section already exists for precisely this distinction and already holds `.claude/`.

The exclusion barring import of `confidentiality.md`'s contents is correct and load-bearing —
`CLAUDE.md` records that file as holding pricing and tier internals. A plan that "fixed" the
broken row by materialising the file would have leaked confidential material into a public repo.
Called out favourably rather than merely permitted.

## Honest limit on assertion 2

Assertion 2 ("the declared-private prefix list is non-empty and each prefix matches at least one
registered path") fails against `main` **because the section it reads does not exist yet**, not
because a dead prefix was detected. That is a legitimate red-then-green, but it is absence-driven,
and the stated falsifier — a prefix matching nothing — is a *future* condition.

**Mandated at implement**: demonstrate that falsifier by mutation. Add a bogus prefix to the
declared list, confirm assertion 2 fails, remove it, confirm it passes. Without that, assertion 2
is only shown to detect "section missing", which is not what it claims to guard. Recorded here so
the seal can be checked against it.

## Passes cleared

Prompt Injection · Security L3 (no auth/secret surface; the confidentiality exclusion strengthens
this) · OWASP (no `RegExp` built from extracted values — the plan cites the FX938
`js/incomplete-sanitization` finding and carries the lesson forward, which is the correct response
to a CodeQL alert two cycles running) · Ghost UI · Section 4 Razor (one test file, no production
code) · Test Functionality (all three assertions compare against real values; none presence-only) ·
Dependency · Orphan (`run-node-tests.cjs` reaches `src/test/governance/`) · Macro Architecture ·
Feature Test Coverage (FX939 specific and falsifying) · Infrastructure Alignment (baselines
re-measured this session) · Filter-Stage Ordering.

## Non-blocking residuals

- N1 The check cannot detect a doc that *should* be published but is not. That is a licensing
  judgment, correctly declared a non-goal rather than mechanised.
- N2 `workspace_fragility_check` remains `high / branch_only`; scope is narrow and branch-isolated.

## Required next action

`/qor-implement`, with the assertion-2 mutation demonstration mandated above.

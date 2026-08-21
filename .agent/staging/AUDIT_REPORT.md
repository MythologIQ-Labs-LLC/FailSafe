# AUDIT REPORT — plan-233-read-ledger-once.md

**Session**: 2026-08-21T2030-233res
**Auditor**: The Qor-logic Judge
**Mode**: solo (`audit_risk_score` -> `option_b_required: false`; codex-plugin absent, capability shortfall recorded)
**Target**: `plan-233-read-ledger-once.md`
**Target content hash**: `83d47554634cb11645d89f0f5ae2ee736db53e1bff682a5632edfbd09701b206`
**Risk Grade**: L2

---

# VERDICT: VETO

**Findings categories**: `specification-drift`

Two violations. Both are plan-text grounds; neither is a runtime defect. The retarget itself — read once, share the result — is sound and the measurements behind it reproduce. The plan does not survive its own stated contract.

---

## V1 — Self-Application Sub-Pass: the plan's grep-evidence is not machine-verifiable (`specification-drift`)

The plan declares `originating_remediation: "SG grep-list-as-finding (ledger #591) + GH #233 residual tranche"`. Per Step 3.5, the discipline the plan remediates is applied to the plan itself. That discipline is: **do not present unverified citations as findings.**

Observed:

```
plan-grep-lint: 0 citation(s) truth-checked [file:line, grep-n evidence]
```

The plan carries seven Locked Decisions, each with a grep-evidence line. The mechanical truth-checker verified **none of them**. The evidence is written as:

> `` `grep -nE '^function fsRead' src/qorlogic/consumer/consumer-adapter.ts` -> `140:function fsRead(sourcePath: string): RawArtifactRead {` ``

`qor/scripts/plan_evidence.py` (`_EVIDENCE_STMT_RE`) requires the canonical single-span form:

> `` `git show HEAD:<path> | grep -nE '<pattern>' -> NN:<observed text>` ``

Two divergences: the command is not the `git show HEAD:<path> | grep` form, and the observed text is placed in a *separate* backtick span rather than terminating the same one. The lint therefore matched zero citations and returned success — a **pass by non-recognition, not by verification**.

This is the exact posture that produced ledger #591: evidence that looks authoritative, is never checked, and is relied upon downstream. That the seven claims happen to be true when re-run by hand is not the point — the gate could not confirm it, and "I checked manually" is precisely the assurance #591 proved worthless.

**Required next action:** Governor: rewrite all seven LD evidence statements in the canonical form so `plan_grep_lint` reports 7 citations truth-checked, then re-run `/qor-audit`.

## V2 — "Zero behavior change" is false: Phase 3 drops `versionStatus` from the shared envelope (`specification-drift`)

The plan's central claim, repeated in its boundaries ("No change to any artifact's classification semantics"), in D1 ("with no change to any reported state"), and in the operator-selected slice depth ("zero behavior change"), is contradicted by its own Phase 3 code block.

Current production path (`WorkspaceArtifactBuilder.ts:79` + `:97`):

```ts
buildConsumerDiagnostics(this.workspaceRoot, { versionStatus: this.qorLogicVersionStatus })
  -> readMetaLedgerArtifact(root, opts)          // opts CARRIES versionStatus
```

Planned path (Phase 3):

```ts
const ledgerEnvelope = classifyMetaLedgerText(rawLedger.read, rawLedger.sourcePath);  // no opts
buildConsumerDiagnostics(this.workspaceRoot, { versionStatus, ledger: ledgerEnvelope });
```

`classifyRead` consumes `opts` on three paths (`consumer-adapter.ts:98-104`, `:126`):

- `provenance.qorVersion = opts?.versionStatus?.installed ?? null`
- `unsupportedReason(opts)` -> returns `unsupported` **exactly when** `!versionStatus.meetsFloor` (`:57-61`)
- `opts?.maxAgeMs` -> `stale`

`versionStatus` is supplied in production (`HubSnapshotService.ts:191`). So on a **below-B197-floor install**, the `META_LEDGER` diagnostics row changes:

| | state | provenance.qorVersion |
|---|---|---|
| today | `unsupported` | installed version |
| under this plan | `ok` (or whatever the file yields) | `null` |

The three sibling artifacts still receive `opts`, so aggregate `compatible` stays `false` and the regression does not fully surface there — which makes it *worse*, not better: the ledger row silently misreports while the block still looks correct. This weakens the B197 version-floor signal on `qorConsumer`, a fail-visible governance surface whose entire purpose is to make incompatibility legible.

The plan's own Phase 1 shows the author knew `opts` is load-bearing — `readMetaLedgerArtifact` retains its `opts` parameter and forwards it. Phase 3 then constructs the shared envelope without one.

**Required next action:** Governor: pass the same `ConsumerReadOptions` used by diagnostics when constructing the shared envelope in `build()` (i.e. `classifyMetaLedgerText(read, sourcePath, { versionStatus: this.qorLogicVersionStatus })`), and add a test pinning that a below-floor `versionStatus` yields `state: 'unsupported'` and a non-null `provenance.qorVersion` in the `META_LEDGER` diagnostics row. Then re-run `/qor-audit`.

Note the consequential correction this forces: with `versionStatus` applied, `ledgerReadable` in `build()` would newly become `false` on a below-floor install (`unsupported` is neither `ok` nor `stale`), where today it is computed from an opts-free read and is unaffected. The remediation must decide explicitly whether `ledgerSummary` gating changes, or whether two differently-classified envelopes are required — one opts-free for gating, one opts-bearing for diagnostics, from the same single read. Either is defensible; leaving it undecided is not.

---

## Pass Inventory

| Pass | Result | Note |
|---|---|---|
| Step 0.3 plan-iteration lint | PASS | exit 0; no draft/pre-audit marker |
| Step 0.4 unchanged-plan short-circuit | N/A | first audit of this plan |
| Step 0.5 cycle-count escalation | PASS | no consecutive same-signature VETO streak |
| Prompt Injection | PASS (WARN) | exit 0. Three `'<script'` canary WARNs in `docs/META_LEDGER.md` at offsets 871161/893749/917102 — all inside code spans of historical entries quoting the governance-file XSS guard test. Not injection; no ABORT. |
| Security L3 | PASS | no auth/secret/bypass surface; change is read-path only |
| Data-API access control | N/A | no SQL, no tables, no roles |
| OWASP Top 10 | PASS | no subprocess, no deserialization, no fail-open introduced; error paths preserved |
| Ghost UI | N/A | no UI surface |
| Live-Progress Invariant | N/A | no progress semantics |
| Section 4 Razor | PASS | `build()` stays ~35 lines; `readGovernanceState` ~8; `readMetaLedgerRaw` 4; no nesting >2; no ternaries |
| **Self-Application (Step 3.5)** | **VETO** | V1 |
| Test Functionality | PASS | all nine described tests invoke the unit and assert on output; the read-count tests assert an observed count, the equivalence tests assert deep-equality, the absent-vs-unreadable test asserts discriminated fields. None are presence-only. |
| Closed-enum inverse coverage | N/A | no `CANONICAL_*_VALUES` / `normalize*` pair declared |
| Dependency Audit | PASS | zero new dependencies |
| Macro-Level Architecture | PASS | no new module boundary; `readMetaLedgerRaw` lives beside its ladder; no reverse imports; layering preserved |
| Feature Test Coverage | PASS | FX929 NEW / FX893 MODIFIED / FX892 MODIFIED each cite a path + a behavior descriptor that fails if the feature silently breaks |
| Infrastructure Alignment | **VETO** | V2 (the `opts`-drop is an interface-contract mismatch against `classifyRead`'s actual signature semantics); all seven cited file:line coordinates independently re-verified as *factually* correct — see V1 for why that is insufficient |
| Runtime Contract Walk | WARN-only (V2 ramp) | not run as a binding gate |
| Filter-Stage Ordering | N/A | no pipeline-shaped candidate/filter/select function |
| Orphan Detection | PASS | no new files; all three phases modify files already on the build path from `HubSnapshotService.ts:191` |

## Documentation Drift

`doc_tier: standard` with one declared term (`MetaLedgerRead`, home `consumer-adapter.ts`) and populated `boundaries`. No glossary divergence. Advisory only.

## Process Pattern Advisory

<!-- qor:veto-pattern-advisory -->
No repeated-VETO pattern detected in the last 2 sealed phases. This is iteration 1 for this plan; the escalation counter is not engaged.

## What survives

Recorded so the remediation does not relitigate settled ground:

- The retarget is correct. Adapter migration is largely complete; the live defect is that nothing shares the envelope.
- The measurements reproduce: 5 reads, 8,715,735 bytes, 477 ms cold; 7.7 ms I/O + 13.9 ms `parseMetaLedgerEntries` + 5.5 ms `parseMetaLedger` warm.
- Defining `readMetaLedgerArtifact` in terms of `readMetaLedgerRaw` is the right shape — it makes equivalence structural rather than asserted, and it is the reason V2 is a one-line fix rather than a redesign.
- The exclusions (F1/F2 non-consumers, F3 bounded tail, F4/F5 deferred) are correctly scoped and correctly justified.
- Rejecting the mtime-keyed memo was correct on the stated grounds.
- The plan's self-correction of its own "5 -> 2" preview to "5 -> 3" is accurate.

---

_Verdict: VETO. Required next action: `/qor-plan` to amend (V1 evidence format, V2 `versionStatus` propagation + the `ledgerReadable` decision it forces), then re-run `/qor-audit`._

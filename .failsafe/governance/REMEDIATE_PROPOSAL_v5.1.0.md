# Process Remediation Proposal — v5.1.0 release-readiness VETO + full-coverage publish rule

**Date**: 2026-05-06
**Persona**: The QorLogic Governor
**Trigger**: Entry #285 GATE TRIBUNAL VETO; operator directive escalated mid-remediation from "DO NOT PUBLISH YET" → **"nothing gets published until everything gets a test."**
**Operator durable rule**: `feedback_no_publish_until_full_coverage.md` (saved this session)
**Workspace flag**: `.failsafe/governance/PUBLISH_BLOCK.md` (created this session, `Active: yes`)
**Mode**: degraded `.qor/` runtime — narrative artifact substitutes for `remediate.json`.

---

## Constraint reset

The operator's escalation changes the remediation shape. Original proposal targeted "address the 5 findings, then re-audit, then publish." New constraint: **no publish until 100% of `docs/FEATURE_INDEX.md` is `verified` or operator-justified `n/a`.** This is durable, not session-scoped.

The 5 audit findings still need resolution, but only F1 and F2 directly map to the coverage gate (and F1 is now a much larger scope than the original "fix high-impact gaps" framing implied). F3, F4, F5 are parallel concerns that can land independently.

---

## Scale of the coverage work (honest framing)

From `docs/FEATURE_INDEX.md`:
- **264 unverified entries** must each get a real, functional test (not presence-only per `doctrine-test-functionality.md` / SG-035)
- **191 currently `verified` entries** need a confirming pass to ensure their tests are actually functional (the consolidator agent assigned `verified` by name-match, not by reading test bodies; some are likely presence-only and would downgrade)
- **21 currently `n/a` entries** need per-row operator-approved justifications added; some may need to be reclassified to `unverified` if no clean justification exists
- **18 "Promise without Reality" gaps** must be addressed by either (a) implementing the feature and adding a test, or (b) removing the doc claim
- **5 "Reality without Promise" gaps** (likely 62+ per the consolidator's broader count) need either documentation entries added in FEATURE_INDEX, or explicit `internal: true` flags

**Realistic effort**: this is the 2–3 weeks of focused engineering the original B199 plan estimated, plus the 1-week baseline-audit pass on existing `verified` entries. Total: 3–4 weeks of primary engineer time, or longer if pursued part-time.

This is NOT something to bundle into a single `/qor-plan` cycle. It's the **next 6–8 plan cycles** of B199 Phases 2–8, plus a new "FEATURE_INDEX baseline audit" plan that fronts the work.

---

## Proposals

### R0 — Workspace publish-block flag (LANDED IN THIS COMMIT)

**Kind**: governance flag
**Status**: ✅ authored at `.failsafe/governance/PUBLISH_BLOCK.md`
**Addresses**: operator directive

Workspace state codifies the durable rule. Pre-push validator wiring (R3 below) reads this file once added.

---

### R1 — Amend `/qor-substantiate` Step 6 to gate on FEATURE_INDEX (UPDATED for full-coverage rule)

**Kind**: skill + gate
**Addresses**: F1, F2, F4 (and operator durable rule)
**Scope**: FailSafe-local; mirrored upstream as Qor-logic#40

Add to `/qor-substantiate` Step 6:

> 1. Header counts MUST equal grep-count of body rows (specification-drift guard).
> 2. For each `verified` entry from prior seal: confirm test path still exists, test still passes, AND test is not presence-only (acceptance question per `doctrine-test-functionality.md`). Any regression to `unverified` ABORTs unless the seal entry body explicitly justifies.
> 3. **NEW (release-class only)**: For any seal that would unblock a publish-class action, count `unverified` entries. If `unverified > 0` AND `.failsafe/governance/PUBLISH_BLOCK.md` exists with `Active: yes`, ABORT seal with operator hint to either (a) close the unverified entries with tests, (b) reclassify to `n/a` with operator-approved justification, or (c) clear the publish-block file with explicit operator confirmation.
> 4. Hotfix seals (change_class=hotfix) bypass step 3 — emergency hotfixes can ship even when broader coverage is incomplete; the publish-block file is itself bypassed when commit subject contains `[hotfix-bypass: <reason>]` token AND operator-signed.

---

### R2 — Amend `/qor-implement` Step 12.5 to require FEATURE_INDEX maintenance (UPDATED)

**Kind**: skill
**Addresses**: F1, F4

Same as original R2: every implement cycle updates FEATURE_INDEX header counts to match body, appends rows for new features, requires test for `verified` status.

**NEW addition under full-coverage rule**: when an implement pass adds a new feature (new FX row), the row's `Status` MUST be `verified` (with test path) or `n/a` (with operator-approved justification in same commit). `unverified` is not a permissible status for a newly-added row — only for pre-existing rows that the operator explicitly hasn't covered yet. This prevents the `unverified` count from growing during ongoing implementation.

---

### R3 — Add publish-block awareness to pre-push validator + release-gate doctor

**Kind**: tooling + gate
**Addresses**: operator durable rule (R0 enforcement) + F3 (release tooling consistency)

Two-layer:

**Layer A — `tools/reliability/prepush-validate.ps1`**:
> Add `Test-PublishBlock` step that reads `.failsafe/governance/PUBLISH_BLOCK.md`. If file exists with `Active: yes` AND push targets a release branch (regex `^release/`, `^v[0-9]`, etc.) OR push includes tags, exit 1 with the file's "Reason" line.

**Layer B — `release-gate.cjs --doctor` (NEW mode)**:
> 1. Reads `.failsafe/governance/PUBLISH_BLOCK.md`; refuses to run when `Active: yes`.
> 2. Asserts prior version has a `vN.M.P` git tag locally and on `origin`.
> 3. Asserts prior version is the latest on VS Code Marketplace AND Open VSX (using `vsce show` and `ovsx get`).
> 4. `--bump <level>` MUST call `--doctor` first; refuses on non-zero exit.

**Files**:
- `FailSafe/extension/scripts/release-gate.cjs` — new `--doctor` mode (~90L)
- `tools/reliability/prepush-validate.ps1` — `Test-PublishBlock` and `Invoke-Step "Release-gate doctor"` for release-branch pushes
- `qor/references/doctrine-governance-enforcement.md` — new §"Publish-block enforcement"

---

### R5 — Add Stale-Cache Detection pass to `/qor-audit` Macro-Level Architecture

**Kind**: skill (audit pass)
**Addresses**: F5

(Unchanged from original R5: catch B192/B193 anti-pattern at plan-time.)

---

### R7 — Add Doc Claim Verifiability pass to `/qor-audit`

**Kind**: skill (audit pass)
**Addresses**: F2 (and durable rule via FEATURE_INDEX cross-reference)

(Unchanged from original R7: every doc claim must reference an FX### row with `verified` or `n/a` status.)

---

### R8 (NEW) — Author the FEATURE_INDEX Baseline Audit plan

**Kind**: plan + skill
**Addresses**: durable rule (operationalizing it)

Author `plan-feature-index-baseline-audit.md` covering:

> For all 191 currently `verified` entries in FEATURE_INDEX:
> 1. Read each cited test file's body.
> 2. Apply the SG-035 acceptance question: "If the unit's behavior were silently broken but the artifact still existed, would this test fail?" If no, the test is presence-only.
> 3. Reclassify presence-only entries to `unverified` and either author a functional test in the same plan or document the gap.
>
> For all 21 `n/a` entries: write per-row operator-approved justification in the `notes` cell.
>
> For all 18 Promise-without-Reality entries: pair with operator decision per row — implement+test, remove claim from docs, or reclassify as planned-future-work.

This plan is the prerequisite to any subsequent B199 phase: without baseline audit, "verified" is meaningless.

**Files**:
- `.failsafe/governance/plans/plan-feature-index-baseline-audit.md` (NEW)
- Will produce 191 row updates in `docs/FEATURE_INDEX.md` plus an unknown number of new test files

**Estimated effort**: ~1 week primary engineer time. Highest priority item since it gates all subsequent coverage work.

---

### R9 (NEW) — Author the B199 Phases 2–8 plan family

**Kind**: plan series
**Addresses**: F1 (via the publish-block clearance path)

Following R8's baseline audit, author each remaining B199 phase as a separate `/qor-plan` cycle:

- **Phase 2**: Command Center 9 tabs + per-tab persistence (~25–35 specs)
- **Phase 3**: Brainstorm/Mindmap full coverage including voice substrate (~30–40 specs; includes Whisper integration tests, Piper playback verification, wake-word, PTT)
- **Phase 4**: Settings full coverage including governance-mode switching behavior (~20–30 specs)
- **Phase 5**: Operations / Transparency / Risks / Governance / Skills / Adapter tabs (~25–35 specs)
- **Phase 6**: VS Code sidebar + 30 commands (vscode-test, not Playwright; ~30 tests)
- **Phase 7**: ConsoleServer routes integration (supertest-style; ~60 tests for ~89 routes — many can be batched)
- **Phase 8**: Cross-host install integration (real Python subprocess, mocked pip; ~10 tests)

Each phase ends with FEATURE_INDEX row updates per R2. The publish-block clears when the last phase seals AND the FEATURE_INDEX shows 0 unverified entries.

**Files**: 7 new plan files; effort estimate per memory note on B199: 2–3 weeks total focused engineering after baseline audit.

---

## Addressed shadow events (narrative)

| Pattern | Severity | Status flip | Resolution path |
|---|---|---|---|
| `release-scope-mismatch` (SG-ReleaseScopeMismatch-A) | 3 | `addressed_pending: true` | R1 + R2 (FEATURE_INDEX as gate) |
| `doc-without-code` (18 instances, F2) | 2 | `addressed_pending: true` | R7 + R8 (per-row decision in baseline audit) |
| `release-tooling-divergence` (F3) | 3 | `addressed_pending: true` | R3 (doctor + publish-block enforcement) |
| `specification-drift` (F4) | 1 | `addressed: true` (immediate fix below) | R2 (long-term) + immediate header correction |
| `stale-cache-anti-pattern` (B192/B193, F5) | 2 | `addressed_pending: true` | R5 + separate `/qor-debug` cycle |
| `release-block-directive` (operator) | flag | `addressed: true` | R0 (PUBLISH_BLOCK.md authored this commit) |
| **NEW**: `coverage-gap-systemic` | 3 | `addressed_pending: true` | R8 + R9 (baseline + 7-plan series) |

`addressed: true` flips for events 1, 2, 3, 5, 7 deferred to `/qor-audit reviews-remediate:.failsafe/governance/REMEDIATE_PROPOSAL_v5.1.0.md` after each respective remediation lands. Events 4 and 6 are immediately addressed by this artifact.

---

## Immediate actions (executable now, no re-audit needed)

1. **Author PUBLISH_BLOCK.md flag** ✅ done in this commit
2. **Fix FEATURE_INDEX.md header counts** (F4) — pure data correction. Update header to: Total: 476, Verified: 191, Unverified: 264, N/A: 21.
3. **Save the durable rule to memory** ✅ done (`feedback_no_publish_until_full_coverage.md`)
4. **Update MEMORY.md index** ✅ done

Remaining immediate: just the FEATURE_INDEX header fix.

---

## Deferred to new `/qor-plan` cycles (in dependency order)

1. **`plan-feature-index-baseline-audit.md`** (R8) — must run first. ~1 week. Confirms the 191 currently-`verified` entries are actually functional; writes per-row `n/a` justifications; pairs Promise-without-Reality items with operator decisions.
2. **`plan-publish-block-tooling.md`** (R3 + R0 enforcement) — adds `--doctor` mode + `Test-PublishBlock` step. ~3 days. Can run in parallel with baseline audit since it doesn't depend on coverage state.
3. **`plan-substantiate-feature-index-gate.md`** (R1) — amends `/qor-substantiate` Step 6. ~2 days. Depends on R0 + R8 landing first.
4. **`plan-implement-feature-index-maintenance.md`** (R2) — amends `/qor-implement` Step 12.5. ~2 days. Same dependency.
5. **`plan-audit-doc-claim-verifiability.md`** (R7) — adds new pass. ~3 days. Independent.
6. **`plan-audit-stale-cache-detection.md`** (R5) — adds new pass. ~2 days. Independent.
7. **B199 Phases 2–8** (R9) — runs after R8 + R1 + R2 land, providing the harness; phases 2–8 themselves are 2–3 weeks together.

**Total critical path**: ~5 weeks. The publish-block clears at the end.

---

## Operator decisions required

1. **Confirm rule scope**: the durable rule says no marketplace publish without 100% coverage. Does this also block marketplace ROLLBACK if v5.0.0 needs to be retracted? (Recommendation: rollback uses an emergency `[hotfix-bypass: <reason>]` token; not blocked.)
2. **`n/a` justification authority**: do all `n/a` justifications need your explicit per-row sign-off, or can the implementer self-justify with operator review at substantiate? (Recommendation: implementer drafts, you sign off at substantiate.)
3. **Open VSX backfill timing**: still your previous answer — backfill v5.0.0 to Open VSX before any v5.1.0 publish? (Recommendation: yes, paired with R3 doctor mode landing.)
4. **Order**: which deferred plan goes first? My ordering above is dependency-first (baseline audit gates everything else). You can override.

The publish-block stays `Active: yes` until you clear it. No skill or future agent should propose otherwise.

---

## Operator notice — degraded wiring

`.qor/` runtime uninitialized. This narrative substitutes for `.qor/gates/<sid>/remediate.json`. When `.qor/` is initialized later, the helper's `addressed_event_ids` field maps to the patterns enumerated in the table above plus `coverage-gap-systemic` (new event class introduced by this remediation).

**Decision**: PROPOSE — six remediations (R0 landed; R1–R3, R5, R7 deferred to new plan cycles; R8 + R9 added under the durable-rule constraint). Critical path ~5 weeks. Publish-block stays `Active: yes` until FEATURE_INDEX shows 0 unverified entries (post-baseline-audit) AND the 7-phase B199 series lands.

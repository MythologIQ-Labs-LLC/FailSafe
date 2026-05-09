# v5.1.0 Publishable Release — Scope Definition

**Locked**: 2026-05-09 (operator confirmation; supersedes informal scope at META_LEDGER #294 marathon "100% coverage" claim)
**Current state**: `package.json` at v5.1.0; PUBLISH_BLOCK Active since 2026-05-06; 5 unpublished workspace baselines layered in branch `plan/v5-extension-update`
**Gate to lift**: 0 unverified entries in `docs/FEATURE_INDEX.md` per `.failsafe/governance/PUBLISH_BLOCK.md`

## Scope discipline

This document is the canonical reference for what ships in v5.1.0. E5+ plan dialogues check items against this scope before drafting. Items not on this list defer to v5.1.1 or later — adding scope mid-flight requires operator confirmation and an update here.

## In scope — already sealed (rolled into v5.1.0 publishable)

| Workspace baseline | Plan | META_LEDGER | Substantive deliverable |
|---|---|---|---|
| v5.1.0 marathon | `plan-monitor-coherence-and-browser-verification` v5 | #294 | Monitor coherence + browser verification |
| v5.1.1 | `plan-hotfix-sentinel-monitor-default-state` v2 | #298 | Sentinel-monitor default state hotfix |
| v5.1.2-baseline | `plan-feature-index-baseline-audit` v2 | #303 | FEATURE_INDEX truth-correction; SG-PresenceOnlyByNameMatch closure |
| v5.1.3-baseline | `plan-e2-classifier-path-fix-and-reconciliation` v2 | #307 | Classifier resolver hardening; SG-ClassifierPathBug closure |
| v5.1.4-baseline | `plan-e3-classifier-heuristic-upgrade` v1 | #310 | Heuristic upgrade (Playwright matchers + assert.match discriminator + bare-expect tightening); SG-HeuristicBlindSpot |
| v5.1.5-baseline | `plan-e4-override-promotion-extension` v1 | #313 | Bidirectional MANUAL_OVERRIDES; classifier-vs-FEATURE_INDEX gap closed |

## In scope — pending

### Required (operator-confirmed)

| ID | Source | Description | Estimated effort |
|---|---|---|---|
| **A** | B200 | `ShadowGenomeManager` init-order P0 security regression — `migrate()` runs before `initSchema()`; security columns silently missing on first session | ~2-3h |
| **B** | B199 Phase 2+ | Comprehensive Playwright + integration test coverage to drive 46 → 0 unverified entries | Multi-cycle (2-3 weeks engineering) |
| **C** | Qor [#41](https://github.com/Knapp-Kevin/Qor/issues/41) | Stale-override detector for `MANUAL_OVERRIDES` (TTL or test-state validator); protects E2 + E4 codifications from outliving justification | ~3-4h | **SEALED at E7 (2026-05-09)** — `feature-index-classifier-staleness.cjs` produces redundant/invalid/no_path findings; baseline run reports 0 invalid, 2 redundant (FX128, FX359 — operator review pending) |
| **D** | (carried) | TtsEngine vendor presence routing flake — test-stability hotfix; surfaced at #310 + #313 push hooks | ~1-2h |

### HIGH-severity backlog (operator-confirmed in v5.1.0)

| ID | Severity | Description |
|---|---|---|
| **B191** | HIGH P0 | Monitor sidebar workspace-truth — SHIELD lifecycle invisible to operator; UNIT tests pass, E2E not verified. **Subsumed by B (B199 Phase 2+)** — drives Monitor-specific spec authoring. |
| **B192** | HIGH | Stale-cache pattern across PlanManager / L3ApprovalService / CheckpointStore (same anti-pattern as B191; refactor to canonical `refreshFromWorkspace()` per service or shared event bus) |
| **B193** | HIGH | SentinelDaemon excludes governance file extensions (`.md` / `.yaml` / `.json` / `.failsafe/**`); META_LEDGER + AUDIT_REPORT + plan-*.md changes invisible to verdict pipeline |
| **B194** | HIGH | EnforcementEngine defaults to `observe` with no escalation prompt; first-run UX walks operator from observe → assist; status-bar indicator + Settings card |
| **B197** | HIGH | `qor-logic` Python package version unpinned and unverified post-install; pin minimum, assert via `pip show`, surface mismatch as Settings warning |
| **B198** | MEDIUM | Subscribe-without-mutate pattern systemic across UI tabs (focus traps, listener leaks, no staleness indicator); needs its own focused plan |

### Carried-forward findings (test-tightening + minor gaps; rolled into appropriate scope items)

- `status.running` undefined edge case (carried from #298) — rolls into B194 or as small follow-on hotfix
- Asymmetric regression coverage for 4 of 5 demotion overrides (FX145/173/174/359) — rolls into C (stale-override detector test surface)
- Per-entry reason-text tokens vs `/Phase 3/` regex in unit tests — minor; rolls into B (test-tightening pass)
- CI inline command full-5-criteria check vs single-criterion — minor; rolls into B

## Out of scope — explicitly deferred

| ID | Reason for deferral | Target |
|---|---|---|
| **B195** | VSIX size 47.6MB approaches 50MB marketplace cap; operator-deferred 2026-05-09 ("pull back on B195") | v5.1.1 OR v5.2.0 |
| **B196** | FailSafe Pro daemon detection not implemented; gated on Pro launch per BACKLOG | v5.x post-Pro launch |
| **B100-B106** | FailSafe Plus release-runner items (Linux parity, workflow shell discipline, SemVer rerun safety, etc.) | FailSafe Plus / FailSafe-Pro repo |
| **B132** | Node-label silent truncation (minor UX) | v5.1.1 |
| **B148, B149** | Agent Run Replay (interactive replay, behavioral telemetry) | Future major |
| **B151, B152, B153** | Universal Governance Interceptor / Runtime Execution Layer / OTLP export | v5.2.0+ |
| **B190** | Governance Decision Contract Schema Import | v5.0.0+ — not gating publish |
| Qor [#39, #40, #42] | Qor-Logic framework upstream concerns (plan-grep-lint extensions, substantiate diagnostics) | Qor framework cycles; orthogonal to FailSafe ship |

## Lift sequence (publish-readiness path)

The PUBLISH_BLOCK gate clears when FEATURE_INDEX shows 0 unverified. The current 46-entry unverified bucket consists of:
- 44 em-dash entries (no test cited; B199 Phase 2+ authors the missing tests)
- 2 cited-but-presence-only entries (operator-justified `n/a` candidates OR functional test authoring per surface)

In-scope items that DON'T directly reduce the unverified count (A, B192, B193, B194, B197, B198, C, D) ship alongside B/B199 Phase 2+ but do not gate the count. They gate publish through correctness, security, and operational discipline rather than coverage arithmetic.

**Suggested order of operations** (subject to operator preference per E5+ plan dialogue):

1. **A (B200)** — P0 security hotfix; small; clears one CRITICAL/HIGH item before deeper work
2. **D (TtsEngine flake)** — small; removes pre-push friction so subsequent push cycles don't lose ~5 min each
3. **C (Qor #41)** — protects existing override codifications before E5+ plans add more entries
4. **B (B199 Phase 2+)** — multi-cycle bulk; runs concurrent or sequential to:
5. **B192, B193, B194, B197, B198** — each as own focused plan; integrates with E5+ surface buckets where natural

## v5.1.0 release-readiness checklist (gates publish)

- [ ] FEATURE_INDEX shows 0 unverified entries (every entry `verified` or operator-justified `n/a`)
- [ ] All 4 required items (A/B/C/D) sealed
- [ ] All HIGH backlog items in scope (B191/192/193/194/197/198) sealed
- [ ] PUBLISH_BLOCK file flipped `Active: yes` → `Active: no` OR deleted
- [ ] `/qor-audit` PASS verdict on publish-readiness question (per #285 findings 1, 2)
- [ ] `/qor-substantiate` release-class seal (Steps 7.5/7.6/9.5.5 NOT skipped — first non-workspace-only seal of the v5.1.x sub-chain)
- [ ] `pyproject.toml` / `package.json` version unchanged at 5.1.0 (no bump; v5.1.0 IS this release)
- [ ] CHANGELOG.md `[5.1.0]` section dated and populated
- [ ] README badges current (Tests / Ledger / Skills / Agents / Doctrines counts match truth)
- [ ] Annotated release tag created at seal commit
- [ ] `marketplace-publish.yml` + `ovsx-publish.yml` workflows execute clean

## Living document

Update this file when:
- A scope item is sealed (move to "Already sealed" table)
- Operator confirms a new in-scope item (add to required/HIGH backlog table; document rationale)
- Operator defers an in-scope item (move to "Out of scope" with rationale)

Updates require their own commit referencing this file and the META_LEDGER entry that triggered the change.

---

**Authority**: Operator confirmation chat directive 2026-05-09 ("A through D are all requirements"; "let's pull back on B195 but otherwise all of the above").
**Effective date**: 2026-05-09.
**Supersedes**: informal scope inferred from META_LEDGER entries #294-#313.

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
| v5.1.6-baseline | `plan-e5-shadowgenomemanager-init-order-hotfix` v1 | #316 | Item A (B200) — ShadowGenomeManager init-order P0 security fix |
| v5.1.7-baseline | `plan-e6-tts-engine-flake-fix` v1 | #319 | Item D — TtsEngine vendor presence routing flake fix |
| v5.1.8-baseline | `plan-e7-override-staleness-detector` v1 | #322 | Item C (Qor #41) — Stale-override detector |
| v5.1.9-baseline | Item B Phase 1 sweep (autonomous) | #324 | 24 FEATURE_INDEX entries promoted/cited; unverified 46 → 22 |
| v5.1.10-baseline | `plan-qor-phase56-audit-canary-remediation` | #325-#330 | Audit-canary remediation; unblocked B194 + B199 Ph 2 plan auditability |
| v5.1.10 + Phase 59 | `plan-qor-phase59-agent-detection-organize` | #335-#336 | Agent detection overhaul + organize command |
| v5.1.10 + Phase 61 | `plan-qor-phase61-ledger-repair` | #337-#338 | Entry #331-#336 ledger semantic repair |
| v5.1.10 + Phase 62 | `plan-qor-phase62-item-b-sweep-followups` | #339-#342 | Classifier factor-out + FX128/FX359 redundancy cleanup |
| v5.1.10 + Phase 60 §0 | `plan-qor-phase60-v5-1-0-remaining-scope` (Phase 0 only) | #343-#345 | Refactor Enablement Gate: PlanManager / SentinelDaemon / ConsoleServer splits |

## In scope — pending

### Required (operator-confirmed)

| ID | Source | Description | Status |
|---|---|---|---|
| **A** | B200 | `ShadowGenomeManager` init-order P0 security regression | **SEALED at E5 (2026-05-09)** — v5.1.6-baseline / META_LEDGER #316 |
| **B Phase 1** | B199 Phase 1 + Phase 1 sweep | Test methodology + CI gate + Monitor B191 proof; FEATURE_INDEX 46 → 22 unverified | **SEALED** — #283-#284 (methodology) + #324 (Phase 1 sweep) |
| **B Phase 2+** | B199 Phase 2-8 | Comprehensive Playwright + integration test coverage to drive 22 → 0 unverified entries | Multi-cycle (~2-3 weeks engineering); previously VETOed at #325 on audit-canary; now unblocked |
| **C** | Qor [#41](https://github.com/Knapp-Kevin/Qor/issues/41) | Stale-override detector for `MANUAL_OVERRIDES` | **SEALED at E7 (2026-05-09)** — v5.1.8-baseline / META_LEDGER #322 |
| **D** | (carried) | TtsEngine vendor presence routing flake | **SEALED at E6 (2026-05-09)** — v5.1.7-baseline / META_LEDGER #319 |

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
| **B195** | VSIX size 47.6MB approaches 50MB marketplace cap due to bundled voice assets; operator-deferred from v5.1.0. Preferred v5.2.0 direction: restore prompt/download flow when users enable voice features instead of bundling Piper/Whisper models in the extension. | v5.2.0 |
| **B196** | FailSafe Pro daemon detection not implemented; gated on Pro launch per BACKLOG | v5.x post-Pro launch |
| **B100-B106** | FailSafe Plus release-runner items (Linux parity, workflow shell discipline, SemVer rerun safety, etc.) | FailSafe Plus / FailSafe-Pro repo |
| **B132** | Node-label silent truncation (minor UX) | v5.1.1 |
| **B148, B149** | Agent Run Replay (interactive replay, behavioral telemetry) | Future major |
| **B151, B152, B153** | Universal Governance Interceptor / Runtime Execution Layer / OTLP export | v5.2.0+ |
| **B190** | Governance Decision Contract Schema Import | v5.0.0+ — not gating publish |
| Qor [#39, #40, #42] | Qor-Logic framework upstream concerns (plan-grep-lint extensions, substantiate diagnostics) | Qor framework cycles; orthogonal to FailSafe ship |

## Remaining unverified bucket — grouped by surface (post-Phase-62)

PUBLISH_BLOCK Condition 1 (0 unverified) remains binding. Current bucket of 22 unverified entries (down from 46 at E4 seal) by surface:

| Surface | Entries | Drives |
|---|---|---|
| governance mode / observe-enforce UX | FX044, FX244 | Phase 60 §3 (B194) |
| console / monitor / command center UI | FX128, FX145, FX154, FX173, FX174, FX409, FX419 | Phase 60 §2 (B192) + §4 (B198) + B199 Ph 2-3 |
| voice + audio verification | FX196, FX198, FX219, FX221, FX222, FX227, FX231 | B199 Ph 4 (voice substrate live coverage) |
| hooks / checkpoint / sentinel / skill provenance / workspace seeding | FX166, FX236, FX258, FX261, FX359, FX435 | Phase 60 §4 + B199 Ph 5-6 |

Note: FX128 + FX359 reclassified after Phase 62 removed their MANUAL_OVERRIDES entries; classifier-determined status is still `unverified` (override removal preserved verdict).

## Lift sequence (publish-readiness path)

The PUBLISH_BLOCK gate clears when FEATURE_INDEX shows 0 unverified. **3 of 4 Required items are sealed** (A/C/D). Item B Phase 1 is sealed; Phase 2-8 still required.

**Suggested order of remaining operations**:

1. **Phase 60 §0 Refactor Enablement** — **SEALED at META_LEDGER #345** (this commit). Unblocks §1-§5.
2. **Phase 60 §1 Scope Sync** — In progress (this cycle). Refreshes scope doc + FEATURE_INDEX header + classifier-test assertions.
3. **Phase 60 §2** — Workspace Truth Refresh + Governance Watch Surface (B192 + B193). Now unblocked by §0.
4. **Phase 60 §3** — Governance Mode Escalation (B194) + Install Version Floor (B197).
5. **Phase 60 §4** — UI Subscription Hygiene (B198) + Remaining FEATURE_INDEX closure. Drives 22 → 0 unverified.
6. **Phase 60 §5** — Publish-Block Verification + release-class coverage gate regression test.
7. **B199 Phase 2-8** — Comprehensive Playwright/vscode-test coverage authoring (multi-cycle).
8. **Release-class `/qor-substantiate`** — first non-workspace-only seal of v5.1.x sub-chain; runs Steps 7.5/7.6/9.5.5 (CHANGELOG stamp, README badge currency, annotated seal tag) but does NOT bump `package.json` (stays at 5.1.0).

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

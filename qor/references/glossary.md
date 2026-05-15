# Glossary

Workspace-local glossary for terms introduced by phase plans under the `standard` documentation tier. Each entry is a YAML fenced block. Grow this file in subsequent cycles as new terms are declared in plan frontmatter.

```yaml
term: SemanticLedgerContinuity
definition: |
  The invariant that for every numerically adjacent pair of verifiable entries N and N+1 in docs/META_LEDGER.md,
  entry[N+1].previous_hash equals the accepted chain or seal hash of entry[N]. Local arithmetic verification
  (entry.chain_hash == SHA256(content_hash + previous_hash) under the era-local hash formula) is necessary but
  not sufficient; semantic continuity additionally requires the across-entry chain. Enforced after the Phase 61
  ledger repair by FailSafe/extension/scripts/meta-ledger-repair.cjs --check-continuity and by the installed Qor
  verifier (qor-logic verify-ledger).
home: docs/SYSTEM_STATE.md
introduced_in_plan: plan-qor-phase61-ledger-repair
referenced_by:
  - docs/META_LEDGER.md
```

```yaml
term: LedgerRepairAttestation
definition: |
  A ledger entry of phase IMPLEMENT (or SUBSTANTIATE) that records a bounded, audited repair of a range of prior
  ledger entries. The attestation preserves every recorded content hash in the repaired range, replaces
  previous-hash and chain-hash fields under the era-local hash formula, and chains itself from the last repaired
  entry's chain or seal hash. Required follow-up gates: qor-logic verify-ledger exits zero and the local
  --check-continuity exits zero against the repaired slice.
home: docs/META_LEDGER.md
introduced_in_plan: plan-qor-phase61-ledger-repair
referenced_by:
  - docs/META_LEDGER.md
```

```yaml
term: WorkspaceTruthRefresh
definition: |
  The pattern of refreshing in-memory governance service state from on-disk workspace artifacts before
  serving a hub snapshot or queue view. Phase 60 introduces explicit `refreshFromWorkspace()` methods on
  PlanManager, L3ApprovalService, and the PlanPersistenceStore/RoadmapPersistenceStore siblings so that
  Claude-driven file writes to plans.yaml, roadmap YAML, the L3 state store, META_LEDGER.md, AUDIT_REPORT.md,
  and plan-*.md become observable to Monitor and route models on the next hub rebuild rather than waiting
  for an extension restart. Refresh methods are explicit and side-effect-bounded: reload cached values,
  no watcher start, no file writes.
home: docs/FEATURE_INDEX.md
introduced_in_plan: plan-qor-phase60-v5-1-0-remaining-scope
referenced_by:
  - docs/META_LEDGER.md
```

```yaml
term: GovernanceWatchSurface
definition: |
  The set of file paths and extensions that SentinelDaemon watches for governance-state changes via the
  SentinelWatchPolicy sibling. Before Phase 60, Sentinel watched only code-extension files (`.ts`, `.js`,
  `.tsx`, `.py`, `.go`, etc.) and explicitly excluded `**/.failsafe/**`, leaving META_LEDGER, AUDIT_REPORT,
  plans.yaml, the risk register, and the intent store invisible to the verdict pipeline. Phase 60 extends
  the surface to include `.md`, `.yaml`, `.json` extensions plus selected `.failsafe/**` paths through
  named `WATCHED_EXTENSIONS` set and `WATCHED_GOVERNANCE_PATHS` predicate.
home: docs/FEATURE_INDEX.md
introduced_in_plan: plan-qor-phase60-v5-1-0-remaining-scope
referenced_by:
  - docs/META_LEDGER.md
```

```yaml
term: InstallVersionFloor
definition: |
  The minimum acceptable `qor-logic` Python package version asserted by QorLogicPackageInstaller after
  `pip install qor-logic`. Phase 60 introduces an explicit minimum version constant kept adjacent to host
  layout compatibility text in qorelogic/hostLayouts.ts; the installer parses `pip show qor-logic` output
  and reports below-floor installations to Settings as a warning card. Closes the gap where extension code
  could silently run against a stale qor-logic with a different install_map.
home: docs/FEATURE_INDEX.md
introduced_in_plan: plan-qor-phase60-v5-1-0-remaining-scope
referenced_by:
  - docs/META_LEDGER.md
```

```yaml
term: ManualOverrideAuthority
definition: |
  The operator-authoritative MANUAL_OVERRIDES table consumed as the last step of the per-entry FEATURE_INDEX
  classifier pipeline. The table holds two flavors of override: demotion overrides (status: 'unverified') that
  override a classifier-functional verdict on a presence-only spec, and promotion overrides (status: 'verified')
  that override a classifier-ambiguous verdict on a functionally-correct test using an assertion shape the
  heuristic does not recognize. Authority is operator-authoritative: classifier verdicts are advisory once an
  override is present, and operator must explicitly retest under E5+ to revise any override. As of Phase 62 the
  table lives in feature-index-classifier-overrides.cjs (factored out of feature-index-classifier.cjs) and is
  re-exported by classifier.cjs to preserve the existing public API.
home: docs/FEATURE_INDEX.md
introduced_in_plan: plan-qor-phase62-item-b-sweep-followups
referenced_by:
  - docs/META_LEDGER.md
```

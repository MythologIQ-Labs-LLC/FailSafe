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

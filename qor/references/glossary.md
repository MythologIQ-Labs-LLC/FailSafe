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

```yaml
term: Vacuous pass
definition: |
  A governance control that returns a success exit code while having inspected nothing, so its green result
  carries no evidence about the property it exists to enforce. The canonical instance is an ABORT-class gate
  whose target path does not resolve in the consuming repository: qor-logic scripts skill_size_budget_lint
  defaults to --skills-root qor/skills, which is absent in FailSafe (skills live at .claude/skills), so it
  scanned zero files and exited 0 for the life of the ladder. Distinct from a disclosed Phase-75 SKIP, which
  records prerequisite-absence explicitly and emits gate_skipped_prerequisite_absent; a vacuous pass is
  indistinguishable from a real pass at the exit code. Detected by exercising the control's falsifier: run it
  once as configured, then again in a configuration where it MUST fail. A control that cannot be made to fail
  is not measuring anything. Related failures found by the same test in this repo: gate_chain_completeness
  (inspects 0 sessions and prints "completeness is unverified, not confirmed" before exiting 0), secret_scanner
  --staged (0 staged bytes), governance-index --cross-check-ledger (0 bytes of output on both pass and fail),
  and the post-anchor ledger fork guard (only reachable when the forked entry is the ledger's high-water mark).
home: .failsafe/governance/RESEARCH_BRIEF_qor169-alignment-2026-09-03.md
introduced_in_plan: plan-qor169-sprint1-seal-unblock
referenced_by:
  - docs/FEATURE_INDEX.md
  - docs/META_LEDGER.md
```

```yaml
term: Tier 1 currency check
definition: |
  A machine assertion that a Tier 1 governance document satisfies its own declared freshness contract,
  rather than merely having been edited recently. docs/GOVERNANCE_INDEX.md assigns Tier 1 the contract
  "MUST be current at every cycle close" with drift signal "wrong version, wrong state", but until
  FX938 no check anywhere read docs/SYSTEM_STATE.md's content: a grep over FailSafe/extension/scripts/
  and src/test/ returned only ledger-fork fixtures and an unrelated HubSnapshotService test. The
  document consequently claimed Current Release v5.9.0 while the repository shipped v6.0.4 - five
  releases of drift - and /qor-substantiate Step 6.5's check_documentation_currency returned zero
  warnings against it, because that check asks whether the current cycle's files_touched implies a doc
  update and never inspects the document. Distinguished from a doc-currency HEURISTIC by what it reads:
  a currency check compares the document's own claims against an independent source of truth
  (package.json, git tags, the ledger), so it fails when the document is wrong rather than when a cycle
  forgot to touch it. The canonical instance also demonstrates the inversion hazard: the obvious form of
  a staleness assertion - "Last Updated is not older than the newest body section" - is SATISFIED by a
  header restamped while the body is abandoned, which is the exact defect; the falsifying form requires
  a body section FOR the claimed date. See [[Vacuous pass]] for the sibling failure mode where the check
  runs but inspects nothing.
home: FailSafe/extension/src/test/governance/system-state-currency.test.cjs
introduced_in_plan: plan-system-state-currency
referenced_by:
  - docs/SYSTEM_STATE.md
  - docs/FEATURE_INDEX.md
```

```yaml
term: Private by design
definition: |
  A governance artifact that is registered in docs/GOVERNANCE_INDEX.md but deliberately absent from
  the published repository, as distinct from one that is missing. .gitignore:52-56 heads its stanza
  "Private planning docs, transfer files, and governance records (licensing TBD)" and ignores docs/
  and .failsafe/ wholesale, so both trees are private by default and published by exception via
  git add -f - a deliberate act performed on 38 of the 68 paths the index registers. An unpublished
  row is therefore not drift, and whether a given doc SHOULD be published is a licensing decision the
  operator has explicitly deferred. The distinction matters because without it a reader of a clone
  cannot separate 15 intentionally-private rows from a genuinely broken one: confidentiality.md was
  registered as a root Tier 2 artifact while existing nowhere in the repository, being operator memory.
  Distinguished from OUT-OF-TIER (docs/GOVERNANCE_INDEX.md's own section for paths that are not
  governance at all, such as .claude/ tool state) - out-of-tier means "not a governance artifact",
  private-by-design means "a governance artifact that has not been published".
home: docs/GOVERNANCE_INDEX.md
introduced_in_plan: plan-governance-index-publication-status
referenced_by:
  - docs/FEATURE_INDEX.md
  - docs/META_LEDGER.md
```

```yaml
term: Identifier fork
definition: |
  Two cycles independently allocating the same identifier because each computed it as max(N)+1
  against its own view of a shared registry, and the views had diverged. Neither cycle errs; the
  defect is structural, and it is invisible to any check that inspects one repository state,
  because within either branch the allocation is correct and unique. The canonical instance is
  META_LEDGER Entry #597, where two PRs each appended a different #597 chaining off #596. The same
  mechanism produced FX935 in docs/FEATURE_INDEX.md on 2026-09-04 - PR #445 allocated it on
  2026-08-24 when the highest was FX934, and Entry #602 allocated it on 2026-09-03 having seen
  FX933 as highest on main, because FX934 belonged to an unmerged cycle. FX934 itself was forked
  the same way, and the older of its two claims is the plan for check-governance-structure.cjs, a
  detector scoped in its own words to catch "a FEATURE_INDEX with two FX930 rows": it collided on
  its own identifier before it was implemented. Detection must therefore precede merge - a
  post-merge check sees only the winner, and renumbering afterwards invalidates every downstream
  reference. Resolution is by precedence rather than by math; this repository rules that the older
  claim wins, with shipped work outranking a dormant claim from an unimplemented plan. Distinguished
  from a [[Vacuous pass]]: a vacuous check inspects nothing, whereas an identifier-fork check can
  inspect exhaustively and still be blind, because the evidence is not in the state it can see.
home: FailSafe/extension/src/test/governance/feature-index-id-integrity.test.cjs
introduced_in_plan: plan-fx935-collision-renumber
referenced_by:
  - docs/FEATURE_INDEX.md
  - docs/META_LEDGER.md
```

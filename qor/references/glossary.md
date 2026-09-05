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

```yaml
term: Falsifiability probe
definition: |
  A check that reports whether other checks can be made to fail. It runs each target control twice -
  once against a fixture that must produce no finding, once against a fixture that must produce one -
  and classifies the result FALSIFIABLE, NOT-FALSIFIABLE, INCONCLUSIVE, or INAPPLICABLE. It answers
  "can this control fail?", never "does this control check the right thing"; a control can be
  falsifiable by its fixture and still assert the wrong property.
  Motivated by ledger #602, where five ABORT-class controls were found returning success while
  inspecting nothing, none of it visible in any exit code. Distinguished from a [[Vacuous pass]] by
  direction: a vacuous pass is the defect, a falsifiability probe is the instrument that finds it.
  Three properties are load-bearing. (1) The probe must carry its own falsifier - a stub exiting 0 on
  both fixtures that must classify NOT-FALSIFIABLE - because a probe reporting FALSIFIABLE for
  everything is itself a vacuous control, and worse than none since it manufactures confidence in the
  opposite direction. (2) A non-zero exit on the defect run is insufficient evidence; the run must
  also carry the control's own signal, because a usage error or crash otherwise reads as successful
  falsification. (3) Fixtures cannot be generated generically - each is built against the control's
  real detection patterns and invocation contract read from source, since a wrong fixture reports a
  working control as unfalsifiable.
  A control that is inapplicable to the host archetype is declared with its evidence rather than
  probed; reporting it as unfalsifiable would be true and misleading.
home: FailSafe/extension/scripts/qor-conformance-probe.cjs
introduced_in_plan: plan-233b-conformance-probe
referenced_by:
  - docs/FEATURE_INDEX.md
  - docs/META_LEDGER.md
```

```yaml
term: Disclosed-skip emission
definition: |
  Writing a machine-readable event when a control skips because it names a property this repository
  can never satisfy - as distinct from printing a SKIP line and moving on. Phase 75 declarative
  tolerance assigns the emission to the operator or skill, not to the control: the control prints,
  the operator emits a severity-1 gate_skipped_prerequisite_absent event, and permanent_skips stamps
  that event closed when the repository has declared the gate in .qorlogic/config.json.
  The chain has three links and only the last existed here. A control skipped on every seal; nothing
  ever emitted the event (this repository's Process Shadow Genome held ZERO of them across every seal
  it had ever performed); and permanent_skips worked correctly with nothing to close. data_api_acl_lint
  prints "(Phase 75 disclosed-skip)" but contains no shadow_process reference - the string is prose.
  So inapplicability lived only in ledger narrative, which nothing can read.
  Two properties are load-bearing. (1) An UNDECLARED skip must stay open: if emission wrote events
  closed unconditionally, every skipping gate would look handled and the declaration would do no work
  at all - the same shape as a [[Vacuous pass]], one layer up. (2) Closure semantics stay upstream's
  (the cannot-automate: enforcer prefix, the >=50-character justification, the closable-event-type
  restriction), because a local reimplementation drifts from the toolkit on the next minor.
  A declaration read by both the toolkit and the [[Falsifiability probe]] gives applicability one
  source of truth instead of two that can disagree.
home: FailSafe/extension/scripts/qor-skip-emitter.cjs
introduced_in_plan: plan-233c-applicability-declaration
referenced_by:
  - docs/FEATURE_INDEX.md
  - docs/META_LEDGER.md
```

## Tested-against version

```yaml
term: Tested-against version
definition: >
  The qor-logic version the [[Falsifiability probe]] last PASSED against, recorded as a constant
  and reported wherever the consumer boundary is surfaced. It records a RESULT, not an intention:
  it may be advanced only after a passing probe run on the new version.
  It exists because the alternative was an upper bound, and an upper bound cannot work. A maximum
  has to be chosen before anyone knows which future release breaks you - pin it to the current
  version and every upstream release trips it, producing a ceiling bumped by hand each cycle that
  verifies nothing; pin it optimistically and it never fires. Either way it becomes a
  [[Vacuous pass]]: a declaration reporting success while inspecting nothing.
  The evidence is that a version FLOOR could not see any real breakage either. Every qor-logic
  incompatibility this repository actually suffered - a plan schema rejecting a declared key, a
  ladder dropping a flag, controls turning out structurally inapplicable - happened far above the
  declared minimum, with the floor check reporting true throughout. Version comparison cannot
  detect a contract change; running the probe can.
  So the field is a cache key over a probe result, never a substitute for it. When the installed
  version is not the tested-against one, the honest report is "this combination is untested" - a
  state the operator resolves by RUNNING the probe rather than by editing a constant. It is
  advisory by construction: it never blocks a read, because fail-closing on an unprobed version
  refuses work before anyone knows whether anything is wrong.
home: FailSafe/extension/src/qorlogic/hostLayouts.ts
introduced_in_plan: plan-233a-version-boundary
referenced_by:
  - docs/FEATURE_INDEX.md
  - docs/META_LEDGER.md
```

## Declared ledger anchor

```yaml
term: Declared ledger anchor
definition: >
  A recorded entry number below which ledger chain failures are tolerated as disclosed historical
  residue, and above which every entry is re-verified on each run. It replaces an AUTO-DETECTED
  boundary that is computed as the highest entry currently verifying - which, because each seal
  appends a valid entry, advances to that entry and absorbs the whole preceding history into the
  tolerated region.
  The auto-detected form leaves a protected surface exactly one entry deep while reporting text
  that reads as a whole-chain attestation, which makes it a [[Vacuous pass]] in the one control
  whose entire purpose is detecting retroactive alteration. Measured on this repository: corrupting
  a mid-ledger entry's chain hash was invisible, and the same corruption under a declared anchor is
  caught by entry number.
  Two properties are load-bearing. (1) An absent declaration must be an ERROR, never a fall-back to
  auto-detection - otherwise removing one config key silently restores the one-entry-deep behaviour
  while every gate still reports clean. (2) The anchor value must be PINNED rather than bounded by
  a threshold on the protected count, because such a threshold decays as the ledger grows: a guard
  against a ratchet must not itself be ratchetable.
  Tolerating residue below the anchor is deliberate, not laxity - fail-closing over a history that
  already contains disclosed pre-tooling failures would block every seal, so the anchor separates
  debt that is dated and recorded from alteration that is not.
home: FailSafe/extension/scripts/check-ledger-anchor.cjs
introduced_in_plan: plan-233d-ledger-anchor
referenced_by:
  - docs/FEATURE_INDEX.md
  - docs/META_LEDGER.md
```

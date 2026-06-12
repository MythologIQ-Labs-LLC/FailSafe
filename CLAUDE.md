# QoreLogic S.H.I.E.L.D. Governance (Claude Code)
Follow the rules in .claude/agents/ and .claude/skills/.
All writes are subject to EnforcementEngine (FailSafe Extension).
Use /qor-status to check current governance state.

**Governance map: `docs/GOVERNANCE_INDEX.md`** — authoritative hierarchical index of every governance artifact in this repo. Any cycle that writes governance (substantiate, repo-release, document, bootstrap) MUST refresh the "Last Reviewed" date and register any new artifacts in the appropriate tier. A stale index entry IS a governance bug.

**Tracker taxonomy directive (FX891):** the operator-declared programs ∥ verticals + agent→program/vertical mappings live in `docs/roadmap/tracker-config.yaml` (authored via the Console's Workspace › Taxonomy editor; emitted record at `.failsafe/governance/tracker-taxonomy.directive.md`). Any cycle that plans tracker or feature-scope work MUST consult `docs/roadmap/tracker-config.yaml` and align to that declared taxonomy. A divergence between the declared taxonomy and the actual `docs/roadmap/programs.yaml` / `docs/FEATURE_INDEX.md` surfaces is a drift bug to surface, not silently reconcile. (`tracker-config.yaml` is the source of truth; phases/timeline stay in `programs.yaml`.)
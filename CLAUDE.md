# QoreLogic S.H.I.E.L.D. Governance (Claude Code)
Follow the rules in .claude/agents/ and .claude/skills/.
All writes are subject to EnforcementEngine (FailSafe Extension).
Use /qor-status to check current governance state.

**Governance map: `docs/GOVERNANCE_INDEX.md`** — authoritative hierarchical index of every governance artifact in this repo. Any cycle that writes governance (substantiate, repo-release, document, bootstrap) MUST refresh the "Last Reviewed" date and register any new artifacts in the appropriate tier. A stale index entry IS a governance bug.

**Product taxonomy and architectural authority:** The Console's implemented navigation defines the product's actual tabs and subviews. The operator's `docs/roadmap/tracker-config.yaml`, when present, records intended tracker taxonomy and mappings. Report disagreements as drift; do not silently reconcile them. `docs/roadmap/programs.yaml` governs tracker programs and phases. `docs/ARCHITECTURE_INDEX.md` governs architectural document authority.
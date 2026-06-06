# Governance Index

**Last Reviewed:** 2026-06-06 (SUBSTANTIATE — **GitHub PR↔issue linkage governance auditor** (#154), META_LEDGER Entry #427. Pure `pr-linkage-audit.ts` (FX861) — GitHub's 9 close-keywords applied per-number so `Closes #1, #2` flags `#2` as a silent non-close (the footgun that stranded #166/#167/#172/#174); findings → deterministic Check Run conclusion + off-by-default injected-transport live path, beside the #96 SHIELD check. 9 unit tests; backend logic, no Playwright gate. Held local on `feat/pr-linkage-governance-154`; awaits `--admin` merge + release decision. _Prior: DELIVER — **v5.6.2 publish** (Tracker loading/freshness + FX525 de-flake), META_LEDGER Entry #426. Tracker loading skeleton + "last refreshed" + manual Refresh (#163, FX860) + the FX525 test-teardown de-flake (`close()` now calls `server.stop()`). PR #187 `--admin`-merged (tag `v5.6.2` `87d3e9a`); Build & Test passed on the first pipeline run (the de-flake held — no dead-tag, contrast v5.6.1); published (Open VSX live at 5.6.2; VS Code Marketplace job succeeded, query-API ingestion lag at seal). Closes #163. _Prior: SUBSTANTIATE — **Tracker loading/freshness (#163) + FX525 de-flake** for v5.6.2, META_LEDGER Entry #425. Tracker dashboard loading skeleton + "last refreshed" stamp + manual Refresh (FX860, pure client-side, no server contract change); FX525 teardown de-flake (root cause: leaked ConsoleLifecycleService ledgerWatcher; the test helper `close()` now calls `server.stop()` — 36/36 under 4x3 stress, fixing the flake that dead-tagged the v5.6.1 pipeline). Held local on branch `feat/tracker-loading-freshness-163`; awaits bump + `--admin` merge + `production` publish for v5.6.2. _Prior: DELIVER — **v5.6.1 dual-marketplace publish** (Development Tracker for any repo), META_LEDGER Entry #424. Non-semver render resilience + manifest generator + Bicameral-MCP Layer 3 enrichment + operator-confirmed taxonomy. Published to VS Code Marketplace + Open VSX (tag `v5.6.1` `d3d7f57`, both verified live at 5.6.1; production-gate approved; Build & Test cleared one pre-existing FX525 teardown flake on re-run). PRs #183 + #184 `--admin`-merged. Closes #174/#172/#167/#166. _Prior: SUBSTANTIATE — **Development Tracker generator + operator categorization** (#174), META_LEDGER Entry #423. Non-semver (PR-incremental) render resilience + manifest generator (PRs → CHANGELOG → programs.yaml) + Bicameral-MCP Layer 3 enrichment + operator-confirmed taxonomy (keep/drop/rename/fold). `tracker-dashboard.spec.ts` 3/3 in real chromium closes the user-facing-visual e2e gate the prior render fix lacked. FX857–FX859 + e2e on FX847. Held local on branch `feat/tracker-manifest-generator` (PR #183, supersedes #182); awaits operator bump + `--admin` merge + `production` publish. Current release v5.6.0 (DELIVER #422, ACP governance). _Prior: 2026-06-04 (DELIVER — **v5.5.1 dual-marketplace publish** (Maintenance), META_LEDGER Entry #419. Squash-merged via PR #162; published to VS Code Marketplace + Open VSX (tag `v5.5.1` `f130701`, both publishes production-gate-approved, GitHub Release auto-created). Four evaluated Dependabot Action bumps to Node.js 24 runtimes (checkout v6.0.3, setup-node v6.4.0, upload-artifact v7.0.1, download-artifact v8.0.1, SHA-pinned) + Development Tracker error-surfacing fix; the upload-v7 → download-v8 publish hand-off validated end-to-end; PRs #155–#158 incorporated. Issues #161 (Windsurf compat) + #163 (tracker progress/freshness) filed; CodeQL ruleset confirmed an intentional human-gate (merges used operator `--admin`). _Prior: DELIVER — **v5.5.0 dual-marketplace publish** (Integration Suite), META_LEDGER Entry #418. Squash-merged via PR #153 + release PR #159; published to VS Code Marketplace + Open VSX (tag `v5.5.0` `201152a`, both publishes production-gate-approved, GitHub Release auto-created). /qor-substantiate VETO remediation caught 4 external-name defects against live docs (Aider `--yes-always`, Sentry env-in-query, OpenHands real-SDK shape, Linear case-insensitive); 15 per-integration READMEs + `INTEGRATION_STRUCTURE_STANDARD.md` (Tier 5) + FEATURE_INDEX FX826–FX836; closes #90/#96/#97/#98/#101/#102/#104/#105/#106/#107; enhancement #154 filed; merges used operator-authorized `--admin` (CodeQL ruleset still blocks). _Prior: Registered `docs/integrations/INTEGRATION_DOCS_INDEX.md` — maintained documentation-links registry for every integration (grounding for verify-external-names) — added in the #102 Sentry ingest cycle. _Prior: 2026-06-03 (DELIVER, META_LEDGER Entry #417 — v5.4.3 dual-marketplace publish: **Development Tracker** (B-INT-17, premium data-driven dashboard at `/console/tracker`, embedded in the Workspace tab; full-history CHANGELOG discovery + major-default timeline zoom + per-release traceable record + tiered program-progress) + **Agent Governance Toolkit installer** (B-INT-16, env-auto-detected Integrations sub-view). Tag `v5.4.3` `2c7b49c`; both publishes by CI (production-gate approved); GitHub Release **auto-created** by the new `github-release` job. Build & Test cleared one `idle-scheduler` timer flake on re-run. A new `code_scanning`/`code_quality` main ruleset (unconfigured CodeQL) blocked the merge until an operator ruleset bypass. BACKLOG v5.4.3 → RELEASED. PRs #140 + #141 + #142. _Prior: Entry #416 — v5.4.2 Integration Expansion._) v5.4.2 RELEASED to VS Code Marketplace + Open VSX via tag `v5.4.2` `fdbf779` (both publishes by CI, approved at the `production` reviewer gate); GitHub Release object created (page had frozen at v4.8.0) + `github-release` job added to `release.yml` (PR #136). Two prior tags died in the pipeline and were left as forward-only dead tags: v5.4.0 `1563c80` (stale B-INT-5 pill test) + v5.4.1 `02a7d8f` (VS Code stable auto-update 1.122.1→1.123.0 broke the `better-sqlite3` native rebuild; fixed by pinning the VS Code test version). Batch: SARIF #99, MCP Registry #108, Slack #100, Context7/Mermaid installers B-INT-13/14, Dev Tracker v1/v1.1, B-SUBSTRATE-2/3, research gate #109. Closed #99/#100/#108/#95/#109. BACKLOG v5.4.0/v5.4.1 → DEAD TAG, v5.4.2 → RELEASED. Merge chain: PRs #121–#136. _Prior: Entry #415 — v5.3.3 Integration Beta._))
**Maintainer:** every cycle that touches governance artifacts (write-time obligation, not periodic chore)
**Purpose:** Authoritative hierarchical index of every governance artifact in this repository. Every governance doc MUST be registered here. Drift in this index = governance drift.

> **Why this exists.** Governance docs accumulated across 6 directories (`./`, `docs/`, `.failsafe/governance/`, `.failsafe/governance/plans/`, `.agent/staging/` deprecated, `.failsafe/archive/`). Without an index, individual docs went stale silently. One incorrect value in a stale governance doc can cascade — e.g., a stale `SYSTEM_STATE.md` version line drives a `/qor-status` mis-routing → wrong skill invoked → cycle starts from wrong baseline. The index is the canonical map; the freshness contract per tier is the drift gate.

## Tier model

Every governance artifact belongs to exactly one tier. The tier determines:
- **Freshness contract** — when staleness is a bug.
- **Review cadence** — when an automated or manual sweep MUST happen.
- **Drift signal** — what a reader sees when this doc is wrong.
- **Owner skill** — which `/qor-*` skill is responsible for keeping it current.

| Tier | Name | Freshness contract | Review cadence | Drift signal |
|---|---|---|---|---|
| 1 | Canonical Source | MUST be current at every cycle close | every `/qor-substantiate` + every `/qor-repo-release` | wrong version, wrong state, missing recent entries |
| 2 | Doctrine & Policy | stable; changes are explicit doctrine events | quarterly + on operator policy reversal | rules contradict each other or contradict CLAUDE.md memory |
| 3 | Active Initiative | live until close; ages out at substantiate | cycle-close gate + before next cycle resumes the initiative | references shipped features as "pending", or vice versa |
| 4 | Per-Plan Artifact | live for plan duration; archived at substantiate | seal-time | plan shipped but artifact still presents as "open" |
| 5 | Reference Material | informational, slow-drift | semi-annual | factual claims diverge from current code/contracts |
| 6 | Archived | frozen historical record | annual chain-integrity spot-check | none (frozen by definition) |

---

## Tier 1 — Canonical Sources

Always-current. A stale Tier 1 doc IS a P0 governance bug.

| Path | Purpose | Owner skill | Drift signal |
|---|---|---|---|
| `CLAUDE.md` | Operator instructions + project memory references | manual + memory sync | references shipped doctrine as pending or vice versa |
| `GOVERNANCE.md` | SHIELD framework definition (S/H/I/E/L/D phase contracts) | `/qor-bootstrap` | phase contracts diverge from installed `/qor-*` skills |
| `AGENTS.md` / `GEMINI.md` | Cross-agent root pointers (Codex / Gemini / Copilot / Cursor / Windsurf etc.) | `/qor-bootstrap` re-scaffold | new agent SDK released, no entry here |
| `README.md` (root) | Public-facing positioning + Current Release marker | `/qor-document` RELEASE_METADATA + `/qor-repo-release` | version marker behind `package.json` |
| `FailSafe/extension/README.md` | Extension-marketplace README + Current Release marker | `/qor-document` RELEASE_METADATA + `/qor-repo-release` | version marker behind `package.json` |
| `CHANGELOG.md` (root + extension copy) | Release notes per version | `/qor-document` RELEASE_METADATA | DELIVER entry in `META_LEDGER` without matching CHANGELOG section |
| `docs/CONCEPT.md` | Genesis intent — what FailSafe is and is not | `/qor-bootstrap`; mutations require `/qor-ideate` + audit | drift from public framing in README/CHANGELOG |
| `docs/ARCHITECTURE_PLAN.md` | Current architecture baseline + Risk Grade | `/qor-plan` updates; `/qor-audit` reviews | components shipped but not described, or vice versa |
| `docs/META_LEDGER.md` | Merkle-chained decision ledger; **chain integrity is load-bearing** | `/qor-substantiate` (appends) + `/qor-validate` (verifies) | chain hash mismatch, missing entries, gaps in numbering |
| `docs/SYSTEM_STATE.md` | Living snapshot of seal-state, current release, active integrations | `/qor-document` SESSION_DOCS + `/qor-substantiate` (post-seal update) | "Last Updated" older than latest sealed entry |
| `docs/BACKLOG.md` | All backlog items + version summary table | every cycle that ships, audits, or closes an item | row status diverges from `META_LEDGER` DELIVER |
| `docs/FEATURE_INDEX.md` | Cross-reference of every feature → source / docs / test / verification status | `/qor-substantiate` (FEATURE_INDEX gate) | feature shipped without FX entry OR FX `unverified` for shipped feature |
| `docs/GOVERNANCE_INDEX.md` (this file) | Authoritative map of every governance artifact in this repo | every cycle that touches governance | new governance doc created without index entry |
| `package.json` (root + extension) | Authoritative version source — every other version marker derives from this | `/qor-repo-release` release-gate.cjs | other version markers ahead of or behind this |

---

## Tier 2 — Doctrine & Policy

Stable rules. Changes are explicit doctrine events recorded in `META_LEDGER` and operator memory.

| Path | Purpose | Owner |
|---|---|---|
| `CODE_OF_CONDUCT.md` | Community conduct rules | manual (rare) |
| `CONTRIBUTING.md` | External contributor workflow | manual |
| `SECURITY.md` | Security vulnerability disclosure process | manual |
| `confidentiality.md` (root) | What is public / private / Pro-only for this codebase | operator memory + manual; revised 2026-04-25 for v5 reveal |
| `.failsafe/governance/PUBLISH_BLOCK.md` | Active publish-block flag + lift conditions | `/qor-repo-release` checks; `/qor-substantiate` lifts |
| `.failsafe/governance/doctrine-shadow-genome-countermeasures.md` | Shadow Genome pattern doctrine (SG-* IDs) | `/qor-process-review-cycle` |
| `docs/AUTONOMOUS_RELIABILITY_MANIFEST.md` | Reliability gate posture across phases | `/qor-audit` references |
| `docs/CORE_AXIOMS_AND_RULES_COMPILED.md` | Compiled axioms + rules from doctrine | manual sync |
| `docs/FILE_STRUCTURE_STANDARD.md` | Where each kind of file belongs | manual; `/qor-organize` enforces |
| `docs/governance-cache-invalidation.md` | Cache invalidation discipline doctrine | manual |
| `docs/governance-mode-transitions.md` | Mode-transition state machine doctrine | manual |
| `docs/PROCESS_SHADOW_GENOME.md` + `PROCESS_SHADOW_GENOME_UPSTREAM.md` | Process-level failure pattern catalogue | `/qor-shadow-process` |
| `docs/REPO_GOVERNANCE.md` | Repo-level governance posture | manual |
| `docs/SHADOW_GENOME.md` | Code-level shadow genome catalogue | `/qor-meta-track-shadow` |
| `docs/MINIMAL_HOOKS_GUIDE.md` | Hooks doctrine for Claude Code settings | manual |
| `docs/PLUGIN_INTERFACE_PROPOSAL.md` | Plugin interface design proposal | manual |
| Operator memory at `~/.claude/projects/.../memory/feedback_*.md` | Durable operator-stated rules | session-level; only the operator may edit |

---

## Tier 3 — Active Initiative Tracking

Live until close. Must be archived at substantiate, or moved to Tier 4 if they become per-plan.

| Pattern | Location | Lifetime |
|---|---|---|
| `SESSION_STATE_*.md` | `.failsafe/governance/` | from cycle start to substantiate or pause |
| `REMEDIATION_*.md` | `.failsafe/governance/` | from remediation proposal to next seal |
| `RESEARCH_BRIEF_*.md` (active) | `.failsafe/governance/` | from research close to plan supersede or substantiate |
| `IDEATION_*.md` | `.failsafe/governance/` | from `/qor-ideate` to plan supersede |
| `CONTENT_MATRIX_*.md` | `.failsafe/governance/` | from authoring start to substantiate |
| `entry-<N>-body.md` (newest) | `.failsafe/governance/` | from authoring to META_LEDGER append (then optional retention as reference) |

**Current Tier 3 occupants (as of 2026-05-28 housekeeping):**

- `SESSION_STATE_open-design-integration-v1.1.md` (recent seal at #405; keep until next post-v1.1 cycle reviews)
- `SESSION_STATE_bicameral-mcp-integration.md` (Phase 4-5 carryover at `.failsafe/archive/SESSION_STATE_bicameral-mcp-integration.md`)
- `REMEDIATION_open-design-v1.1-2026-05-27.md`
- `RESEARCH_BRIEF_open-design-integration-{,-v1.1,-v2-model2}-2026-05-27.md`
- `RESEARCH_BRIEF_qor-substrate-modules-v1-2026-05-27.md`
- `RESEARCH_BRIEF_bicameral-mcp-integration.md` + `AUDIT_REPORT_bicameral-mcp-integration.md`
- `RESEARCH_BRIEF_failsafe-learn-swe-craft.md` + `CONTENT_MATRIX_failsafe-learn-swe-craft.md` + `IDEATION_failsafe-learn-swe-craft.md`
- `IDEATION_educational-component.md`
- `RESEARCH_BRIEF_procedural-failure-signal-channel.md`
- `entry-{395..406}-body.md` (META_LEDGER source bodies; retain through next housekeeping cycle)

---

## Tier 4 — Per-Plan Artifacts

Plans and their immediate audit/implementation/substantiation reports. Archive at substantiate-seal-time.

| Pattern | Location | When to archive |
|---|---|---|
| `plan-*.md` (root) | `./` | at substantiate seal of the plan |
| `plan-*.md` (workspace) | `docs/` | at substantiate seal of the plan |
| `plan-*.md` (mirror) | `.failsafe/governance/plans/` | at substantiate seal of the plan |
| `AUDIT_REPORT_<plan>.md` | `.failsafe/governance/` | at substantiate of that plan |
| `IMPLEMENTATION_REPORT_<plan>.md` | `.failsafe/governance/` | at substantiate of that plan |
| `SUBSTANTIATE_REPORT_<plan>.md` | `.failsafe/governance/` | at next housekeeping cycle |
| Plan iteration drafts (v1/v2 superseded by final v3 etc.) | as above | at audit PASS of final iteration |

**Outstanding Tier 4 cleanup (deferred from this cycle):**

- ~50 plan-*.md files in `.failsafe/governance/plans/`, many for already-shipped versions (v4.6.0, v4.9.5, v5-round1-4, skill-consolidation v1/v2 superseded by v3, v4.10.1 iterations that never publishably shipped). A targeted archive pass is scoped for a follow-up cycle.
- ~50 plan-qor-*.md files in `docs/`, similar mix.

---

## Tier 5 — Reference Material

Informational. Slow-drift. Reviewed semi-annually unless cited by an active cycle.

| Path | Purpose |
|---|---|
| `FILE_INDEX.md` (root) | Repo file inventory (informational; SYSTEM_STATE supersedes for governance state) |
| `docs/EDUCATION.md` | Educational subsystem design reference |
| `docs/FAILSAFE_SPECIFICATION.md` | Top-level product specification |
| `docs/INTEGRATIONS.md` | Integration surface documentation (Bicameral + Open Design) |
| `docs/integrations/INTEGRATION_DOCS_INDEX.md` | Maintained registry of official docs for every integration; canonical source for verify-external-names; per-cycle refresh required |
| `docs/LEARN_TAB.md` | Learn tab design reference |
| `docs/ROADMAP.md` | Forward-looking roadmap (not authoritative for current state — that's `SYSTEM_STATE`) |
| `docs/UI_MANIFEST.md` | UI module manifest |
| `docs/SUBSTRATE_MODULES.md` | qor.scripts substrate v1 reference (added v5.3.0) |
| `docs/VIBE_CODER_PLAYBOOK.md` | Audience-targeted onboarding playbook |
| `docs/test-patterns.md` | Test pattern catalogue |
| `docs/research-brief-*.md` (historical) | Sealed research briefs retained for back-reference |
| `docs/release-runbook-v5-1-0.md` | Historical release runbook (kept as template for future runbooks) |
| `.failsafe/governance/FEATURE_INVENTORY_CODE.md` + `FEATURE_INVENTORY_DOCS.md` | Inventory snapshots (slow-drift) |
| `.failsafe/governance/DEPLOYMENT_TELEMETRY_ROADMAP.md` | Forward roadmap for runtime telemetry |
| `.failsafe/governance/PROPRIETARY_SKILLS_MIGRATION_STATUS.md` | Migration status reference |
| `.failsafe/governance/host-registry.schema.json` | Host registry schema |
| `.failsafe/governance/RESEARCH_BRIEF_skill-consolidation.md` | Skill consolidation research (cited in CLAUDE.md memory) |
| `.failsafe/governance/RESEARCH_BRIEF_agent-failsafe-current-state.md` | Agent-side current-state research |
| `.failsafe/governance/RESEARCH_BRIEF_agt-sre-architecture.md` | Microsoft AGT SRE adapter target reference |
| `.failsafe/governance/BROWSER_VERIFICATION.md` | Browser verification procedure reference |

---

## Tier 6 — Archived

Frozen historical record. Do not modify. Read-only.

| Pattern | Location | Provenance |
|---|---|---|
| `.failsafe/archive/2026-05-stale-cleanup/{agent-staging,governance-root,v5.1.x-shipped,plan-artifacts-shipped,entry-drafts}/` | (gitignored) | Created 2026-05-28 by `/qor-auto-dev-1` housekeeping cycle; 21 files relocated from `.agent/staging/` (deprecated path) and `.failsafe/governance/` root |
| `.failsafe/archive/AUDIT_REPORT_2026-03-11_*.md`, `AUDIT_REPORT_2026-05-05_*.md` | (gitignored) | Pre-existing archives |
| `.failsafe/archive/SESSION_HANDOFF_2026-*.md`, `SESSION_STATE_*.md`, `SESSION_CHANGE_REPORT_*.md` | (gitignored) | Pre-existing archives |
| `.failsafe/archive/IMPLEMENTATION_PLAN.md`, `GapAudit.md`, `LEDGER_UPDATE.md`, `MANIFEST_MIGRATION.md`, `REORGANIZATION_SUMMARY.md` | (gitignored) | Pre-existing archives |
| `.failsafe/archive/plan-*.md` (historical) | (gitignored) | Pre-existing |
| `.failsafe/archive/quarantine-retired/`, `stale-configs/` | (gitignored) | Pre-existing quarantine bins |

---

## Drift Detection Contract

Every cycle that produces governance writes (`/qor-substantiate`, `/qor-repo-release`, `/qor-document` RELEASE_METADATA, `/qor-bootstrap`) MUST:

1. **Verify Tier 1 coverage** — every Tier 1 doc has a "Last Updated" or equivalent freshness marker. Any marker older than the most recent sealed `META_LEDGER` entry is a drift bug; fix before declaring the cycle done.
2. **Register new artifacts** — any new doc written under `./`, `docs/`, `.failsafe/governance/`, or `.failsafe/governance/plans/` MUST be added to the appropriate tier table in this file in the same commit that creates it.
3. **Move Tier 3 → Tier 6 at seal** — substantiate-time obligation: every `SESSION_STATE_*`, `REMEDIATION_*`, `IDEATION_*`, `CONTENT_MATRIX_*`, and superseded `RESEARCH_BRIEF_*` for the just-sealed plan moves to `.failsafe/archive/`. Entries listed under "Current Tier 3 occupants" above MUST be updated in the same commit.
4. **Move Tier 4 → Tier 6 at seal** — substantiate-time obligation: the just-shipped plan's `plan-*.md`, `AUDIT_REPORT_<plan>.md`, `IMPLEMENTATION_REPORT_<plan>.md`, and `SUBSTANTIATE_REPORT_<plan>.md` all archive in the same commit as the seal.
5. **Refresh THIS index** — the "Last Reviewed" date at the top of this file MUST advance every time a governance write happens. A stale "Last Reviewed" is itself a drift bug.

## How to add a new governance artifact

1. Decide the tier (use the tier model table above).
2. Add the path to the appropriate tier section in this file.
3. If Tier 1 (Canonical Source), also declare the owner skill and drift signal.
4. If Tier 3 (Active Initiative), declare the close condition.
5. Create the artifact and commit both files together.

## How to retire a governance artifact

1. Confirm the tier-specific archive trigger has fired (substantiate sealed, plan shipped, etc.).
2. Move the file to `.failsafe/archive/<YYYY-MM-<reason>>/<subfolder>/`.
3. Update the tier table in this file to either remove the entry or move it to Tier 6 with provenance.
4. Commit the index update in the same commit as the file move (or in a paired housekeeping commit).

---

## Out-of-tier paths (NOT governance — listed here so they are not confused with governance)

| Path | What it is |
|---|---|
| `src/` | Source code (covered by `FEATURE_INDEX.md` Tier 1) |
| `FailSafe/extension/` | Packaged extension source (covered by `FEATURE_INDEX.md` + `package.json`) |
| `tools/`, `scripts/` | Build / release tooling (covered by `package.json` scripts + `FEATURE_INDEX.md` if user-facing) |
| `node_modules/`, `out/`, `dist/` | Build artifacts (ignored) |
| `PRIVATE/`, `FailSafe-Pro/` | Confidential per `CLAUDE.md` (Pro repo separate) |
| `.claude/`, `.qor/`, `.qorlogic/`, `.agent/`, `.failsafe/` | Tool config + runtime state (governance subsets explicitly tiered above; tool state is NOT governance) |

---

**Upstream parallel**: The hierarchical-governance-index pattern itself has been proposed to Qor-logic upstream as a generalizable governance hygiene primitive. If the upstream lands a `GOVERNANCE_INDEX.md` scaffolding template in `/qor-bootstrap`, this file should be reviewed for alignment.

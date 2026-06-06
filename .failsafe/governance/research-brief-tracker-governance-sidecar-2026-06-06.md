# Research Brief — Tracker-as-governance-sidecar + #118 shadow-genome convergence

**Date**: 2026-06-06
**Analyst**: The Qor-logic Analyst (FailSafe)
**Target**: (A) project the Development Tracker manifest from the SHIELD governance/documentation lifecycle (sidecar), not PR/CHANGELOG scraping; (B) consume qor-logic's `shadow_genome_graph` for FailSafe dashboard/trust/federation surfaces (#118). Assess the shared-substrate thesis.
**Review Boundary**: read-only research + this brief. META_LEDGER RESEARCH entry **HELD** (chain has #427 in-flight on unmerged `feat/pr-linkage-governance-154`; ledger entry waits until #154 merges, then it appends after #427/the #154 DELIVER).

---

## Executive Summary

The sidecar thesis is **sound**: every Development Tracker manifest field maps cleanly to an artifact the SHIELD lifecycle already writes, so the tracker can be a *projection* of governance rather than a PR scraper. #118's `shadow_genome_graph` is **also** a governance projection — but it reads a **different source ledger** (`.qor/genome.jsonl` shadow-events) than the tracker would (`META_LEDGER` + `plan-*.md` + `FEATURE_INDEX`). So the convergence is real at the abstraction level: a shared **`GovernanceProjection`** layer that reads multiple governance sources and emits multiple views (tracker manifest, causal graph), **not** a single shared ledger. Both are buildable; recommended first slice is the tracker projection from `META_LEDGER` + plans (Direction A), with the genome graph (Direction B) as a parallel viewer.

## Findings

### A — SHIELD skill outputs → tracker manifest fields (verify-external-names)

| qor skill | Real output (cited) | → Tracker field |
|---|---|---|
| `qor-bootstrap` | `docs/CONCEPT.md`, `docs/ARCHITECTURE_PLAN.md`, `docs/META_LEDGER.md` (Genesis), `docs/BACKLOG.md` (`SKILL.md:22` `<output>`) | **programs** (CONCEPT/ARCHITECTURE intent + structure); rcs seed (BACKLOG version summary) |
| `qor-organize` | reorganization proposal + `FILE_INDEX.md` audit trail; **never** touches `.qor/.failsafe/.claude/.agent` (`SKILL.md:23,37`) | **verticals** (capability areas ≈ directory topology) |
| `qor-plan` | `plan-*.md` with incremental phases + unit-test descriptions (`SKILL.md:26` `<output>`) | **phases** + **programs** (declared) |
| `qor-document` | `CHANGELOG.md`, `README.md`, component docs (RELEASE_METADATA / COMPONENT_DOCS modes) | **rcs** (release notes) + **verticals** (component prose) + **meta** |
| `qor-substantiate` | `META_LEDGER` seal entry + `SYSTEM_STATE.md` snapshot + FEATURE_INDEX verification pass | **decisions** (ledger) + **rcs** (DELIVER entries) + **verticals** (FEATURE_INDEX) + **meta** (SYSTEM_STATE) |

**FailSafe artifacts available to project from today (all present in this repo):** `docs/META_LEDGER.md` (Merkle SHIELD entries — DELIVER → release axis, decisions), `docs/FEATURE_INDEX.md` (FX rows → verticals/features), `docs/BACKLOG.md` (version summary → rcs), `.failsafe/governance/plans/*` (phases/programs), `docs/SYSTEM_STATE.md` (meta snapshot). The tracker's DISCOVERED layer already consumes CHANGELOG + git tags (`TrackerRoute.api`, `tracker-model.discoverReleases`); the PLANNED layer (`programs.yaml`) is what the projection would emit.

### B — `shadow_genome_graph` API (qor-logic, #139/Phase 113; UNBLOCKED)

- **Source/store**: `.qor/genome.jsonl` (`shadow_genome_graph.py:27` `DEFAULT_PATH = ".qor/genome.jsonl"`) — an append-only causal graph over qor-logic's shadow-event model.
- **Model**: `GenomeNodeType` = checkpoint / state / failure / **governance** (`:30`); `GenomeEdgeType` (typed, e.g. `triggered_by`) (`:37`); `GenomeNode`/`GenomeEdge` dataclasses (`:45,:53`).
- **Class `ShadowGenomeGraph`** (`:61`): `add_node(node_type,label,metadata)->str` (`:97`), `add_edge(source,target,edge_type,metadata)->str` (`:104`), `trace_chain(node_id,max_depth)->list[list[str]]` (root→node causal paths, cycle-safe) (`:112`).
- **Export contract** (from `tests/test_genome_graph_export.py`): `to_dict()` → `{nodes:[{label,type,...}], edges:[{type,source,target}]}` (`:20-25`); `to_json()` roundtrips `to_dict()` (`:28-30`); `to_dot()` → Graphviz `digraph` (`:33-38`). **This is the stable consumable contract.**

### B7 — How FailSafe (TS) would consume it

- FailSafe **does not** currently shell the qor-logic CLI for runtime data. It **does** have the interpreter/package infra: `src/qorlogic/PythonInterpreterResolver` + `QorLogicPackageInstaller` + `QorLogicSkillIngestor` (used for install/skill-ingest in `bootstrapServers.ts:20-22`).
- Consumption pattern (lowest-friction, reuses existing infra): resolve Python via `PythonInterpreterResolver`, run a one-liner — `python -c "from qor.scripts.shadow_genome_graph import ShadowGenomeGraph; print(ShadowGenomeGraph('.qor/genome.jsonl').to_json())"` — parse the `{nodes,edges}` JSON in TS, render. **Confirm at plan time** whether qor-logic exposes a dedicated CLI export subcommand (preferred over `-c`); if not, the `-c` path works against the verified `to_json()` contract.

## Blueprint Alignment

| Thesis claim | Actual finding | Status |
|---|---|---|
| Tracker fields are all derivable from SHIELD artifacts | Every field maps to a real skill output / governance doc (table above) | **MATCH** |
| Tracker + shadow-genome share one ledger | They read DIFFERENT ledgers: `META_LEDGER`+plans (tracker) vs `.qor/genome.jsonl` (genome) | **DRIFT** — shared *abstraction*, not shared *source*; substrate must span both |
| FailSafe can consume qor-logic Python output | Yes, via existing `PythonInterpreterResolver`; `to_json()` is the contract | **MATCH** |

## Recommendations

1. **(A, first slice — highest leverage)** Build a pure `GovernanceProjection` reader: `META_LEDGER` (decisions + DELIVER axis) + `.failsafe/governance/plans/*` (phases/programs) + `FEATURE_INDEX` (verticals) → a `TrackerManifest` (the existing `tracker-model.ts` type). Emit `programs.yaml` as a sidecar. Pure + unit-testable; reuses the shipped `TrackerManifest` + render. Priority: **high**.
2. **(Composition)** Governed repo (META_LEDGER/plans/FEATURE_INDEX present) → projection is authoritative; ungoverned repo → keep FX857 generator as fallback; FX859 operator categorization on top of either. Wire emission to a `WorkspaceMutationBus` subscriber on `META_LEDGER`/plan writes (the bus already watches these). Priority: **high**.
3. **(B, parallel)** A read-only shadow-genome viewer: shell `to_json()` via `PythonInterpreterResolver`, render `{nodes,edges}` (the `governance`-typed subgraph is the tracker-relevant slice). Off-by-default; degrade-safe when `.qor/genome.jsonl` absent. Priority: **medium** (depends on operators actually accumulating genome events).
4. **(Substrate)** Define `GovernanceProjection` as the shared abstraction: pluggable *source readers* (ledger / plans / feature-index / genome.jsonl) → pluggable *views* (tracker manifest / causal graph). Don't over-build it up front — extract it once A is real and B starts, to avoid speculative generality (Hickey "Simple Made Easy", per qor-plan doctrine).
5. **Sequencing**: A.1 (projection reader, governed-repo tracker) → A.2 (sidecar emission via bus) → B (genome viewer) → extract the shared substrate. Each is its own `/qor-plan` + `/qor-audit` + governed cycle.

## Held ledger entry

Per instruction, the META_LEDGER **RESEARCH** entry for this brief is HELD (the chain has SUBSTANTIATE #427 on the unmerged #154 branch). Append it after #154's merge/DELIVER lands, chaining off the then-latest entry. This brief lives at `.failsafe/governance/` (gitignored — never reaches public remotes).

---

_Research complete. Findings are advisory — implementation decisions remain with the Governor._

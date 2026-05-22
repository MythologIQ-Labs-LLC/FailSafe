# Plan — v5.1.8 consolidated cycle (v2 — post-VETO revision)

**Target version**: v5.1.8 (patch-line; staged as `[Unreleased]` until `/qor-repo-release`)
**Change class**: `feature` (B-INT-1 adds user-facing surface — triggers the release-class e2e-coverage gate)
**Base**: `main` @ `35fc2f1`
**Branch**: `feat/v5-1-8-cycle`
**Skill**: `/qor-auto-dev-1` orchestrated; SHIELD per-item.
**Risk posture**: B-EM-1 L1, B132 L1, B199-closeout L1 (verification), B-INT-1 L2 (feature, 11 routes + UI).
**FX range**: FX584 onward.

**Revision note (v2).** Plan v1 was VETOed by audit. Six findings, all verified against source, addressed below:
F1/F2 (razor debt understated) → §Razor strategy; F3 (B-EM-1 mischaracterized) + F4 (2 of 5 sites dropped) → Phase 1 rewritten per-site; F5 (B132 UI ghost path) → Phase 2 commits to a concrete element + enumerates consumers; F8 (B132 Playwright missing) → FX590 added. F6/F7 (non-blocking conditions) folded in.

---

## Razor strategy (addresses F1 + F2)

Three files in the B-INT-1 blast radius are **already over or near the 250-line Section-4 razor before this cycle**: `BicameralRoute.ts` 488, `bicameral-card.js` 312, `integrations.js` 248. Fully decomposing them is a refactor far beyond B-INT-1's scope and the orchestrator's no-opportunistic-refactor rule.

**Resolution — isolate all new code in new leaf files; touch the over-razor files by ≤ 2 lines each:**

| File | Now | This cycle | Projected |
|---|---|---|---|
| `roadmap/routes/BicameralRoute.ts` | 488 | +1 line (`registerBicameralToolRoutes(app, deps)` call) | ~489 — pre-existing debt, **not** fixed here |
| `roadmap/routes/bicameralToolRoutes.ts` | — (new) | all 11 routes + the `bicameralToolRoute` factory | < 250 (target ~180) |
| `roadmap/ui/modules/bicameral-card.js` | 312 | +2 lines (mount point for the advanced-tools section) | ~314 — pre-existing debt, **not** fixed here |
| `roadmap/ui/modules/bicameral-advanced-tools.js` | — (new) | section render + invoke wiring | < 250 (target ~160) |
| `roadmap/ui/modules/integrations.js` | 248 | 0 lines — advanced-tools wiring lives entirely in the new leaf | 248 unchanged |

Pre-existing debt is **recorded, not silently accepted**: two new backlog items are filed this cycle —
**B-INT-6** "Decompose `BicameralRoute.ts` (488 L) — extract existing route bodies", **B-INT-7** "Decompose `bicameral-card.js` (312 L)". Every *new* file lands < 250. No file this cycle ends *higher over* the razor than it started except by the ≤ 2-line mount lines, which is the minimum wiring cost and is documented here.

---

## Scope

| # | Item | Class | Primary files |
|---|---|---|---|
| 1 | B-EM-1 — Sentinel-evaluator vs Governance-mode UI disambiguation | fix (L1) | `governance.js`, `integrity.js`, `operations.js`, `tickers.js` + new `sentinel-mode.js` leaf |
| 2 | B132 — Brainstorm node-label silent-truncation feedback | fix (L1) | `BrainstormRoute.ts`, `brainstorm-graph.js` |
| 3 | B199 — CRITICAL test-coverage epic closeout | verification (L1) | `docs/BACKLOG.md` |
| 4 | B-INT-1 — Surface the 11 remaining Bicameral MCP tools | feature (L2) | new `bicameralToolRoutes.ts`, new `bicameral-advanced-tools.js`, +mount in `BicameralRoute.ts` / `bicameral-card.js` |

Out of scope: B-INT-4/B-INT-5, and the B-INT-6/B-INT-7 decomposition debt filed above.

---

## Phase 1 — B-EM-1: Sentinel-mode UI disambiguation (rewritten per-site, addresses F3 + F4)

**Problem.** `SentinelMode = "heuristic" | "llm-assisted" | "hybrid"` (`shared/types/sentinel.ts:13`). Five UI sites render `sentinel.mode` (BACKLOG B-EM-1). Two defects compound: (a) every site falls back to `|| 'observe'` — `'observe'` is a `GovernanceMode`, not a `SentinelMode` (category error / invalid value); (b) some sites present the value with a *governance* label, so the operator cannot tell the Sentinel evaluator mode from the governance mode.

**Per-site treatment** (verified against current source — BACKLOG line numbers were stale):

| Site | Current | Defect | Fix |
|---|---|---|---|
| `governance.js:137` | `cc-badge` = `sentinel.mode \|\| 'observe'` | bare badge, wrong fallback | fallback → `'heuristic'`; ensure the badge's row label reads "Sentinel" (verify surrounding markup; add a `Sentinel:` prefix in the badge if unlabelled) |
| `integrity.js:66-67` | `mode = sentinel.mode \|\| 'observe'`; rendered as **`Governance Mode: ${mode}`** | **name collision** — a `sentinel.mode` value labelled "Governance Mode" | relabel `Governance Mode:` → **`Sentinel Mode:`** (the value IS the sentinel mode); fallback → `'heuristic'` |
| `operations.js:42,~66` | `renderMissionStrip` — `mode = sentinel.mode \|\| 'observe'`, rendered in the mission strip | unlabelled in a governance-context strip | prefix the rendered token with `Sentinel ` (e.g. "Sentinel heuristic"); fallback → `'heuristic'` |
| `operations.js:191` | `Sentinel is operating in <strong>${sentinelStatus?.mode \|\| 'observe'}</strong> mode` | already correctly labelled "Sentinel … mode"; only the fallback is wrong | fallback → `'heuristic'` only |
| `tickers.js:9` | `PROTOCOL <span>${data.sentinelStatus?.mode \|\| 'Unknown'}</span>` | label "PROTOCOL" is ambiguous | relabel `PROTOCOL` → `SENTINEL`; keep `'Unknown'` fallback (a live ticker legitimately shows "Unknown" before first data) |

**Shared helper.** A tiny leaf `roadmap/ui/modules/sentinel-mode.js` exporting `sentinelModeValue(mode)` → `mode || 'heuristic'` (the corrected fallback, **no label** — labels are per-site). The four non-ticker sites call it for the fallback so the corrected default is defined once. `tickers.js` keeps its own `'Unknown'` (different, intentional).

**RD-1.** `sentinelModeValue` is a pure leaf — no DOM, no imports. Per-site label changes are local string edits.

**Test descriptors (write red → green, FX584).**
- FX584.1 — `sentinelModeValue('hybrid')` → `'hybrid'`.
- FX584.2 — `sentinelModeValue(undefined)` → `'heuristic'` (never `'observe'`).
- FX584.3 — `sentinelModeValue('llm-assisted')` → `'llm-assisted'`.
- FX584.4 — jsdom: `integrity.js` derived row renders `"Sentinel Mode: …"` and **never** the substring `"Governance Mode: …"` for the sentinel-sourced value.
- FX584.5 — jsdom: `operations.js` mission strip renders the sentinel token prefixed with `"Sentinel"`.

---

## Phase 2 — B132: Brainstorm node-label truncation feedback (addresses F5 + F8)

**Problem.** `BrainstormRoute.ts:91-93` (`POST /node`) and `:115-117` (`PATCH /node/:id`) apply `.slice(0, 200)` to a node label; the full text is accepted but silently shortened. Responses are `res.json(node)`.

**Consumer audit (F5).** Verified consumers of the two endpoints:
- `brainstorm-graph.js` `addNode` (~:82-92) — **reads** the response. → notice wired here.
- `brainstorm-graph.js` `saveNode` (~:94-106) — `await fetch(...)` **discards** the response. → add a one-line `const updated = await res.json()` so it can surface the notice too.
- `prep-bay.js` `_syncNodesToServer` (~:117-125) — bulk fire-and-forget POST, `.catch(()=>{})`. → **explicitly out of scope** for the notice (background bulk sync, not interactive entry); documented, not silently dropped.

**Fix.**
1. `BrainstormRoute.ts` — extract the cap to `const NODE_LABEL_MAX = 200`. When the incoming label length exceeds the cap, add additive response fields `labelTruncated: true` + `labelOriginalLength: <n>` to the `POST` and `PATCH` JSON responses. Additive only — existing consumers that ignore the fields are unaffected (verified above).
2. `brainstorm-graph.js` — **build a concrete inline notice element** (no toast affordance exists in this module — confirmed). A minimal dismissible `.bs-truncation-notice` div inserted near the graph toolbar, text "Label shortened to 200 characters." Shown by `addNode` and `saveNode` when the response carries `labelTruncated: true`; `saveNode` gains the one-line response read.

**RD-2.** Route fields additive; notice element is new, self-contained, no dependency on a pre-existing toast.

**Test descriptors (FX585).**
- FX585.1 — route `POST /node`: a 250-char label → response `labelTruncated:true`, `labelOriginalLength:250`, stored label length 200.
- FX585.2 — route `PATCH /node/:id`: same truncation contract on edit.
- FX585.3 — route: a 50-char label → response has no `labelTruncated` (or `false`).
- FX585.4 — jsdom: `addNode` given a `labelTruncated:true` response renders `.bs-truncation-notice`; without the flag, no notice.
- FX590 — **Playwright** (release-class gate): in the Brainstorm UI, add a node with a > 200-char label → the truncation notice appears; the persisted node label is 200 chars.

---

## Phase 3 — B199: epic closeout (addresses F7 condition)

**Problem.** B199 (CRITICAL) parent checkbox still `[ ]`. Phases 1–9 + sub-items B-B199-1..6 are individually `[x]`.

**Fix (verification + documentation only — no code).**
1. Produce a **per-phase FEATURE_INDEX audit table** (binding condition F7): for each B199 Phase 1–9 and each B-B199-1..6, record the cited FX id(s), whether the FEATURE_INDEX row is `verified`, and whether the cited `.spec.ts` exists on disk. Required FX set to confirm: FX512, FX519–FX525, FX535/FX536, FX539, FX570–FX575 (and any others the BACKLOG status block cites).
2. If **every** row confirms → flip B199 parent `[ ]` → `[x]` in `docs/BACKLOG.md` with a closure summary.
3. If **any** row fails → do NOT flip; file the gap as a new sub-item and surface at handoff.

**Evidence** = the audit table, reproduced in the substantiate report. No test descriptors (verification task).

---

## Phase 4 — B-INT-1: surface the 11 remaining Bicameral MCP tools (addresses F1/F2/F6)

**Problem.** `BicameralMcpClient` already exposes all 11 typed methods (`ingest`, `search`, `brief`, `judgeGaps`, `resolveCompliance`, `linkCommit`, `update`, `reset`, `dashboard`, `validateSymbols`, `getNeighbors` — verified `BicameralMcpClient.ts:220-288`, B-BIC-19). No routes, no UI.

**Fix.**
1. **New file `roadmap/routes/bicameralToolRoutes.ts`** — holds the `bicameralToolRoute(app, deps, spec)` factory **and** all 11 `POST /api/actions/bicameral-<tool>` registrations, plus an exported `registerBicameralToolRoutes(app, deps)`. Each route: `rejectIfRemote`-scoped, `409` when the client is disconnected, body-validated, result JSON-returned — mirroring the existing `bicameral-history`/`-drift`/`-ratify` handlers.
2. **Governance split.** Mutation tools (`ingest`, `update`, `reset`, `resolveCompliance`, `linkCommit`) route through the existing `governToolCall` interceptor seam (`BicameralRoute.ts:162-178`). Query tools (`search`, `brief`, `judgeGaps`, `dashboard`, `validateSymbols`, `getNeighbors`) call the client method directly. **F6 note**: the legacy precedent governs all three of `history`/`drift`/`ratify` incl. the read-only `drift`; this plan's split is a deliberate, defensible refinement (govern only state-changing tools) — recorded here so it is not mistaken for drift.
3. **`BicameralRoute.ts`** — one new line: `registerBicameralToolRoutes(app, deps)` inside the existing route-setup function.
4. **New file `roadmap/ui/modules/bicameral-advanced-tools.js`** — a leaf module exporting `renderAdvancedTools(state)` + `bindAdvancedTools(root, handlers)`: a collapsed-by-default `<details>` "Advanced tools" section listing the 11 tools as labelled invoke rows with the minimal input each needs (`search`→query, `brief`/`judgeGaps`→feature, `dashboard`/`reset`→none, etc.), a result area, and capability-gating (a tool absent from the `/status` `capabilities` array renders disabled — reuses B-BIC-13). All fetch wiring to the new routes lives here.
5. **`bicameral-card.js`** — two new lines: import + a mount call placing the advanced-tools section into the running-state card.

**RD-4.** Both new files are leaves (one-way deps: routes file ← `BicameralRoute.ts`; UI leaf ← `bicameral-card.js`). No change to the existing connect/sync/decision-row surface. `integrations.js` untouched.

**Test descriptors (FX586–FX589).**
- FX586 — `bicameralToolRoute` factory: a `governed:true` spec routes through `governToolCall`; `governed:false` calls the client directly; disconnected client → `409`; malformed body → `400`. (4 mocha cases.)
- FX587 — the 11 registrations: each `POST /api/actions/bicameral-<tool>` invokes the matching client method once with the parsed args and returns its result; a remote caller is `rejectIfRemote`-blocked. (Representative: 1 governed + 1 query + the remote-block + a table-driven sweep asserting all 11 paths register — mocha.)
- FX588 — `bicameral-advanced-tools.js` `renderAdvancedTools`: 11 rows render; a tool absent from `capabilities` renders disabled; the `<details>` is collapsed by default. (jsdom.)
- FX589 — **Playwright** (release-class gate): Integrations panel → expand "Advanced tools" → invoke `dashboard` → result area populates. Fixture-stubbed bicameral client (no live `pip`).

---

## Phase 5 — UI finishing pass + full-suite verification (operator-directed, post-implementation)

Added after the initial four phases reached the Review Boundary, on operator direction ("we're so totally not done with 5.1.8"). Three items:

1. **CSS / visual styling.** The B-INT-1 Advanced-tools section and the B132 `.bs-truncation-notice` shipped functional but unstyled (the implementation specialists were scoped out of `command-center.css`). Phase 5 moves all inline styles into real `command-center.css` classes matching the existing `.cc-*` design language.
2. **B-INT-1 UX depth.** The Advanced-tools section is deepened beyond raw-JSON-in-a-`<pre>`: query vs mutation tool grouping (mutations visually distinct), per-row loading state on invoke, and a labelled success/error result container.
3. **Full `vscode-test` suite.** The `vscode-updating` mutex was found NOT stuck — the real electron suite runs. Restoring it surfaced a **latent v5.1.7 regression**: B-BIC-6 made `wireFromConfig` async, so three `bicameral-activation.test.ts` cases that asserted `setBicameralCommand`/`setBicameralClient` synchronously had silently broken (invisible under v5.1.7's mutex-degraded posture). The three cases are made async-aware — a test-only fix; production wiring was already correct. Suite: 2739 passing / 1 pending / 0 failing.

This phase also retires the v5.1.8 degraded-test posture: FX584–FX590 are now verified by the full `vscode-test` suite, not only the per-specialist harnesses.

## Cross-cutting

- **Docs.** `CHANGELOG.md` `[Unreleased] — v5.1.8 (draft)` — Added (B-INT-1), Changed (B-EM-1, B132), B199 closeout note. `FEATURE_INDEX.md` — append FX584–FX590. `docs/INTEGRATIONS.md` — Advanced-tools subsection. `docs/BACKLOG.md` — B199 flip + new items B-INT-6/B-INT-7.
- **META_LEDGER.** One consolidated SESSION SEAL Entry #385 at substantiate; `previous_hash` = Entry #384 chain hash (`4fb75c57b6da883d0b2a8dbcfca60afa60b7b60352b949b74b2f1d4268eb73b7`).
- **Razor.** Per the §Razor strategy table — every new file < 250; pre-existing debt on `BicameralRoute.ts` / `bicameral-card.js` recorded as B-INT-6/B-INT-7, not fixed this cycle.
- **Review Boundary.** Stage only. No push / PR / merge / tag without explicit operator approval. No version bump.
- **CI.** `change_class: feature` → the e2e-coverage gate is satisfied by FX589 (B-INT-1 UI) and FX590 (B132 UI) Playwright specs.

## Open questions

None blocking. B-INT-1 UI scope resolved (compact collapsible card section). All six VETO findings addressed above; F6/F7 folded in as recorded conditions.

# FailSafe Development Tracker — Design Standard

**Status:** v2 design standard (2026-06-03) — premium rebuild (supersedes the v1 lint-row tracker)
**Artifact name:** Development Tracker (a.k.a. "Status & Implementation Tracker")
**Hosting:** served by `ConsoleServer` on the console port **9376** at `/console/tracker` (the premium engine), data at `/api/v1/tracker` (the generated model). Embedded as a **Workspace-tab sub-view** (iframe) + a **Pop out ↗** affordance + the `FailSafe: Open Development Tracker` command. NOT served from the Monitor.
**Design source (required citation, per `feedback_design_reference_required`):** `D:\Accountable\STATUS-DASHBOARD-TEMPLATE.md` — the premium (App-tier) status-dashboard: token-first, data-driven, single-file engine; aurora canvas + film grain; Fraunces / Hanken Grotesk / JetBrains Mono; the weighted release-timeline calculator; deep-dive ARIA tabs; modal; decisions ledger. Visually verified in Chromium against this reference.

---

## 1. Architecture — engine + data, fully decoupled

The dashboard is a **reusable generator**, not a FailSafe-specific page. The programs are pure data and differ for every repo/user; FailSafe *generates* a tracker from a manifest + the repo's own history.

| Layer | Where | Role |
|---|---|---|
| **Engine** | `src/roadmap/ui/tracker/tracker-dashboard.html` | Single static file, zero deps. Fetches `/api/v1/tracker` on load and renders everything from it. No hardcoded content. Ships to `dist/extension/ui/tracker/` via the bundle's recursive UI copy. |
| **Model builder** | `src/roadmap/tracker/tracker-model.ts` | Pure (`now` injected, no fs/git/Date-in-tests). Merges the planned manifest with the live/discovered layer + validates. |
| **Manifest (planned layer)** | `docs/roadmap/programs.yaml` | Operator-declared: dynamic-N `programs`, weighted `phases`, `verticals`, forecast `rcs`, `progressWindows`, masthead/footer `meta`. Planning appends here; editing the tracker = editing this. |
| **Live/discovered layer** | `TrackerRoute` (`src/roadmap/routes/TrackerRoute.ts`) | Reads the manifest + the repo's `CHANGELOG.md` + git tags, calls the model builder, serves `{ ...model, lint, ok }` (data spread at the TOP LEVEL — the engine reads `data.rcs`, `data.meta`, …). |

## 2. The data model (`/api/v1/tracker`)

```
{ repo, meta:{eyebrow,title,titleEm,sub,metaRow,preamble,footer},
  rcs:      [{ id, state:'prod|staging|pr|forecast', note(=date), ref, summary, progressEligible }],
  programs: [{ key, name, accent }],          // dynamic N
  phases:   [{ prog, key, rc, w, title, what, benefit, links:[{t:'issue'|'pr',n}|{t:'url',href}] }],
  verticals:[{ key, name, accent, summary, functionality, components?, access?, backend? }],
  lint, ok }
```

## 3. Release axis — complete history, discovered from the repo

The timeline spans the **full** history (v0.1.0 → current), because the governance files don't (META_LEDGER only covers recent cycles, git tags are incomplete, GitHub Releases are stale). `discoverReleases(CHANGELOG)` parses every `## [X.Y.Z] - YYYY-MM-DD` header into a `prod` release, ascending, capturing each entry's **summary** (what shipped). The manifest contributes only **forecast** releases (future, not yet in the changelog). Git tags corroborate shipped state.

## 4. Timeline zoom — major default, drill to minor+patch

63 pips is too dense, so the axis **collapses to one anchor per major** (v0 · v1 · … · v5) by default; a major's representative is its highest-semver concrete release. Activating a major **drills in** to its minor/patch releases (breadcrumb + zoom-out + Esc). The weighted `cumulative()` always operates on the **full-axis index** of the selected concrete release, regardless of zoom level.

## 5. Two ways the timeline earns its value

A full axis with no synchronized program data would be hollow pips. Two complementary mechanisms keep every release meaningful:

- **(A) Traceable record on every pip.** Selecting any release surfaces its `summary` + date + the `↗ record` audit link (GitHub tag/release or CHANGELOG). Governance doesn't expire — a decision made in v2.1.3 stays auditable. Phase `links` additionally carry `issue`/`pr`/arbitrary `url` (Linear, docs) so old decision records are never dead ends.
- **(B) Tiered program-progress.** The expensive weighted-progress data is populated by tier: **majors for the full history; minors only within `minorDays` (default 60); patches only within `patchDays` (default 30)** — configurable via `progressWindows` in the manifest (and a future `failsafe.tracker.{minor,patch}WindowDays` VS Code setting override). `isProgramEligible(rc, {now, minorDays, patchDays})` is pure (injected `now`). Selecting an **ineligible** release shows a "no program snapshot" notice + de-emphasizes the bars (no misleading cumulative); eligible releases recompute normally.

## 6. Sections (rendered only when their data is present)

Masthead · methodology preamble · **§01 release timeline** (zoom + record) · **§01 program bars** (gradient cards, weighted fill, phase chips → modal) · **§02 vertical deep-dive** (ARIA tabs; components/access tables are *optional* per the "don't owe full component data for everything" rule) · §03 convergence · §04 promotion record (cross-filter) · §05 levers · §06 decisions ledger · modal (focus-trap, gate badge, issue/pr/url links) · provenance footer. A11y + `prefers-reduced-motion` throughout.

## 7. Recreation for another repo

Swap `programs.yaml` (programs/phases/verticals/forecasts/meta + `repo` + `progressWindows`); the engine, CSS, zoom, calculator, record, and gating are reused verbatim. The release axis + summaries come from that repo's CHANGELOG automatically.

## 8. Tests

`tracker-model.test.ts` covers discovery + summary capture, semver ordering, the discovered+forecast merge, traceability refs, tiered `isProgramEligible` (each tier + window boundaries, injected `now`), and resolved-axis validation. The Workspace-tab Playwright (`workspace-tab.spec.ts`) asserts the Tracker sub-pill. Visual verification is real-pixel (Chromium) per `feedback_design_reference_required`.

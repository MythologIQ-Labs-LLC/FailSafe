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
| **Manifest (planned layer)** | `docs/roadmap/programs.yaml` | Operator-declared: dynamic-N `programs`, weighted `phases`, `verticals`, forecast `rcs`, `progressWindows`, masthead/footer `meta`. Planning appends here; editing the tracker = editing this. Each vertical's `functionality` lists exactly its Console sub-views, in order, as `**Label** description` lines (§9). |
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

The Console taxonomy (§9) is covered by:

- `taxonomy-drift.test.ts`: the tracked `programs.yaml` matches the Console, a fixture with planted faults is reported exactly, the comparison never throws, and Component Help describes the real tabs.
- `governance-projection.test.ts`: the FX868 guard, which checks `CONSOLE_VERTICALS` against `command-center.js` (tab keys, sub-view keys and labels).
- `tracker-config-route.test.ts`: the route answers with `drift`, picks its source safely and never writes on GET.
- `tracker-taxonomy-renderer.test.ts` (jsdom), `workspace-taxonomy.spec.ts` (Playwright) and `tracker-taxonomy.extensionHost.test.ts` (extension host): the editor and the live Console.

## 9. Verticals and the Console taxonomy (#548)

- **Authority.** The Console navigation is authoritative for each vertical's sub-views: `CONSOLE_VERTICALS` in `src/roadmap/tracker/governance-projection.ts`, pinned to the `renderers` map in `command-center.js` by the FX868 guard (tab keys, sub-view keys and labels).
- **The tracked manifest.** In `docs/roadmap/programs.yaml`, every Console vertical's `functionality` lists exactly its sub-view labels, in Console order, one `**Label** description` line each, with no other bold text. CI fails when it drifts.
- **The operator's taxonomy.** `docs/roadmap/tracker-config.yaml` is a local file; `docs/` is gitignored, so it is not in the repository and CI cannot check it. `GET /api/v1/tracker/config` answers with `drift`: for each Console vertical, the labels the declared functionality is missing, the labels it adds, and whether the shared labels are out of order. Workspace › Taxonomy shows it.
  - The comparison applies when a majority (4 of 7) of the Console vertical keys are declared. With fewer matching keys, the editor says how many matched.
  - Drift is only reported. The file is never rewritten to hide it; the operator edits it.
- **Source selection.** The route chooses its source by the config file's existence. A config that exists but cannot be read or parsed answers an error, never the programs.yaml fallback. The editor then shows the error and offers no Save.
- **Save.** Save keeps every field the editor does not show (vertical summary, functionality, backend; agent evidence): each row starts from its loaded entry and applies only the inputs the operator changed. Only a successful Save becomes the editor's new baseline. Save carries the sha256 fingerprint of the file the editor loaded (null when it was absent); a file edited, created or deleted on disk since then answers 409 and nothing is written. A link at the config path, or a `docs/roadmap` that is not a folder, is refused on GET and POST.
- **Limitations.**
  - Drift is measured against the installed build's Console, not the workspace's checkout.
  - Saving re-serializes the file, so YAML comments and unknown top-level keys are dropped.
  - After a failed Save, the operator's edits stay on screen only until the next hub payload repaints the view (B331).
  - Symlinked `docs/`, `docs/roadmap/` or `.failsafe/governance/` folders are still followed on Save (B330).

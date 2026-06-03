# FailSafe Development Tracker — Design Standard

**Status:** v1 design standard (2026-06-02)
**Artifact name:** Development Tracker (a.k.a. "Status & Implementation Tracker")
**Hosting:** served by `ConsoleServer` on the existing console port **9376** at `/console/tracker`, data at `/api/v1/tracker`
**Design source (required citation):** modeled on the Accountable-OS Upgrades status brief — `06-01-2026_Accountable-OS-Upgrades-status.{md,html}` (structure + evidentiary doctrine from the `.md`; visual system + interactive components from the `.html`). Per the FailSafe rule that every UI/UX standard declares its design reference up front.

---

## 0. What this is

A single, always-current, evidence-grounded **decision/project/timeline tracker** that FailSafe generates from its own governance artifacts and serves alongside the console. It answers, for any reviewer, three questions with **zero hand-authored opinion**:

1. **How complete is each work vertical?** — scored by artifact-in-tree, not by issue open/closed state.
2. **What shipped, and where is the proof?** — every claim traces to a PR/SHA, a META_LEDGER entry, a passing test, or a verified runtime fact.
3. **Why was each decision made?** — every consequential decision traces to the *requirement* (legal floor, binding contract, operator directive) that mandated it — never to preference.

It is a **read/observe surface** (like the console's other `/console/*` pages): it reports governance truth, it does not gate or enforce. Its rigor is enforced at **generation time** (§7), so an under-evidenced entry never renders as if it were proven.

---

## 1. Core principles (the evidentiary doctrine — binding)

These are lifted directly from the design source's §0 methodology and are the non-negotiable spine of the standard. The template and the generator **must** uphold all five:

| # | Principle | Consequence for the artifact |
|---|-----------|------------------------------|
| P1 | **Evidence, not opinion.** Every status number is scored by *artifact-in-tree* — what is merged to `main` / verified applied — not by issue state. | Percentages are **computed** from FailSafe artifacts (§4), never typed by hand. |
| P2 | **Every claim cites its evidence.** A status, a "shipped" line, a risk, all carry a verifiable reference (PR `#n`, commit SHA, `FX###`, META_LEDGER `Entry #n` + chain hash, test path, or a runtime fact). | No claim renders without ≥1 evidence token. The generator **rejects** uncited claims (§7). |
| P3 | **Every decision traces to a requirement.** Each decision row names the requirement that drove it (legal/regulatory floor, binding contract/ADR, operator directive) and the evidence that records it. | The Decisions section is a two-column-minimum ledger: `decision → driven-by (requirement) → evidence`. A decision with `driven-by = preference/—` is a **lint failure**. |
| P4 | **"Done but gated" is never confused with "decided not to do."** Built-but-disabled capabilities state the explicit gate. | A vertical/item may be `built` yet `inert`; the artifact renders the **gate** (e.g., "blocked on legal counsel pass") as first-class, distinct from `not-started` and `descoped`. |
| P5 | **Traceable to a single source.** Any number must resolve to a merge SHA, a ledger entry, or a workspace artifact fact a reviewer can independently re-derive. | Each rendered value exposes a **provenance affordance** (ⓘ) showing *source + formula* (mirrors the source brief's value-provenance tooltips). |

---

## 2. Canonical section schema

Every Development Tracker is composed of these sections, in order. Sections map 1:1 to the design source and bind to FailSafe data (§4). A repo with no data for a section renders it with an explicit "not adopted" note rather than omitting it silently.

| § | Section | Purpose | Render |
|---|---------|---------|--------|
| H | **Header** | title, date, scope, **Basis** (the evidence sources this tracker rests on) | header block + 3 summary cards (overall posture / next gate / main constraint) |
| 1 | **Vertical Completion** | per-vertical % complete, scored-on (evidence), next gate | data-driven **progress bars**, one per vertical, accent-colored |
| 2 | **Vertical Deep Dive** | per vertical: what's in place / why it matters / open work | **interactive tab + panel** (alternative view of §1) |
| 3 | **Shipped This Cycle** | the evidence trail: merged-to-`main` + verified-applied, dated | chronological evidence list, every line cited |
| 4 | **Implementation Manifest** | what is in-tree now (the active base) | area → in-tree evidence table |
| 5 | **Recommended Sequence** | the dependency-ordered next waves | numbered step strip |
| 6 | **Decisions → Requirement** | the anti-"feelings" ledger (P3) | `decision · driven-by · evidence` table |
| 7 | **Risks To Watch** | risk · why it matters · mitigation | table, mitigations cited |
| 8 | **Convergence** | cross-system / cross-repo bridges + governing contract + status | bridges table |
| 9 | **Pending Decisions** | operator/legal calls that gate downstream work | `decision · why pending · decider · status` table |
| F | **Footer** | provenance statement: what window, what evidence range, how to re-verify | monospace provenance line |

---

## 3. Data model

The generator produces one JSON document conforming to `TrackerModel`, served at `/api/v1/tracker`. The template renders only from this model (no hand-authored HTML content). Every leaf that makes a claim carries an `evidence[]` array; the generator refuses to emit a claim with an empty `evidence[]` where the schema marks it required (§7).

```ts
type EvidenceRef =
  | { kind: 'pr'; number: number; sha?: string; url?: string }
  | { kind: 'commit'; sha: string }
  | { kind: 'ledger'; entry: number; chainHash?: string }   // META_LEDGER
  | { kind: 'feature'; id: string; status: 'verified' | 'unverified' | 'n/a' } // FX###
  | { kind: 'test'; path: string; result: 'pass' | 'fail' | 'unknown' }
  | { kind: 'backlog'; id: string }                          // B###
  | { kind: 'artifact'; path: string; note?: string }        // file-in-tree fact
  | { kind: 'runtime'; statement: string; verifiedAt: string }; // e.g. a DB/prod fact

interface Provenance { source: string; formula: string; provisional?: boolean }

interface Vertical {
  key: string; name: string; accent: string;
  pct: number;                 // COMPUTED (§4) — never hand-set
  provenance: Provenance;      // how pct was computed
  scoredOn: { text: string; evidence: EvidenceRef[] };   // evidence required
  nextGate: string;
  inPlace: { text: string; evidence: EvidenceRef[] }[];  // each item cited
  whyItMatters: string;
  openWork: string[];
  gate?: { built: boolean; inert: boolean; reason: string }; // P4 "done but gated"
}

interface Decision { decision: string; drivenBy: string; /* requirement, NOT preference */ evidence: EvidenceRef[]; }
interface ShippedItem { date: string; channel: 'merged' | 'verified-applied'; text: string; evidence: EvidenceRef[]; }
interface Risk { risk: string; whyItMatters: string; mitigation: string; evidence: EvidenceRef[]; }
interface Bridge { left: string; flow: '←' | '→' | '⟷'; right: string; contract: string; status: string; }
interface PendingDecision { decision: string; whyPending: string; decider: string; status: 'Open' | 'Closed' | 'Deferred' | 'Out of scope'; }

interface TrackerModel {
  title: string; date: string; scope: string;
  basis: { text: string; evidence: EvidenceRef[] };
  summary: { posture: string; nextGate: string; mainConstraint: string };
  verticals: Vertical[];
  shipped: ShippedItem[];
  manifest: { area: string; evidence: EvidenceRef[] }[];
  sequence: { n: number; title: string; detail: string }[];
  decisions: Decision[];
  risks: Risk[];
  convergence: Bridge[];
  pending: PendingDecision[];
  footer: string;
  generatedAt: string; generatedFrom: EvidenceRef[]; // the artifacts the gen read
}
```

---

## 4. Data bindings — how FailSafe auto-populates each field

The whole point: FailSafe owns the evidence, so the tracker is **generated, not written**. Each section binds to existing FailSafe artifacts (all confirmed present in this repo).

| Field | Source artifact | Binding rule |
|-------|-----------------|--------------|
| `verticals[].pct` | `docs/FEATURE_INDEX.md` (FX rows) + `docs/BACKLOG.md` (B-items) | **Computed**: for a vertical's mapped FX/B set, `pct = round(100 · verified / (verified+unverified+open))`. n/a rows excluded. The formula string goes in `provenance.formula`. |
| `verticals[].scoredOn.evidence` | FEATURE_INDEX FX rows + merged PRs touching the vertical's paths | the FX ids + PR numbers that back the score |
| `verticals[].gate` (built-but-inert) | BACKLOG item text parsed for gate markers ("gated on", "blocked on", "BUILT but inert") | sets `built:true, inert:true, reason:<gate>` (P4) |
| `shipped[]` | `git log origin/main` since the cycle base + META_LEDGER seal entries | one item per merged PR / SESSION SEAL; `channel:'verified-applied'` for runtime-verified facts logged in the ledger |
| `manifest[]` | repo file tree + key tracked artifacts (`src/`, `docs/`, config) | area → `artifact` evidence (paths in-tree) |
| `decisions[]` | `docs/META_LEDGER.md` (decision/seal entries) + `GOVERNANCE.md` doctrines | each ledger decision → `{decision, drivenBy, evidence:[ledger Entry #, PR]}`. The Merkle chain *is* the provenance. |
| `risks[]` | BACKLOG risk items + substrate findings + open `FX*` unverified regressions | each cited to its source |
| `convergence[]` | `docs/GOVERNANCE_INDEX.md` cross-references + integration contract reviews (`docs/research/integrations/`) | bridge rows with governing contract + status |
| `pending[]` | BACKLOG items tagged operator/legal-gated + open `## Pending` notes | `{decision, whyPending, decider, status}` |
| `basis` / `footer` | the set of artifacts the generator actually read, with their mtimes/SHAs | makes the tracker self-describing + re-verifiable |

**Vertical definition.** Verticals are declared once in `docs/design/tracker-verticals.json` (or inferred from BACKLOG section headers), each mapping to a set of `FX`/`B` id-prefixes and `src/` path globs. Adding a vertical is a data edit, not a code change.

---

## 5. Interactive components — alternative viewing (required)

The artifact must offer **more than one way to read the same evidence**. The design source ships data-driven progress bars + an ARIA tab/panel deep-dive + drill-down tables; this standard requires that set as the floor and adds FailSafe-native affordances:

| Component | Alternative view it provides | Behavior |
|-----------|------------------------------|----------|
| **Completion bars ⇄ Deep-dive tabs** | the same verticals as at-a-glance bars *or* as detailed per-vertical panels | tab/panel is keyboard-navigable (ArrowLeft/Right/Home/End), `aria-selected`, focus ring — exactly as the source `.html` |
| **Provenance ⓘ popover** | per value: *source + formula* (P5) | hover/focus reveals `provenance`; provisional values flagged |
| **Evidence chips** | every claim's `evidence[]` rendered as clickable chips | `pr#122` → PR URL; `Entry #414` → ledger anchor; `FX816` → FEATURE_INDEX anchor; `test:…` → file |
| **View toggle (cards ⇄ table)** | §3 Shipped and §6 Decisions as a reading list *or* a dense table | one control swaps layout; same data |
| **Filter chips** | filter Shipped/Decisions/Pending by channel / vertical / status / decider | client-side, no reload |
| **Density toggle** | comfortable ⇄ compact | persisted in `localStorage` |
| **Status legend + color encoding** | verticals/bridges color-coded by accent; gate states (`built-inert` vs `open` vs `done`) visually distinct | legend always visible |
| **"As-of" / freshness badge** | shows `generatedAt` + live-refresh indicator | turns stale → amber if the source artifacts changed but regen hasn't run |
| **Export** | the current filtered view as Markdown/JSON | re-emits the `.md` form (round-trips to the design source format) |

All interactivity is **progressive-enhancement** over the rendered model: with JS off, the full evidence still reads as static HTML tables (accessibility floor). No interactive control may hide a claim's evidence — toggles change *layout*, never *what is cited*.

---

## 6. Hosting model (same port as the console)

FailSafe already serves the console on port **9376** via `ConsoleServer` (Express), with routes registered in `ConsoleRouteRegistrar` and static UI under `express.static(uiDir, { dotfiles: 'allow' })`. The tracker slots into that surface with **no new port and no new server**:

- **Page:** `GET /console/tracker` → serves the tracker template (sibling of the existing `/console/{home,skills,genome,reports,kpi,…}` pages; same `command-center.html` shell + theme).
- **Data:** `GET /api/v1/tracker` → returns the `TrackerModel` JSON (sibling of `/api/v1/{verdicts,trust}`).
- **Live updates:** the existing console WebSocket broadcasts a `tracker.refresh` event (alongside the current `hub.refresh`); the page re-fetches `/api/v1/tracker` on receipt.
- **Theme:** reuse the console design tokens. The design source's palette maps cleanly to the console's dark `bento-tile` theme (near-identical `--bg/--panel/--line` values); per-vertical accents become the FailSafe vertical palette. No bespoke theme — the tracker must look like part of the console.

---

## 7. Enforcement — the supporting process that mandates explicit detail

This is what makes "evidence, not opinion" a guarantee rather than a hope. Enforcement runs at **generation time** and again as a **substrate/substantiate gate**, so an under-evidenced tracker cannot be served or sealed.

### 7.1 `tracker_evidence_lint` (the validator)
A FailSafe-local check (sibling of the substrate modules — same WARN/ABORT vocabulary) that validates a `TrackerModel` against the doctrine (§1):

| Rule | Severity | Fails when |
|------|----------|-----------|
| `uncited-claim` | **ABORT** (generation refuses) | any `scoredOn`, `shipped[]`, `risk.mitigation`, or `manifest[]` has empty `evidence[]` |
| `decision-without-requirement` | **ABORT** | a `decisions[]` row has `drivenBy` empty, "preference", "feelings", or "—" (P3) |
| `pct-not-computed` | **ABORT** | a `vertical.pct` has no `provenance.formula` resolving to the FX/B set (P1) |
| `dangling-evidence` | **ABORT** | an `EvidenceRef` does not resolve (PR not merged, `FX###`/`Entry #n` not found, `test` path missing) |
| `gate-ambiguity` | **WARN** | an item reads "built"/"done" in text but has unverified FX evidence and no `gate` (risks confusing P4 states) |
| `stale-basis` | **WARN** | `generatedFrom` SHAs lag `origin/main` HEAD (tracker is behind reality) |
| `provisional-unflagged` | **WARN** | a value sourced from an unverified/`provisional` input renders without the provisional flag |

`uncited-claim`, `decision-without-requirement`, `pct-not-computed`, and `dangling-evidence` are **fail-closed**: the generator emits no tracker (and the page shows the last good model + an error banner) rather than publishing an opinion as fact.

### 7.2 Where it runs
1. **Generation time** — every regen validates before write; ABORT → keep prior model, surface the finding.
2. **Substrate run** — `tracker_evidence_lint` joins the substrate module list, so it surfaces in the manual run *and* on every `/qor-substantiate` seal (via the B-SUBSTRATE-3 seal auto-hook).
3. **CI (optional)** — a PR check renders the model in dry-run and fails on any ABORT-class finding, so a tracker can't be merged with fabricated evidence.

---

## 8. Auto-update model

The tracker stays current with **zero manual refresh**, reusing the `WorkspaceMutationBus` already wired in the extension:

1. Register watchers on `docs/META_LEDGER.md`, `docs/BACKLOG.md`, `docs/FEATURE_INDEX.md`, `docs/GOVERNANCE_INDEX.md` (debounced).
2. On any mutation → regenerate `TrackerModel` → run `tracker_evidence_lint` (§7) → on PASS, write the model + broadcast `tracker.refresh`.
3. The page re-fetches and re-renders; the freshness badge clears.
4. A new SESSION SEAL (substantiate) is the strongest trigger — the tracker reflects the just-sealed reality immediately.

This is the same seal-detection mechanism shipped for B-SUBSTRATE-3 (`seal-detection.ts`), generalized to the tracker's source set.

---

## 9. Worked example (this repo, today)

A "Governance Substrate" vertical would render — fully generated, fully cited:

- **pct** = `round(100 · verified/(verified+open))` over `FX711–FX713, FX814–FX816` (all `verified`) + open `B-SUBSTRATE-4/5/6` → provenance.formula carries that expression.
- **scoredOn.evidence** = `[FX711, FX712, FX713, FX814, FX815, FX816, pr#122]`.
- **shipped** = `merged pr#122 (B-SUBSTRATE-2)`, `branch feat/b-substrate-3 (B-SUBSTRATE-3)` — each a real `EvidenceRef`.
- **gate** = none (no legal gate); `built:true, inert:false`.
- **decision** = "Node-port `dependency_admission_lint` (FailSafe-local TS) over upstream contribution" → **drivenBy** = "FailSafe is downstream; substrate pattern is local (FeatureIndexVerifyAdapter precedent)" → **evidence** = `[B-SUBSTRATE-2, pr#122]`.

Nothing in that row is an opinion; every cell resolves to an artifact.

---

## 10. Acceptance criteria

- [ ] Renders all sections H,1–9,F from a generated `TrackerModel`; no hand-authored claims.
- [ ] Every claim carries ≥1 resolving `EvidenceRef`; `tracker_evidence_lint` passes with 0 ABORT findings.
- [ ] Every `vertical.pct` is computed from FX/B sets with a stated formula.
- [ ] Every decision names a requirement (never preference) + evidence.
- [ ] "Built-but-gated" states render distinctly from "open" and "done".
- [ ] Served at `/console/tracker` + `/api/v1/tracker` on port 9376, console-themed.
- [ ] Interactive: bars⇄tabs, provenance ⓘ, evidence chips, view/filter/density toggles, export — with a static accessible fallback.
- [ ] Auto-refreshes on META_LEDGER/BACKLOG/FEATURE_INDEX mutation and on seal.

## 11. Non-goals (v1)

- Not an enforcement gate on operator workflow (observe-only, like the rest of `/console/*`).
- No editing of the tracker in the UI — it is generated; you change the *evidence*, not the tracker.
- No cross-repo aggregation in v1 (single-repo; the Convergence section *describes* bridges but does not pull a second repo's live data).

## See also
- Template: `docs/design/templates/development-tracker.template.html` (the interactive artifact implementing this standard).
- Design source: `06-01-2026_Accountable-OS-Upgrades-status.{md,html}`.
- Reused mechanism: `src/qorlogic/substrate/seal-detection.ts` (B-SUBSTRATE-3) for the auto-update trigger.

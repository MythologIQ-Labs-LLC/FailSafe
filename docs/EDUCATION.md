# FailSafe Learn — Software Development Craft

**Introduced**: v5.2.0 · **Plan (content)**: `docs/plan-qor-failsafe-learn-swe-craft.md` · **Plan (visual rebuild)**: `plan-learn-tab-visual-rebuild.md` · **Compliance**: `docs/compliance-education-component.md` · **Playbook**: `docs/VIBE_CODER_PLAYBOOK.md` · **Component**: `docs/LEARN_TAB.md`

FailSafe Learn is the **Learn tab** on the Command Center: a multimode surface that teaches the software-development craft to non-traditional builders (vibe coders, PMs gaining developer literacy, true beginners). The aim is to close the *user-judgment gap* that pure process governance can't reach — a builder following the SHIELD steps perfectly still fails if they don't know how to scope, verify, or pace.

The mantra: **Slow down to speed up.**

## Tab structure (two sub-views via TabGroup pill bar)

| Sub-view | Pill | Purpose |
|---|---|---|
| **Read** | default active | Five short SWE-craft essays, each in sectioned form with icon + read-time + pull-quote + optional template. A sticky horizontal jump-strip at the top provides at-a-glance navigation + relevant-now indicators. |
| **Glossary** | secondary | Unified searchable glossary of ~60 terms (48 SWE-craft + 12 FailSafe + 1 integration-partner Bicameral entry). Tag-filter buttons + A-Z/Z-A sort. Search filters across all terms case-insensitively. |

A Practice sub-view is **not** shipped in v5.2.0 — a prior prompt-builder iteration was rejected as hollow ("Mad Libs"). A genuine "zoom-in evaluator on real code/design" Practice surface is scoped to a follow-up plan.

## The five essays (Read sub-view)

1. **Slow down to speed up** — the mantra; scope and pacing as the antidote to AI-assisted churn. Pull-quote: *"Speed is a trap."*
2. **Scope before prompt** — define the smallest useful change before you ask the agent. Pull-quote: *"Scope is the smallest useful change you can make."*
3. **Acceptance criteria before code** — what *done* looks like, written down before code exists. Carries the **acceptance-criteria template** with a Copy button. Pull-quote: *"Done is a definition, not a feeling."*
4. **Choosing between agent suggestions** — option-evaluation by blast radius, reversibility, dependencies, verifiability. Carries the **6-question option-evaluation table**. Pull-quote: *"Helpful is not the same as correct."*
5. **Verify before you believe** — agent output is a claim, not proof; the 6-step verification loop. Pull-quote: *"Generated code is a claim."*

Each essay is authored at three tier framings (beginner / intermediate / advanced) in `SectionBlock[]` shape — multiple H4-subheaded sections of paragraphs per tier — so the body is scannable rather than a single block of prose. Content lives in `src/education/lessons-content-swe-essays.ts` (+ `-2.ts`); the type guard is `isSectionBlockBody` in `src/education/lesson-types.ts`. The Phase 0 content matrix `.failsafe/governance/CONTENT_MATRIX_failsafe-learn-swe-craft.md` is the source of truth for the prose.

### Visual idiom (per-essay accent)

Each essay maps to one existing Command Center accent token, applied as a 4px left rail + inline-SVG icon stroke + pull-quote border + relevant-now badge border:

| Essay | Icon | Accent token |
|---|---|---|
| `slow-down-to-speed-up` | clock | `--accent-green` |
| `scope-before-prompt` | target | `--accent-cyan` |
| `acceptance-criteria` | checklist | `--accent-gold` |
| `choose-agent-option` | fork-arrow | `--accent-orange` |
| `verify-output` | magnifier | `--accent-red` |

The essay title is intentionally **decoupled** from this cascade — title color stays `var(--text-main)` so a vertical list of 5 essays does not render 5 different colored titles (operator's "calm palette" requirement + a11y-tester #9).

### Jump-strip (FX619)

A sticky `<aside role="navigation" aria-label="Jump to essay">` at the top of the Read sub-view containing five numbered anchor links. Each anchor:
- Targets `#cc-learn-essay-<slug>` for browser-native scroll
- Hovers to the matching essay's accent color
- Shows a **relevant-now dot** when the contextual trigger fires for that anchor
- Wraps to 2 lines under narrow webview widths

## Glossary (sub-view + tag-filter UI)

Renamed from "Reference" — operator feedback was that "Reference" reads poorly for a glossary/dictionary surface. The visual treatment is a tag-filter UI: filter buttons (`All / Software / FailSafe / Integration`) + A-Z/Z-A sort dropdown, over a single alphabetized all-terms list.

| Subset | Anchor prefix | Count |
|---|---|---|
| Software craft (SWE) | `glossary.swe.*` | 48 |
| FailSafe vocabulary | `glossary.<term>` | 12 |
| Integration partners | `glossary.bicameral-integration` | 1 |

### Bicameral co-existence

Two distinct anchors co-exist by intent:
- `glossary.bicameral` — the **two-chambers governance pattern** (v1 entry, preserved unchanged as regression guard)
- `glossary.bicameral-integration` — the **Bicameral MCP integration partner** (the upstream company FailSafe integrates with via the Bicameral MCP server, 4-of-13 tools wired in v1; see `reference_bicameral_mcp.md` memory)

Both render in the glossary with distinct display terms (`Bicameral` vs `Bicameral (integration partner)`).

### Software glossary (48 terms)

Split across three sibling content files (matches the `glossary-content-*.ts` pattern), aggregated through `src/education/glossary-aggregator.ts`:

- **File A** (15 entries — core programming primitives): variable, function, type, conditional, loop, array, object, module, package, dependency, import, scope, side-effect, null/undefined, error
- **File B** (15 entries — version control & change management): branch, commit, diff, merge, pull request, code review, rebase, conflict, patch, refactor, rewrite, regression, blast radius, reversibility, acceptance criteria
- **File C** (18 entries — agentic coding & runtime): prompt, context window, hallucination, model, tool call, retry, idempotent, race condition, edge case, environment, deployment, build, test, lint, log, observability, latency, exception

All entries carry `kind: 'glossary'` + `domain: 'swe'` + a unique `glossary.swe.<term>` anchor. No collisions with the legacy 12 FailSafe entries.

## Tier framing (`failsafe.education.proficiency`)

The proficiency setting is a **starting-point selector**, not a skill score. The system never modifies or infers it.

| Setting value | User-facing label | Content stance |
|---|---|---|
| `beginner` | New to code | Assume near-zero engineering knowledge; explain terms directly. |
| `intermediate` | AI builder | Can produce code with an agent; needs judgment around scope, verification, maintainability. |
| `advanced` | Product/PM background | Connects software judgment to product judgment: scope, risk, acceptance criteria, tradeoffs, release confidence. |

The enum values are unchanged from v1 for API stability; only the user-facing `enumDescriptions` strings carry the operator-binding tier labels (FX613).

## Contextual surfacing (the trigger engine)

`src/education/lessonTriggers.ts` is a pure-function engine that maps hub state to "which essay is relevant right now". The Read sub-view consumes the trigger results; the jump-strip surfaces firing anchors as relevant-now dots; firing essay cards sort to the top with a `Now relevant` badge.

| Nudge anchor | Fire condition |
|---|---|
| `learn.essay.scope-before-prompt` | File activity exists AND (no active plan OR file activity touches paths no plan-phase artifact covers). The activity gate is mandatory — opening Learn on a passive empty state never produces a badge. |
| `learn.essay.acceptance-criteria` | An active-plan phase has a non-empty description but no verification artifacts. |
| `learn.essay.choose-agent-option` | File activity touches a high-blast-radius path: JS/TS lockfiles, `tsconfig*.json`, bundler configs (vite/webpack/rollup/esbuild), Python (`requirements*.txt`, `Pipfile[.lock]`, `pyproject.toml`, `poetry.lock`), Rust (`Cargo.{toml,lock}`), Go (`go.{mod,sum}`), VS Code extension manifests / `.vsix`, or any `.github/workflows/` path. |
| `learn.essay.verify-output` | ≥ 5 unattributed file changes with no checkpoint after the earliest. |
| `learn.essay.slow-down-to-speed-up` | Session > 25 min with no checkpoint after session-start. |

### Cap discipline (binding)

- **Per-anchor cap** (1 per session) — an anchor surfaces as relevant-now at most once per session.
- **Per-session global cap** (2 total) — at most two nudges total per session.
- **Cumulative enforcement** — both caps enforced across hub re-renders via webview `sessionStorage` counters (`fs-learn-nudge-count:<anchor>`), not per-render.
- **Sub-view scoping** — trigger evaluation runs ONLY on the Read sub-view's render path. Switching to Glossary does not consume the nudge budget.
- **Outer-tab scoping** — when the Learn panel itself is not `.active`, the Read sub-view pre-renders the curriculum directory without consuming the budget; the first render after activation is where the count increment legitimately lands.
- **"Mark as read"** suppresses the relevant-now badge for the rest of the session (sessionStorage flag `fs-learn-nudge-dismissed:<anchor>`); the essay itself **always remains in the curriculum directory**.

## Accessibility baseline

Phase 2 of the visual rebuild added a global a11y baseline to `command-center.css` (not Learn-tab-scoped — applies to the whole Command Center):

- **`prefers-reduced-motion`** — disables all transitions/animations. Closes WCAG 2.3.3.
- **Global `:focus-visible`** — `2px solid var(--primary)`, 2px offset, on every new interactive surface (`.cc-pill`, Copy button, jump-strip anchors, glossary search, glossary row-expand toggles). Closes WCAG 2.4.7 AA.
- **`.visually-hidden` utility** — for SR-only labels (e.g., the glossary search `<label>`).
- **`max-width: min(68ch, 100%)`** on body prose — 45-75ch readable line length AND survives WCAG 1.4.4 200% zoom without horizontal scroll.
- **Light-theme contrast fallback** — `@media (prefers-color-scheme: light)` switches the relevant-now badge to neutral panel background because `--accent-gold` / `--accent-green` on white fail WCAG 1.4.3 AA (1.7:1 / 2.5:1). *Operator verification noted: in VS Code webviews this media query may not track the editor theme; theme-class selector swap is a deferred follow-up.*
- **Heading hierarchy** — tab `<h2>` → essay/glossary `<h3>` → essay sub-section `<h4>`. No skipped levels.
- **Live region** — relevant-now badge container carries `aria-live="polite"` so SR users hear the badge when the contextual trigger fires asynchronously.

## GDPR design contract (binding)

Session-duration timing (`fs-learn-session-start`), per-anchor counts (`fs-learn-nudge-count:<anchor>`), and dismiss flags (`fs-learn-nudge-dismissed:<anchor>`) all live **client-side only** (webview `sessionStorage`, per-webview lifetime). Never transmitted server-side. The v1 governance-moment lessons retain their persistent `localStorage` dismiss flag (`fs-edu-dismissed:<anchor>`); the Learn tab's contextual nudges are session-scoped by design.

## Compliance posture (Annex III(3) exclusion)

The Learn tab is static contextual help + a state-aware UI surface — **no assessment, no scoring, no learning-outcome evaluation, no access determination, no inferred proficiency.** It is therefore **outside** EU AI Act Annex III high-risk education/training classification while strongly supporting the Article 4 AI-literacy goal. See `docs/compliance-education-component.md` for the full determination and the two binding escalation triggers (any scoring/inference → re-ideate; any expansion to full structured curriculum within the open extension → escalate to FailSafe Pro / separate-extension scope decision).

The visual rebuild explicitly does not violate these bindings:
- The read-time chip (`~Nm read`) is structural metadata, not progress measurement.
- The jump-strip relevant-now dot mirrors the per-essay badge (existing structural signal), not a completion indicator.
- The proficiency tier remains a starting-point selector; the Glossary expand toggle uses it as a gate for revealing higher-tier bodies, not as a measurement.
- Glossary search result counts are feedback, not progress.
- The acceptance-criteria template Copy button writes a fixed canonical string to the clipboard; FailSafe does not call the agent or evaluate the operator's resulting prompt.

## Authoring a new essay

1. Add a `Lesson` literal to `lessons-content-swe-essays.ts` (or `-2.ts`) with anchor prefix `learn.essay.`, all three tier bodies as `SectionBlock[]` (each section: `{heading, paragraphs[], pullQuote?}`), an `icon` key (one of `clock / target / checklist / fork / magnifier`), and operator-reviewed prose.
2. Add the anchor to `ESSAY_ACCENT_MAP` in `learn-essay-list.js` (CC token name).
3. Add the row to the Phase 0 content matrix.
4. Optionally add a new nudge anchor to `lessonTriggers.ts` with a fire condition; cap counts may need rebalancing.
5. The FX598 coherence check (essay-list mount class) and the FX612 SWE-vocab dominance check enforce content discipline automatically.

## Authoring a new glossary term

1. Add a `Lesson` literal with `kind: 'glossary'` to the appropriate content file:
   - SWE term → `glossary-content-swe.ts` / `-swe-2.ts` / `-swe-3.ts` (split for Section 4 razor); set `domain: 'swe'`; anchor prefix `glossary.swe.`.
   - FailSafe term → `glossary-content.ts` / `glossary-content-2.ts`; `domain: 'failsafe'` (or omit — read-time default applies).
2. Body authoring stance: beginner = "what & why", intermediate = trade-off / when, advanced = terse reminder.
3. Verify no anchor collision with existing entries; verify no `term` string collision across the unified glossary.

## v1 + v3 history (superseded)

The v1 Educational Component (sealed META_LEDGER #388) and v3 Guided Dev Cycle (sealed #389) were rejected by the operator on 2026-05-22 — they taught FailSafe vocabulary, not software development. The rebuild plan `docs/plan-qor-failsafe-learn-swe-craft.md` reframed the component from the problem up; the visual rebuild plan `plan-learn-tab-visual-rebuild.md` (2026-05-24) corrected the design quality.

The four v1 governance-moment lesson literals (`governance-mode`, `shield.plan`, `shield.audit`, `shield.substantiate`) carry forward in the registry — they power the Settings governance-mode card + Monitor SHIELD phase tracker (both kept unchanged). They are NOT the Learn-tab's content.

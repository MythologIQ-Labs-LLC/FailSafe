# Plan — Educational Component (v1) — v2 (post-VETO revision)

**Target version**: v5.2.0 (this is the v5.2.0 release-gating component)
**Change class**: `feature` — adds user-facing surface; triggers the release-class e2e-coverage gate.
**Risk grade**: L2 (per sealed ideation; audit cycle-1 confirmed L2 stands). **Not high-risk** — see Phase 0 §0c.
**Base**: `main` @ `4604258` (post-v5.1.8 release; verified = current HEAD).
**Branch**: `feat/educational-component`.
**Skill**: `/qor-auto-dev-1` orchestrated; SHIELD per-phase.
**Ideation**: `.qor/gates/2026-05-22T0000-educational/ideation.json` · `.failsafe/governance/IDEATION_educational-component.md`
**Research**: `docs/research-brief-education-layer-2026-05-12.md` (complete — no `/qor-research` needed).
**FX range**: FX591–FX602 (Phases 1–5 = FX591–FX598; Phase 6 glossary expansion = FX599–FX602).

**Revision note (v2).** Plan v1 VETOed by audit. Six findings, all verified against source, addressed:
F1 (governance-mode card is in `settings.js:234`, not `governance.js`) → §Anchor table + Phase 4 corrected. F2 (B-EM-1 misattributed) → precedent sentence struck. F3 (SHIELD tracker = `monitor-render.js:132 renderPhase`, an `innerHTML` renderer) → anchor pinned, Phase 4 reframed. F4 (`settings.js` 266 already over razor) → Phase 4 extracts the governance-mode card to a leaf, bringing `settings.js` back under razor. F5 (compliance note mis-sequenced) → moved to Phase 0 §0c (blocking). F6 (one Playwright case for 5 surfaces) → second Playwright case added (FX597).

## Concept

Inline, bite-sized, **opt-in, dismissible** plain-language explanations that translate FailSafe governance vocabulary at the exact governance moment. Closes the "governance literacy gap" for non-traditional builders (PM/CX operators) and governance-new developers. **Not** training software — no LMS, no quizzes, no scoring, no blocking. SHIELD lifecycle is the curriculum spine.

## Scope

**In (v1):** a lesson data model + content; a `proficiency` + `enabled` Settings pair; a reusable webview micro-lesson affordance; wiring to confirmed governance moments; a lesson-anchor coherence check; the UI_MANIFEST.md reconciliation; the compliance determination.

**Out:** separate academy/LMS, certification, graded/blocking quizzes, adaptive tutoring, usage-inferred proficiency, telemetry-dependent features, self-check prompts, general (non-FailSafe) coding education, wiki/website education (deferred, non-blocking).

---

## Phase 0 — Reconciliation, surface inventory, compliance determination (blocking prereqs)

**0a — Reconcile `docs/UI_MANIFEST.md`.** The "Sidebar Views → DojoViewProvider" section (`docs/UI_MANIFEST.md:115–130`) declares an **ACTIVE** `failsafe.dojo` view whose files (`genesis/views/DojoViewProvider.ts`, `genesis/views/templates/DojoTemplate.ts`) do not exist and whose view id is registered nowhere in `src/`. Verified. Remove the stale section (or mark `REMOVED` with a dated note).

**0b — Surface inventory.** Confirm the exact `file:line` anchor for each v1 governance moment against current source — grep-verified, not module-name-inferred. The §Anchor table below is now source-verified (audit cycle-1 did this verification); Phase 0 re-confirms at implementation time and records any drift.

**0c — Compliance determination (was Phase 5 — moved per audit F5).** Author the Annex III determination paragraph of `docs/compliance-education-component.md` **before** any build phase: v1 is static contextual help — no adaptive assessment, no user scoring, no access determination, no learning-outcome evaluation — therefore outside EU AI Act Annex III(3) (education/vocational training), consistent with the Art. 4 AI-literacy goal of Regulation (EU) 2024/1689. **Escalation trigger:** if any later phase introduces assessment/scoring/outcome-evaluation → STOP, escalate to ideation re-frame. Phase 5 *expands* this note; Phase 0 *originates* it.

**No code/tests in Phase 0** — reconciliation + inventory + the compliance note. Evidence = updated manifest + confirmed §Anchor table + the compliance determination paragraph.

### §Anchor table (source-verified, audit cycle-1)

| Governance moment | Verified anchor | Surface type |
|---|---|---|
| Onboarding | `genesis/FirstRunOnboarding.ts` (37 L) | VS Code native (step/notification) |
| Governance-mode selection (picker) | `governance/FirstRunModePicker.ts` (64 L) quickpick `detail` | VS Code native |
| Governance-mode card | `roadmap/ui/modules/settings.js:234` `renderGovernanceModeCard` (`#cc-governance-mode`, `[data-governance-mode]`, `MODE_OPTIONS` :223) | webview |
| Plan / Audit / Substantiate | `roadmap/ui/modules/monitor-render.js:132` `renderPhase` → `els.phaseTrack` (`PHASE_LABELS` :7) | webview (`innerHTML`-replacing renderer) |

`governance.js` is **not** a host — it is the Sentinel-status/policies/L3 panel and carries no governance-mode card. (B-EM-1 in a prior cycle relabelled `governance.js`/`integrity.js` *Sentinel-mode* sites — that is a caution against conflating Sentinel mode with governance mode, not a precedent for anchoring here.)

---

## Phase 1 — Lesson data model + v1 content

**Data model.** New `src/education/lessons.ts` — a typed `Lesson`: `id`, `anchor` (stable key, e.g. `governance-mode`, `shield.plan`), `term`, `levels` (subset of beginner/intermediate/advanced), `body` (per-level or shared). A `LESSONS` registry keyed by `anchor`; `getLesson(anchor, level)` with a documented fallback when a level is absent.

**Content.** Plain-language lessons for the v1 anchors — governance modes (Observe/Assist/Enforce) and the Plan/Audit/Substantiate SHIELD phases. Beginner = "what & why"; intermediate = trade-offs; advanced = terse reminder. Drafted for operator review at the Phase 1 confirmation gate — operator owns final wording.

**RD-1.** `lessons.ts` is a leaf data module — no imports, no DOM. < 250 lines (split by anchor group if needed).

**Test descriptors (FX591).** Registry well-formedness: every `Lesson` has non-empty `id`/`anchor`/`term`/`body`; `anchor` unique; every declared level ∈ {beginner,intermediate,advanced}; `getLesson(anchor, level)` returns the level-appropriate body and the documented fallback when the level is absent.

## Phase 2 — Proficiency + enable Settings

Two additive `contributes.configuration` properties in `package.json`:
- `failsafe.education.proficiency` — enum `beginner|intermediate|advanced`, default `beginner`.
- `failsafe.education.enabled` — boolean, default `true`.

New leaf `src/education/educationConfig.ts` — `readEducationConfig()` → `{enabled, proficiency}` with safe defaults. Proficiency is operator-set only (no inference — ideation).

**RD-2.** Config reader is a leaf; additive `package.json` config only.

**Test descriptors (FX592).** `readEducationConfig()`: defaults (`enabled:true`, `proficiency:'beginner'`) when unset; reads each proficiency value; an invalid stored value falls back to `beginner`.

## Phase 3 — Webview micro-lesson affordance

New leaf `roadmap/ui/modules/education-lesson.js`: `renderLesson(anchor, {enabled, proficiency})` → a **collapsed-by-default** `<details>`-based "What does this mean?" expander with the level-appropriate body + a dismiss control; renders **empty string** when `enabled` is false or no lesson exists for the anchor (so host template strings stay safe). Dismiss state persisted per-anchor in webview storage. Styled in `command-center.css` (no inline styles).

**RD-3.** Leaf — depends only on the lesson registry; returns a string (safe to interpolate into an `innerHTML` template — see Phase 4 SHIELD-tracker). < 250 lines. CSS additive.

**Test descriptors (FX593).** jsdom: collapsed expander for a known anchor; empty string when `enabled:false`; empty string for an unknown anchor; proficiency selects the matching body; dismiss removes + persists; lesson-body HTML is escaped.

## Phase 4 — Wire micro-lessons into the v1 surfaces

**4a — Governance-mode card (razor-safe extraction + mount).** `settings.js` is **266 lines — already over the 250 razor**. Extract `renderGovernanceModeCard` + `MODE_OPTIONS` + the `#cc-governance-mode` bind block into a new leaf `roadmap/ui/modules/governance-mode-card.js`. This **brings `settings.js` back under 250** and gives a clean lesson host. The new leaf calls `renderLesson('governance-mode', cfg)` inside the card. `settings.js` keeps a one-line import + the existing call site.

**4b — SHIELD phase tracker.** `monitor-render.js:132` `renderPhase` builds `els.phaseTrack.innerHTML` from `PHASE_LABELS`. It is an `innerHTML`-replacing renderer, **not** a 2-line slot — fold `renderLesson('shield.plan'|'shield.audit'|'shield.substantiate', cfg)` (each returns a string) into the `renderPhase` template. `monitor-render.js` is 152 L — headroom.

**4c — Native surfaces.** `FirstRunModePicker.ts` — quickpick item `detail` text drawn from the lesson registry (native; no expander). `FirstRunOnboarding.ts` — an optional governance-vocabulary step drawing on the registry. Both pull from `lessons.ts`; no webview affordance.

Implement/Release surfaces are **not** wired in v1 (lighter glossary hints deferred — recorded, not dropped).

**RD-4.** 4a is an audit-mandated extraction (razor remediation, not opportunistic) that *reduces* `settings.js`. 4b folds string returns into an existing template. 4c is additive registry reads. No host ends further over razor than it started; `settings.js` ends under.

**Test descriptors (FX594–FX597).**
- FX594 — jsdom: `governance-mode-card.js` renders the `governance-mode` lesson when enabled; nothing when disabled; the extraction preserves the existing mode-button behaviour (regression).
- FX595 — jsdom: `renderPhase` output contains the Plan/Audit/Substantiate lesson expanders when enabled; `FirstRunModePicker` items carry lesson-derived `detail`.
- FX596 — **Playwright**: Command Center → Settings → the governance-mode card "What does this mean?" expander opens and shows the Observe/Assist/Enforce explanation.
- FX597 — **Playwright**: the Monitor SHIELD phase-tracker "What does this mean?" expander opens on a phase and shows the phase explanation. (Second e2e case — audit F6.)

## Phase 5 — Lesson-anchor coherence check + compliance note expansion

**5a — Coherence check** (ideation FC2). A test/script cross-checking every `Lesson.anchor` against the anchors actually mounted in source and against `UI_MANIFEST.md`; fails when a lesson references a missing anchor or a manifest surface lost its lesson.

**5b — Compliance note.** Expand `docs/compliance-education-component.md` (originated in Phase 0 §0c) with the full posture, the v1 exclusions, and the escalation trigger.

**Test descriptors (FX598).** The coherence check passes on the shipped registry; fails (caught) when a lesson anchor points at a removed surface (fixture).

---

## Phase 6 — Agentic-vocabulary glossary (operator-directed expansion)

Added after Phases 0–5 sealed, on operator direction: the v1 spark promised to translate "FailSafe **and agentic-coding** terminology", but Phases 1–5 cover only the four governance-flow lessons. Phase 6 adds the FailSafe agentic-vocabulary glossary so v1 matches the spark. **Tech-stack / general coding education stays out of scope** (per the ideation non-goals) — Phase 6 is FailSafe/agentic vocabulary only.

**6a — Model: glossary lesson class.** Extend `Lesson` with a discriminator `kind: 'moment' | 'glossary'` (default `'moment'` — the existing four lessons are unaffected). A `'glossary'` lesson's `anchor` is a plain key (e.g. `glossary.mcp`); it mounts on the one Glossary surface, not at a governance moment. `getLesson` is unchanged; a `glossaryLessons()` selector returns the `'glossary'`-kind entries.

**6b — Content.** Author ~10–12 glossary lessons for the FailSafe agentic vocabulary a PM/CX builder genuinely hits: **MCP server**, **governance interceptor**, **risk tiers L1–L3 / L3 approval**, **Sentinel**, **decision drift**, **the ledger (META_LEDGER / Merkle chain)**, **Shadow Genome**, **bicameral**, **receipt / verdict / evaluation**, **Enforcement Engine**, **SHIELD (lifecycle overview)**, **agent / agentic coding**. Three proficiency levels; glossary bodies are definitional and concise. Drafted for operator review — operator owns wording.

**6c — Glossary surface.** A collapsed-by-default **"FailSafe Glossary"** section in the Settings tab, rendered below the Education settings card (natural pairing). Reuses the Phase 3 affordance styling; each term is an expandable entry. Rendered only when `failsafe.education.enabled`. New leaf `roadmap/ui/modules/education-glossary.js` — `renderGlossary({enabled, proficiency})`; mounted from `settings.js` via a one-line call (settings.js has headroom post-Phase-4a extraction — it is now 232 L; confirm it stays < 250).

**6d — Coherence-check update.** Extend the Phase 5a coherence check: `'glossary'`-kind lessons are validated as a distinct class — they require a Glossary-surface mount, not a governance-moment anchor, and must NOT false-positive against the governance-moment anchor set (extends advisory A3's native-class handling).

**RD-6.** `kind` is an additive optional field — the four existing lessons default to `'moment'`, zero behaviour change. `education-glossary.js` is a leaf depending only on the registry. The glossary is static contextual help — the §Compliance Annex III determination is unchanged (no assessment/scoring added).

**Test descriptors (FX599–FX602).**
- FX599 — `lessons.ts`: `kind` defaults to `'moment'`; `glossaryLessons()` returns exactly the `'glossary'`-kind entries; every glossary lesson is well-formed (id/anchor/term/body, 3 levels).
- FX600 — jsdom: `renderGlossary` lists all glossary terms as collapsed expanders; renders nothing when `enabled:false`; proficiency selects the body; term bodies HTML-escaped.
- FX601 — **Playwright**: Command Center → Settings → the "FailSafe Glossary" section expands and a term (e.g. `MCP server`) opens to its explanation.
- FX602 — the coherence check classifies + validates `'glossary'`-kind lessons without false-positives.

---

## Cross-cutting

- **Docs.** `CHANGELOG.md` `[Unreleased] — v5.2.0 (draft)` block; `FEATURE_INDEX.md` FX591–FX602; `docs/EDUCATION.md` (component + lesson-authoring model + the glossary); `docs/UI_MANIFEST.md` reconciled (Phase 0); `docs/compliance-education-component.md` (Phase 0 + 5).
- **META_LEDGER.** One consolidated SESSION SEAL at substantiate. **Also fold in the deferred v5.1.7 + v5.1.8 DELIVER entries** so the ledger is current — reconciled in the same seal commit.
- **Razor.** Every new file < 250; `settings.js` ends *under* razor via the 4a extraction; new content in leaf modules.
- **Review boundary.** Stage only — no push / PR / merge / tag without explicit per-action operator approval. No version bump.
- **CI.** `change_class: feature` → e2e-coverage gate satisfied by FX596 + FX597 (the two webview surfaces). Native surfaces (quickpick, onboarding) are Playwright-exempt with a per-row `n/a` justification in `FEATURE_INDEX.md`.

## Open questions

None blocking. The §Anchor table is now source-verified. Lesson content wording is operator-owned at the Phase 1 confirmation gate.

## Non-goals restated (scope guard)

No LMS, no certification, no graded/blocking quizzes, no adaptive tutoring, no user scoring, no usage-inferred proficiency, no telemetry-dependent features, no general coding education, no wiki/website education in v1.

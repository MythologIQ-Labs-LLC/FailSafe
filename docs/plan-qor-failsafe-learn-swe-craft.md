# Plan — FailSafe Learn — Software Development Craft (rebuild)

**Slug**: `plan-qor-failsafe-learn-swe-craft.md`
**Target version**: v5.2.0 (the v5.2.0 release-gating component, rebuilt)
**change_class**: `feature`
**doc_tier**: `standard`
**Risk grade**: **L2** (per ideation; staying outside EU AI Act Annex III by design — see §Compliance).
**Branch**: `feat/educational-component` (rebuild on the same branch as the rejected cycle).
**Base**: `b4a02a3` (v1 checkpoint commit on `feat/educational-component`).
**Skill chain**: `/qor-plan` → `/qor-audit` → `/qor-implement` → `/qor-substantiate`; orchestrated by `/qor-auto-dev-1`.
**Supersedes**: `docs/plan-qor-educational-component.md` (v1 + Part B sealed META_LEDGER #388 / #389, operator-rejected).

**Binding inputs (sealed, do not re-derive)**:
- Ideation: `.failsafe/governance/IDEATION_failsafe-learn-swe-craft.md` (`.qor/gates/2026-05-22T1800-learn-swe-craft/ideation.json`).
- Research brief + Codex addendum: `.failsafe/governance/RESEARCH_BRIEF_failsafe-learn-swe-craft.md` (the "Codex review addendum — beginner SWE craft expansion" section is the OPERATOR-BINDING coding-agent handoff specification; the 5 essays, 5 nudge anchors, tier labels, templates, 10 test checks, 7 non-goals are not negotiable).

**terms_introduced**:
- term: FailSafe Learn (v2)
  home: docs/EDUCATION.md
- term: Content contract matrix
  home: .failsafe/governance/CONTENT_MATRIX_failsafe-learn-swe-craft.md
- term: Lesson trigger engine
  home: FailSafe/extension/src/education/lessonTriggers.ts
- term: Essay set (Learn tab)
  home: FailSafe/extension/src/roadmap/ui/modules/learn-essay-list.js
- term: Tier label (user-facing) — *"New to code" / "AI builder" / "Product/PM background"*
  home: FailSafe/extension/package.json `failsafe.education.proficiency.enumDescriptions` *(NEW field added by Phase 3c — does NOT exist in package.json today; the existing `failsafe.education.proficiency` block at :278-287 carries `type`/`enum`/`default`/`description` only)*

**boundaries**:
- **limitations**: lessons surface only when editor context warrants (no proactive curriculum push); lesson content is operator-curated, not runtime-LLM-generated; v1 ships exactly 5 essays + 5 nudge anchors (no library); per-anchor frequency cap + per-session global cap (≤2); non-modal `<details>` expander; keyboard-accessible; session-duration timing client-side ONLY (webview localStorage; never transmitted server-side).
- **non_goals**: standalone academy / LMS; certification; graded quizzes; learner-progress assessment or scoring; level inference; usage telemetry as a v1 requirement; full structured curriculum within the open extension *(belongs in FailSafe Pro or a separate extension)*; prompt capture from Copilot Chat / Claude Code / terminals / other extensions; server-side session-duration tracking; new telemetry for learner behavior; blocking modal coach; broad refactor of Learn scaffolding unless required by tests or Section 4 limits.
- **exclusions**: non-coding-craft topics; FailSafe glossary becomes a small reference sub-section on the Learn tab, NOT the point.
- **forbidden_interpretations**: NOT a coding bootcamp · NOT a course platform · does NOT certify or evaluate the learner · does NOT include a structured progressive curriculum within the open extension (any curriculum work escalates to a FailSafe Pro / separate-extension scope decision).

---

## Open Questions

None blocking. The ideation + research-brief addendum lock the curriculum shape, trigger semantics, tier labels, templates, and non-goals. Essay copy is operator-owned at the Phase 0 content-review gate (mirror the v1 lesson-wording-review pattern).

---

## §Anchor / §Hub-field table (grep-grounded)

The plan depends on existing FailSafe code surfaces — anchors verified against current source:

| Datum | Source of truth | Grep evidence |
|---|---|---|
| Hub `governancePhase` (incl. `current: ShieldPhase`) | `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts:204` `governancePhase = buildGovernancePhase(d.workspaceRoot)` | `grep -n 'buildGovernancePhase' HubSnapshotService.ts` → 204, 226, 261 |
| Hub `activePlan` | `HubSnapshotService.ts:236` `activePlan: this.deps.mergePlanBlockers(...)` | `grep -n 'activePlan:' HubSnapshotService.ts` → 236 |
| `PlanPhase.estimatedScope` (sizing signal) | `FailSafe/extension/src/qorelogic/planning/types.ts:68` `estimatedScope: number;` | `grep -n 'estimatedScope' planning/types.ts` → 68 |
| Hub `recentCheckpoints` (12) | `HubSnapshotService.ts:241` `recentCheckpoints: this.getRecentCheckpoints(12)` | `grep -n 'recentCheckpoints:' HubSnapshotService.ts` → 241 |
| Hub `unattributedFileActivity` (`UnattributedFileChange[]`) | `HubSnapshotService.ts:37` `UnattributedFileChange = {eventId, timestamp, type, artifactPath?, decision?}`; payload field `:246` | `grep -n 'UnattributedFileChange\|unattributedFileActivity' HubSnapshotService.ts` → 37, 82, 246 |
| Hub `education` (`{enabled, proficiency}`) | `HubSnapshotService.ts:275` `education: this.deps.getEducationConfig?.()` | `grep -n 'getEducationConfig' HubSnapshotService.ts` → 275 (and the dep declaration) |
| Lesson registry (`LESSONS` map, `getLesson`, `glossaryLessons`) | `FailSafe/extension/src/education/lessons.ts:167` `export const LESSONS`, `:193` `glossaryLessons()`, `:211` `getLesson` | `grep -n 'export const LESSONS\|export function' education/lessons.ts` |
| 4 governance-moment lesson literals to **REPLACE** | `lessons.ts:75` `anchor: "governance-mode"`, `:98` `"shield.plan"`, `:119` `"shield.audit"`, `:140` `"shield.substantiate"` | `grep -n 'anchor:' lessons.ts` → 4 governance-moment hits |
| Learn tab + LearnRenderer wiring | `roadmap/ui/command-center.html` (`data-target="learn"`, `<div id="learn">`); `command-center.js` `learn: new LearnRenderer('learn')` | v3 wiring; carries forward unchanged |
| `failsafe.education.proficiency` enum (`enumDescriptions` is NET-NEW, added by Phase 3c) | `FailSafe/extension/package.json:278-287` block contains `type`/`enum`/`default`/`description` only — NO `enumDescriptions` field today. The lone `enumDescriptions` in the file (`:355`) belongs to the `failsafe.governance.mode` block (`:348`), not to `proficiency`. | `grep -nE 'failsafe\.education\.proficiency\|failsafe\.governance\.mode\|enumDescriptions' package.json` → 278 (proficiency), 348 (governance.mode), 355 (governance.mode's enumDescriptions) |
| Settings `enabled` setting (carries) | `FailSafe/extension/src/education/educationConfig.ts:37` `readEducationConfig()` | carries unchanged |
| Glossary lessons + `renderGlossary` | `lessons.ts:18-22` glossary imports/composition; `education-glossary.js` `renderGlossary({enabled, proficiency})` | carries unchanged (glossary is secondary sub-section on Learn) |
| `bindLessonDismiss` (carries) | `roadmap/ui/modules/education-lesson.js` `bindLessonDismiss(root)` | carries unchanged |
| Coherence test infra | `src/test/education/lesson-anchor-coherence.test.ts` (webview/native/glossary classification) | carries; the v3 track-command extension is reverted (Phase 5); the SWE-ratio check is added (Phase 4) |

**Phase 0 + each subsequent phase re-confirms these anchors at implementation time and records any drift.**

---

## Phase 0 — Content contract matrix (operator content-review gate)

### Affected Files

- `.failsafe/governance/CONTENT_MATRIX_failsafe-learn-swe-craft.md` — **new** (local governance artifact under gitignored `.failsafe/`; this is the operator-curated content source that downstream phases consume).

### Changes

Author the lesson-content matrix BEFORE any implementation edits. One row per required essay (5 essays); columns per the Codex addendum:

| Column | Purpose |
|---|---|
| `lesson_anchor` | stable key (e.g. `learn.essay.slow-down-to-speed-up`) |
| `essay_title` | the user-facing essay name |
| `beginner_decision_skill` | the concrete judgment move the essay teaches |
| `common_bad_instinct` | the misconception this essay counters (cf. addendum's 6-misconception map) |
| `agent_example_scenario` | a concrete "I asked the agent X and got Y" scenario the essay leads with |
| `verification_habit` | the verification loop the essay reinforces |
| `tier_framing.beginner` | the "New to code" framing for the essay body |
| `tier_framing.intermediate` | the "AI builder" framing |
| `tier_framing.advanced` | the "Product/PM background" framing |
| `nudge_trigger` | the trigger anchor that surfaces this essay contextually (1-to-1 with Phase 2 trigger anchors) |
| `compliance_note` | per-row attestation that the row's content is non-assessment / non-scoring / non-inferential |

Operator owns final content at the Phase 0 confirmation gate (mirror the v1 lesson-wording-review pattern). Downstream phases (1, 3, 6) translate the matrix into shipping artifacts (`lessons.ts` literals, essay-card prose, doc rewrites). Implement MUST NOT invent content not declared in this matrix.

### Unit Tests

- None for Phase 0 (it is an authoring artifact, not code). The Phase 4 coherence ratio check provides downstream verification that the matrix's SWE-craft content is what actually ships.

---

## Phase 1 — Lesson registry content replacement

### Affected Files

- `FailSafe/extension/src/test/education/lessons.test.ts` — **modify** (add the FX591-MODIFIED behavior assertions for the new 5 SWE-craft anchors; carry the existing glossary + getLesson tests).
- `FailSafe/extension/src/education/lessons.ts` — **modify**: remove the 4 governance-moment lesson literals (lines 72–159 in current state); replace `LESSON_LIST` with 5 SWE-craft lesson literals (anchors below); the `Lesson` type, `lessonKind`, `glossaryLessons`, `getLesson`, and `LESSONS` map carry unchanged.
- `FailSafe/extension/src/education/lessons-content-swe-essays.ts` — **new sibling content module** (only created if `lessons.ts` would exceed the 250-line razor; the addendum's tier-bodied content for 5 essays likely requires the split per the existing `glossary-content.ts` pattern). Mirrors the `glossary-content.ts` import shape.
- `FailSafe/extension/src/education/lessons-content-swe-essays-2.ts` — **new** if a further split is needed for razor (decided at implement time).

### Changes

The 5 SWE-craft lesson literals (anchors fixed; bodies sourced from the Phase 0 matrix):

| Anchor | Term | Notes |
|---|---|---|
| `learn.essay.slow-down-to-speed-up` | *Slow down to speed up* | The mantra essay. Three tier bodies. |
| `learn.essay.scope-before-prompt` | *Scope before prompt* | Includes the scope template. |
| `learn.essay.acceptance-criteria` | *Acceptance criteria before code* | Includes the acceptance-criteria template (per addendum). |
| `learn.essay.choose-agent-option` | *Choosing between agent suggestions* | Includes the 6-question option-evaluation table (per addendum). |
| `learn.essay.verify-output` | *Verify before you believe* | Includes the diff-read / run / debug verification loop. |

Each literal: `kind: 'moment'` (default; carries the existing class system — these are governance-moment-style lessons that mount on the Learn tab essay list). `levels: ["beginner", "intermediate", "advanced"]`. `body` per the Phase 0 matrix's tier-framing columns.

The 12 `'glossary'`-kind lessons remain unchanged (sourced from `glossary-content.ts` + `glossary-content-2.ts`; the LESSONS map composition is unchanged).

### Unit Tests (red-then-green in implement)

- `lessons.test.ts` (FX591 MODIFIED) — **5 new cases + carry existing**: each of the 5 SWE-craft anchors exists in LESSONS; each has all three tier bodies non-empty; `getLesson('learn.essay.<anchor>', <level>)` returns the level-appropriate body; the fallback chain still works for missing-level lookups; no governance-moment-style anchors (`governance-mode`, `shield.*`) remain in LESSON_LIST.

---

## Phase 2 — Contextual surfacing trigger engine

### Affected Files

- `FailSafe/extension/src/test/education/lessonTriggers.test.ts` — **new** (Phase 2 test file; written first).
- `FailSafe/extension/src/education/lessonTriggers.ts` — **new leaf** (pure functions; type-only import of hub-payload shapes; no DOM, no VS Code API, no fs).

### Changes

`lessonTriggers.ts` exposes:

```ts
export type NudgeAnchor =
  | "learn.essay.slow-down-to-speed-up"
  | "learn.essay.scope-before-prompt"
  | "learn.essay.acceptance-criteria"
  | "learn.essay.choose-agent-option"
  | "learn.essay.verify-output";

export interface TriggerInput {
  /** From `hub.activePlan`. */
  activePlan?: { phases?: Array<{ id: string; description?: string; estimatedScope?: number; artifacts?: unknown[] }>; title?: string } | null;
  /** From `hub.recentCheckpoints[0].timestamp` (most-recent first). */
  lastCheckpointAt?: string | null;
  /** From `hub.unattributedFileActivity[]` (the ring buffer). */
  unattributedFileActivity?: Array<{ eventId: string; timestamp: string; type: string; artifactPath?: string }>;
  /** Webview-tracked session-start (ISO timestamp; localStorage). NEVER server-side. */
  sessionStartedAt?: string | null;
  /** Per-anchor count of times the nudge has fired this session (frequency-cap input). */
  recentNudgeCount?: Partial<Record<NudgeAnchor, number>>;
  /** Per-anchor dismissed flag (from the existing `fs-edu-dismissed:<anchor>` localStorage). */
  dismissed?: Partial<Record<NudgeAnchor, boolean>>;
  /** Wall-clock for tests (defaults to Date.now()). */
  now?: number;
}

export interface TriggerResult {
  anchor: NudgeAnchor;
  fire: boolean;
  reason: string; // human-readable rationale (for tests + debug)
}

export const PER_ANCHOR_CAP = 1;     // per-session max firings per anchor
export const PER_SESSION_GLOBAL_CAP = 2;
export const SESSION_THRESHOLD_MINUTES = 25;

export function evaluateTriggers(input: TriggerInput): TriggerResult[];
export function applyCaps(results: TriggerResult[], input: TriggerInput): TriggerResult[];
```

Per-anchor evaluator semantics (carried from the addendum's nudge table + research brief's signal mapping):

| Anchor | Fire condition |
|---|---|
| `learn.essay.scope-before-prompt` | `activePlan == null` OR (`activePlan` exists AND `unattributedFileActivity.length > 0` AND no `unattributedFileActivity[].artifactPath` matches any `activePlan.phases[].artifacts[]`) |
| `learn.essay.acceptance-criteria` | `activePlan.phases` has ≥1 phase with non-empty `description` AND empty `artifacts` |
| `learn.essay.choose-agent-option` | `unattributedFileActivity` includes a path matching `/package(-lock)?\.json|tsconfig|vite\.config|\.github/workflows/|requirements\.txt|Cargo\.toml|extension manifest/` |
| `learn.essay.verify-output` | `unattributedFileActivity.length >= 5` AND no checkpoint after the earliest unattributed-activity timestamp |
| `learn.essay.slow-down-to-speed-up` (pace-and-checkpoint) | `(now - sessionStartedAt) > SESSION_THRESHOLD_MINUTES * 60_000` AND `(lastCheckpointAt == null OR lastCheckpointAt < sessionStartedAt)` |

`applyCaps` enforces the per-anchor + per-session global caps and the dismissed gate; returns the filtered set (ordered by fire-condition priority — declared in code, fixed order). A dismissed anchor never fires again this session.

### Unit Tests (red-then-green in implement)

- `lessonTriggers.test.ts` (FX608) — **15+ cases**:
  - Each anchor fires on its declared input shape (5 cases).
  - Each anchor does NOT fire when its precondition is absent (5 cases).
  - `applyCaps` suppresses an anchor that already hit `PER_ANCHOR_CAP` this session.
  - `applyCaps` suppresses below-cap anchors when the per-session global cap is reached.
  - `applyCaps` suppresses any anchor marked `dismissed`.
  - `evaluateTriggers` returns a stable ordering regardless of input field order.

---

## Phase 3 — Learn tab essay-list surface + tier label reframe

### Affected Files

- `FailSafe/extension/src/test/education/learn-essay-list.test.ts` — **new** (Phase 3 test file).
- `FailSafe/extension/src/test/education/learn-tab.test.ts` — **modify** (replace the v3 composition tests; the Guided Dev Cycle expectation goes away; new expectations for the essay list + glossary composition).
- `FailSafe/extension/src/test/ui/command-center-learn-essays.spec.ts` — **new Playwright spec**.
- `FailSafe/extension/src/roadmap/ui/modules/learn-essay-list.js` — **new leaf renderer**: `renderEssayList(lessons, { enabled, proficiency, triggerResults? })` returns an HTML string for the Learn tab. Each essay is a card with title, current-tier body, and embedded templates (acceptance-criteria template / option-evaluation table where the essay declares them). When `triggerResults?` contains a fired anchor matching an essay, that essay is marked with a `data-relevant-now="true"` badge ("Relevant for what you're doing now") and sorted to the top.
- `FailSafe/extension/src/roadmap/ui/modules/learn.js` — **modify**: replace `renderGuidedDevCycle` + `bindGuidedDevCycleCopy` with `renderEssayList` + nothing-to-bind-beyond-dismiss. Composition order: essay list (primary) → glossary (secondary). `bindLessonDismiss` retained for the essay-card dismiss controls.
- `FailSafe/extension/src/roadmap/ui/command-center.css` — **modify**: add `.cc-learn-essay-card`, `.cc-learn-essay-list`, `.cc-learn-essay-relevant-now` styles; remove the `.cc-gdc-*` rules added in v3.
- `FailSafe/extension/package.json` — **modify**: **ADD** a NEW `enumDescriptions` field to the `failsafe.education.proficiency` configuration block (verified the field does NOT exist today — the block at `:278-287` carries only `type`/`enum`/`default`/`description`). The three strings: `"New to code — assume near-zero engineering knowledge; explain terms directly."` / `"AI builder — can produce code with an agent; needs judgment around scope, verification, maintainability."` / `"Product/PM background — connects software judgment to product judgment: scope, risk, acceptance criteria, tradeoffs, release confidence."`. Enum values unchanged.
- `FailSafe/extension/src/test/education/proficiency-labels.test.ts` — **new** (FX613 test): load `FailSafe/extension/package.json`, walk to `contributes.configuration.properties["failsafe.education.proficiency"].enumDescriptions`, assert array length === 3 and assert each element starts with the operator-binding addendum tier label.

### Changes

**3a — `learn-essay-list.js`**. Reads `lessons` (the LESSONS values filtered to `kind: 'moment'` and anchor-prefix `learn.essay.`). For each essay produces an `<article class="cc-learn-essay-card" data-essay-anchor="…">` with the title, the level-appropriate body (per `proficiency`), and inline rendering of the addendum's templates where the essay metadata declares them. Cards are visually prominent (the primary content of the Learn tab). Each card carries a "Dismiss" affordance (per-anchor) reusing the v1 `data-edu-dismiss` pattern so `bindLessonDismiss` handles it.

**3b — `learn.js` recomposition**. The new innerHTML order:
```js
this.container.innerHTML = `
  ${renderEssayList(essayLessons, { enabled, proficiency, triggerResults })}
  ${renderGlossary(hub.education)}`;
```
Glossary is the *secondary reference* — visually de-emphasized (smaller heading, below the essay list). Where `triggerResults` comes from: an optional client-side eval that runs `lessonTriggers.evaluateTriggers(input)` + `applyCaps(...)` against `hub` + webview localStorage state. If unavailable (e.g. trigger engine not yet bundled), `renderEssayList` falls back to the unsorted default order. *(Trigger-engine browser bundling is Phase 5's revert+update of `bundle.cjs`/`copy-ui-js.cjs` — add `lessonTriggers.ts` to the browser-ESM emit alongside `lessons.ts`.)*

**3c — Tier labels in package.json**. **ADD** a new `enumDescriptions` field to the `failsafe.education.proficiency` configuration block (verified the field does NOT exist today — the existing block has only `type`/`enum`/`default`/`description`). The new field carries the operator-binding labels per the addendum:
```json
"enumDescriptions": [
  "New to code — assume near-zero engineering knowledge; explain terms directly.",
  "AI builder — can produce code with an agent; needs judgment around scope, verification, maintainability.",
  "Product/PM background — connects software judgment to product judgment: scope, risk, acceptance criteria, tradeoffs, release confidence."
]
```
Enum values (`beginner`/`intermediate`/`advanced`) unchanged. The default stays `beginner`.

### Unit Tests (red-then-green in implement)

- `learn-essay-list.test.ts` (FX609) — jsdom: `renderEssayList` produces exactly 5 essay cards when 5 SWE-craft anchors exist; each card shows the title + the level-matched body; templates (acceptance-criteria, option-evaluation) render where declared; cards with a matching fired-trigger anchor carry `data-relevant-now="true"` and appear before non-relevant cards; HTML-escaping of essay copy works (hostile-fixture test).
- `learn-tab.test.ts` (FX606 MODIFIED) — jsdom: `LearnRenderer` composes essay list (primary) + glossary (secondary, visually below); glossary absent when `education.enabled` false; essay list still renders regardless of `education.enabled` (the walkthrough surface — but per addendum the *essay set* is also gated by `enabled`? Decided in code review at the Phase 0 gate — for v1, gate the essay list on `enabled` to match the glossary discipline, since both are education content); no `#cc-guided-dev-cycle` references.
- `command-center-learn-essays.spec.ts` (FX611) — Playwright: navigate to Learn tab; assert 5 essay cards visible; click one, assert the body content + at least one template render; verify Dismiss works (card removed + persisted via localStorage); verify glossary section appears below the essay list, visually secondary.
- `proficiency-labels.test.ts` (FX613) — load `FailSafe/extension/package.json`, walk to `contributes.configuration.properties["failsafe.education.proficiency"].enumDescriptions`; assert array length === 3; assert element 0 starts with `"New to code"`, element 1 starts with `"AI builder"`, element 2 starts with `"Product/PM background"`. Fails red when the field is absent (current state) and green after Phase 3c adds it.

---

## Phase 4 — Compliance + coherence

### Affected Files

- `FailSafe/extension/src/test/education/lesson-anchor-coherence.test.ts` — **modify**: (a) **revert** the FX598 v3 track-command extension (no `DEFAULT_TRACK` to validate any more); (b) **add** the SWE-content-vs-FailSafe-vocab ratio check (FX612 NEW behavior on the same test file).
- `docs/compliance-education-component.md` — **rewrite** in place: full replacement of the v1 + v3 framing with the fresh Annex III determination for the SWE-craft intent (per research brief Finding 3), the operator self-select-tier design contract, the GDPR client-side-only constraint for session-duration timing, and the binding escalation triggers.

### Changes

**4a — Revert track-command extension**. Remove the v3 `suite("Guided Dev Cycle track-command coherence (FX598 v3)")` block + the `DEFAULT_TRACK` import + `installedSkillNames()` + `checkTrackCommands()` helpers from `lesson-anchor-coherence.test.ts`. Restore the v1 imports + assertions.

**4b — Add SWE-content-vs-FailSafe-vocab ratio check (FX612)**. New suite in the same test file:

```ts
suite("Learn primary content — SWE-craft vocabulary dominance (FX612)", () => {
  test("FX612 SWE-craft lesson literals contain SWE vocabulary > FailSafe vocabulary", () => {
    // Aggregate body text from all `kind:'moment'` lessons whose anchor starts with `learn.essay.`.
    // Count SWE keywords (scope, acceptance, criteria, verify, dependency, diff, test, debug,
    //   reversible, blast radius, prompt, agent, refactor, commit, branch, edge case, ...).
    // Count FailSafe keywords (SHIELD, governance, ledger, sentinel, qor-, audit gate, ...).
    // Assert SWE count >= FailSafe count * 3 (3:1 dominance threshold; tunable in code).
  });
  test("FX612 fixture — a Learn essay dominated by FailSafe vocab is CAUGHT", () => {
    // Inject a hostile fixture lesson with FailSafe-only vocab; assert the check fails on it.
  });
});
```

This is the test-side enforcement of ideation failure-remediation class 1 ("content drifts back to FailSafe-vocab-only").

**4c — Rewrite `docs/compliance-education-component.md`**. Top-matter: "FailSafe Learn — Software Development Craft (v5.2.0)"; determination date 2026-05-22 (fresh, not the v1 one). Sections:
- Annex III(3) determination — STAYS OUTSIDE (per research brief Finding 3a; all four triggers absent).
- Article 4 alignment — explicit alignment-stronger statement.
- GDPR — the client-side-only session-duration constraint (binding design contract).
- WCAG — carry the v1 `<details>` accessibility commitment; extend to the essay-card and trigger-engine UI.
- DSA, Art. 13/50 transparency — not applicable / no live-AI surface.
- Binding escalation triggers (carry from ideation): (1) any introduction of scoring / grading / assessment / level-inference → STOP, re-ideate; (2) expansion to a full structured curriculum within the extension → STOP, escalate to FailSafe Pro / separate-extension scope decision.
- Confirmed v1 surface inventory (anchor → surface) — table covering: the 5 SWE-craft essay anchors mounted on the Learn-tab essay list; the 12 glossary anchors mounted on the Learn-tab glossary section; the 4 v1 governance-moment lessons (governance-mode card, SHIELD phase tracker, native picker/onboarding) — *these are NOT Learn-tab surfaces; they live on Settings + Monitor + native and are unrelated to the Learn-tab rebuild.*

### Unit Tests (red-then-green in implement)

- `lesson-anchor-coherence.test.ts` (FX598 MODIFIED — v3 extension reverted; baseline v1 cases restored) — confirm the v1 6 cases pass on the rebuilt registry; confirm the v3 track-command cases are absent.
- `lesson-anchor-coherence.test.ts` (FX612 NEW) — the SWE-craft dominance check passes on the shipped registry; fails (caught) on the hostile FailSafe-vocab fixture.

---

## Phase 5 — Scrap + revert

### Affected Files

**Delete (`rm` — untracked-new files from the rejected v3 staging that never committed):**
- `FailSafe/extension/src/education/devCycleTrack.ts`
- `FailSafe/extension/src/roadmap/ui/modules/guided-dev-cycle.js`
- `FailSafe/extension/src/test/education/devCycleTrack.test.ts`
- `FailSafe/extension/src/test/education/guided-dev-cycle.test.ts`
- `FailSafe/extension/src/test/ui/command-center-guided-dev-cycle.spec.ts`
- `docs/GUIDED_DEV_CYCLE.md`

**Revert (working-tree v3 modifications to be restored to HEAD state OR re-modified for v4):**
- `FailSafe/extension/scripts/bundle.cjs` — revert the v3 `for (const eduName of ["lessons", "devCycleTrack"])` loop back to the single-entry `lessons.ts` emit; **then re-extend** to also emit `lessonTriggers.ts` (Phase 2). Final state: `for (const eduName of ["lessons", "lessonTriggers"])`.
- `FailSafe/extension/scripts/copy-ui-js.cjs` — same revert + same re-extension.
- `FailSafe/extension/src/test/ui/command-center-glossary.spec.ts` (FX601 MODIFIED) — the v3 spec already navigates to the Learn tab (correct for v4); the "absent when education disabled" test currently expects `#cc-guided-dev-cycle` visible — **update** that assertion to expect `#cc-learn-essay-list` (or whatever container id Phase 3 chooses) visible instead.

**Leave alone (working-tree v3 changes that are still correct for v4):**
- `FailSafe/extension/src/roadmap/ui/command-center.html` — the Learn tab button + panel are correct for v4.
- `FailSafe/extension/src/roadmap/ui/command-center.js` — `LearnRenderer` registration is correct.
- `FailSafe/extension/src/roadmap/ui/modules/settings.js` — glossary removal stays (glossary lives on Learn tab in v4 too).
- `FailSafe/extension/src/test/test-workspace/.gitignore` — keep (test fixture, untracked, harmless).

### Changes

The scrap+revert pass leaves the working tree at a clean v4 baseline:
- Rejected Guided Dev Cycle artifacts deleted.
- `bundle.cjs`/`copy-ui-js.cjs` emit `lessons` + `lessonTriggers` browser-ESM (not `devCycleTrack`).
- The glossary-spec assertion uses the v4 essay-list container.
- All other v3 modifications (Learn tab wiring, settings.js glossary removal, css, command-center.js) are preserved as v4 carry-forward.

### Unit Tests

No new tests; the verification is that the deleted files are gone, the compile passes, and the updated FX601 Playwright spec still passes.

---

## Phase 6 — Doc rewrites

### Affected Files

- `docs/EDUCATION.md` — **rewrite** for SWE-craft framing.
- `docs/VIBE_CODER_PLAYBOOK.md` — **rewrite** around the 5 essays + templates per addendum (the v3 version is structured around the SHIELD walkthrough — wrong premise).
- `docs/UI_MANIFEST.md` — **modify** the Learn-tab Command Center section: remove the Guided Dev Cycle row; add the essay-list row; glossary row stays.
- `docs/FEATURE_INDEX.md` — **modify**: mark FX603, FX604, FX605, FX607 as `superseded` (the rejected Guided Dev Cycle entries); update FX591 / FX598 / FX601 / FX606 to reflect their v4 MODIFIED content; **append** new FX608 / FX609 / FX610 / FX611 / FX612 / FX613 rows for the new units (lessonTriggers, learn-essay-list, LearnRenderer recomposition, Playwright essay-list, SWE-ratio check, tier-label package.json reframing).
- `CHANGELOG.md` — **rewrite** the `[Unreleased] — v5.2.0 (draft)` block: remove Guided Dev Cycle / SHIELD-walkthrough mentions; replace with the SWE-craft Learn tab description, the 5 essays, the trigger engine, the tier labels, the Annex III + GDPR posture, and a note that the rejected Educational Component v1 + Part B (sealed #388 / #389) were superseded.

### Changes

Each doc rewrite is straightforward content authoring. The plan is the source-of-truth for what to say; the operator owns final wording at the Phase 6 review gate.

### Unit Tests

None for doc rewrites *(per qor-plan: docs do not require unit tests; the Phase 4 coherence ratio check provides downstream content-discipline enforcement)*.

---

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX591 | MODIFIED | `src/test/education/lessons.test.ts` | LESSONS registry exposes the 5 SWE-craft anchors (`learn.essay.*`) with all-tier bodies; the 4 governance-moment anchors are gone; glossary unchanged |
| FX598 | MODIFIED | `src/test/education/lesson-anchor-coherence.test.ts` | v3 track-command extension reverted; v1 coherence baseline restored on the rebuilt registry |
| FX601 | MODIFIED | `src/test/ui/command-center-glossary.spec.ts` | "absent when disabled" assertion now expects the v4 essay-list container instead of `#cc-guided-dev-cycle` |
| FX603 | SUPERSEDED (entry retired) | n/a | Guided Dev Cycle track model removed |
| FX604 | SUPERSEDED (entry retired) | n/a | `deriveTrackState` removed |
| FX605 | SUPERSEDED (entry retired) | n/a | `renderGuidedDevCycle` removed |
| FX606 | MODIFIED | `src/test/education/learn-tab.test.ts` | LearnRenderer composes essay list (primary) + glossary (secondary); no Guided Dev Cycle |
| FX607 | SUPERSEDED (entry retired) | n/a | Guided Dev Cycle Playwright spec removed |
| FX608 | NEW | `src/test/education/lessonTriggers.test.ts` | 5 trigger evaluators + `applyCaps` enforce per-anchor + per-session global caps + dismissed gate |
| FX609 | NEW | `src/test/education/learn-essay-list.test.ts` | `renderEssayList` produces 5 essay cards with tier-matched bodies + templates; relevant-now badge + sort on fired-trigger anchors; HTML-escaped |
| FX610 | NEW | `src/test/education/learn-tab.test.ts` | trigger-engine integration: `LearnRenderer` passes `triggerResults` into `renderEssayList` and the essay order reflects them |
| FX611 | NEW | `src/test/ui/command-center-learn-essays.spec.ts` | Playwright: Learn tab → 5 essay cards visible; click one to read; dismiss works; glossary visibly secondary |
| FX612 | NEW | `src/test/education/lesson-anchor-coherence.test.ts` | SWE-craft vocabulary dominates FailSafe vocabulary in the Learn primary content; hostile fixture is caught |
| FX613 | NEW | `src/test/education/proficiency-labels.test.ts` | `failsafe.education.proficiency.enumDescriptions` is a 3-element array; element 0 starts with "New to code", element 1 starts with "AI builder", element 2 starts with "Product/PM background"; test fails red when the field is absent (current state) and green after Phase 3c adds it |

---

## CI Commands

- `npm --prefix FailSafe/extension run compile` — `tsc -p ./ && node ./scripts/copy-ui-js.cjs`; exit 0.
- `npm --prefix FailSafe/extension run lint` — ESLint clean (0 errors; warnings allowed).
- `npm --prefix FailSafe/extension test` — full `vscode-test` suite (v3 baseline 2821 passing minus retired FX603–FX605/FX607 cases plus new FX608/FX609/FX610/FX612 cases plus FX591/FX598/FX601/FX606 modifications).
- `npm --prefix FailSafe/extension run test:e2e` — Playwright (FX596/FX597 unchanged; FX601 modified; FX607 retired; FX611 new).
- `node FailSafe/extension/scripts/bundle.cjs` — VSIX bundle emits `lessons` + `lessonTriggers` browser-ESM modules without error.

---

## Cross-cutting

- **Section 4 Razor**: every new file < 250 lines. `lessons.ts` keeps its scaffolding; SWE-craft essay literals go into 1–2 sibling files (`lessons-content-swe-essays.ts` [+ `-2.ts` if needed]) following the existing `glossary-content-*.ts` pattern. `lessonTriggers.ts` is a pure-function module (≤200 lines target). `learn-essay-list.js` is a leaf renderer (≤200 lines target). `learn.js` shrinks (removes Guided Dev Cycle composition).
- **META_LEDGER**: One consolidated SESSION SEAL at `/qor-substantiate`. This entry SUPERSEDES META_LEDGER #389 (the rejected v3 stage-only seal) with a fresh entry covering the rebuilt change set. #389 stays in the working-tree ledger as a superseded intermediate (append-only — no chain rewrite). The new entry's `previous_hash` chains from #389 (the working-tree state); chain integrity preserved.
- **Review Boundary**: Stage only — NO commit, push, PR, merge, tag, or publish without explicit per-action operator approval. `package.json` stays at `5.1.8` until `/qor-repo-release`.
- **Issue #65**: The original GitHub issue #65 ("Add interactive Guided Dev Cycle onboarding to Command Center") is NOT satisfied by this rebuild — the operator rejected that framing. The plan v4 does NOT close #65; a separate decision is needed on whether to close #65 as "won't fix" (the SHIELD walkthrough was the wrong product), redirect #65 to a FailSafe Pro / separate-extension backlog item, or leave open. This is a *deferred operator decision* (post-substantiate, non-blocking).
- **CI gate**: `change_class: feature` triggers the e2e-coverage gate — satisfied by FX611 (the new Playwright) + the modified FX601 + the carry-forward FX596 / FX597.

---

## Compliance posture (summary; details in Phase 4 rewrite of `compliance-education-component.md`)

- **EU AI Act Annex III(3)**: STAYS OUTSIDE — no access determination, no learning-outcome evaluation, no level assessment (operator self-select), no behavior monitoring. Same design contract as v1; SWE-craft content does not change the determination.
- **EU AI Act Article 4**: Alignment is stronger under the new intent — the component literally is AI-literacy support.
- **GDPR**: Binding design contract — session-duration timing client-side only (webview `localStorage`); never transmitted server-side.
- **WCAG**: Carry the v1 `<details>` keyboard + screen-reader pattern; extend to the essay-card and (when added) trigger-engine UI.
- **DSA, Art. 13/50**: Not applicable / no live-AI surface (content is operator-curated, not runtime-LLM-generated).
- **Risk grade**: L2.

---

## Failure remediation (carry from ideation, refreshed against this plan)

| Failure class | Detection signal | Containment | return_phase |
|---|---|---|---|
| Content drifts back to FailSafe-vocab-only | FX612 SWE-content-vs-FailSafe-vocab ratio check fails | revert content | ideation |
| Scope creep toward full LMS | PR adds assessment / scoring / tracking surface | VETO | ideation |
| Compliance boundary crossed (inference / scoring) | PR adds learner-level inference or learner score | hard block | ideation |
| Context triggers misfire (wrong-moment lesson) | dogfooding false-positive rate above tolerance | tune triggers | plan |
| Curriculum creep (essay count balloons past 5 / progression mechanics appear) | PR adds course-platform mechanics OR essay count > 5 in `LESSONS` | VETO + escalate to Pro/separate-extension scope decision | ideation |

---

## Non-goals restated (scope guard — binding per addendum)

1. No full course platform / LMS / certification / graded quiz / learner score / progression system.
2. No runtime LLM-generated lesson content.
3. No prompt capture from Copilot Chat / Claude Code / terminals / other extensions.
4. No server-side session-duration tracking.
5. No new telemetry for learner behavior.
6. No blocking modal coach that interrupts the user.
7. No broad refactor of Learn scaffolding unless required by tests or Section 4 limits.

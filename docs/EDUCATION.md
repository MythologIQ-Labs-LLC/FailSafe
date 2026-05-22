# FailSafe Educational Component

**Introduced**: v5.2.0 · **Plan**: `docs/plan-qor-educational-component.md` · **Compliance**: `docs/compliance-education-component.md`

The Educational Component translates FailSafe's governance vocabulary into plain language **at the governance moment where the user needs it** — inline, opt-in, and dismissible. It exists to close the *governance-literacy gap* for non-traditional builders (PM/CX-style operators) and developers new to governed workflows.

It is **contextual product guidance, not training software** — no academy, no LMS, no quizzes, no scoring, no blocking. The SHIELD lifecycle is the curriculum spine: explanations attach to the phases and surfaces the user already meets.

## How it works

A **micro-lesson** is a short, plain-language explanation of one governance term, keyed to a stable `anchor` and authored at three proficiency levels.

- **Lesson registry** — `src/education/lessons.ts`. The single source of truth: a typed `Lesson` (`id`, `anchor`, `term`, `levels`, `body`) and a `LESSONS` map keyed by `anchor`. `getLesson(anchor, level)` returns the level-appropriate body with a documented fallback.
- **Settings** — `failsafe.education.enabled` (default `true`) and `failsafe.education.proficiency` (`beginner` | `intermediate` | `advanced`, default `beginner`). Proficiency is **operator-set only** — never inferred, no telemetry. `readEducationConfig()` (`src/education/educationConfig.ts`) reads it; the value is threaded to the webview through the hub snapshot.
- **Affordance** — `roadmap/ui/modules/education-lesson.js`. `renderLesson(anchor, {enabled, proficiency})` returns a collapsed-by-default, dismissible "What does this mean?" expander (or an empty string when education is off or no lesson exists). Dismiss state persists per anchor. Styled in `command-center.css`.

## v1 wired surfaces

| Anchor | Surface | Type |
|---|---|---|
| `governance-mode` | Settings governance-mode card (`governance-mode-card.js`) | webview expander |
| `governance-mode` | First-run mode picker + onboarding (`FirstRunModePicker.ts`, `FirstRunOnboarding.ts`) | VS Code native |
| `shield.plan` / `shield.audit` / `shield.substantiate` | Monitor SHIELD phase tracker (`monitor-render.js`) | webview expander |

Implement/Release surfaces receive lighter glossary hints in a later iteration.

## FailSafe Glossary

Beyond the governance-moment lessons, the component ships a **12-term glossary** of FailSafe / agentic-coding vocabulary — the terms a non-traditional builder hits and stalls on. Glossary lessons carry `kind: 'glossary'` (governance-moment lessons are `kind: 'moment'`, the default); they are not anchored to a governance moment but listed together in a collapsed-by-default **"FailSafe Glossary"** section in the Settings tab (`education-glossary.js`, gated on `failsafe.education.enabled`).

v1 glossary terms: **MCP server**, **governance interceptor**, **risk tiers (L1–L3) / L3 approval**, **Sentinel**, **decision drift**, **the ledger (META_LEDGER / Merkle chain)**, **Shadow Genome**, **bicameral**, **receipt / verdict / evaluation**, **Enforcement Engine**, **SHIELD (lifecycle overview)**, **agent / agentic coding** — each at all three proficiency levels.

Tech-stack and general (non-FailSafe) coding terminology are deliberately out of scope — the glossary explains FailSafe's own vocabulary, not software engineering at large.

## Authoring a lesson

1. Add a `Lesson` to `LESSONS` in `src/education/lessons.ts` — give it a unique `anchor`, the `term`, and a `body` for each proficiency level (beginner = what & why; intermediate = trade-offs; advanced = a terse reminder).
2. Mount it at a surface by calling `renderLesson(anchor, cfg)` (webview) or reading `getLesson(anchor, level)` (native).
3. The **lesson-anchor coherence check** (`src/test/education/lesson-anchor-coherence.test.ts`) fails if a lesson references a surface no longer in source — keeping content honest against the UI.

## Compliance posture

v1 is static contextual help — no assessment, no scoring, no learning-outcome evaluation, no access determination, no inferred proficiency. It is therefore **outside** EU AI Act Annex III high-risk education/training classification while supporting the Article 4 AI-literacy goal. See `docs/compliance-education-component.md` for the full determination and the binding escalation trigger.

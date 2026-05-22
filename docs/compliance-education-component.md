# Compliance Determination — Educational Component

**Component**: FailSafe Educational Component (v5.2.0)
**Determination date**: 2026-05-22 (Phase 0, `plan-qor-educational-component.md`)
**Status**: v1 scope is **outside** EU AI Act Annex III high-risk classification.
**Reference**: Regulation (EU) 2024/1689 (EU AI Act) — Article 4 (AI literacy); Annex III point 3 (education and vocational training).

---

## Annex III(3) determination

EU AI Act **Annex III point 3** designates as high-risk certain AI systems used in *education and vocational training*, specifically those intended to:

1. determine access or admission, or assign persons to educational institutions/programmes;
2. **evaluate learning outcomes**, including where used to steer the learning process;
3. assess the appropriate level of education an individual will receive or be able to access;
4. monitor and detect prohibited behaviour of students during tests.

The FailSafe Educational Component v1 does **none** of these. It is **static, contextual, opt-in product guidance** — plain-language micro-lessons that explain FailSafe's own governance vocabulary at the governance moment. Specifically, v1:

- does **not** assess, score, grade, or evaluate the user;
- does **not** evaluate or steer learning outcomes;
- does **not** determine access, admission, or level of education;
- does **not** monitor user behaviour or run tests/quizzes (blocking or otherwise);
- does **not** adapt content based on inferred user performance (proficiency is **operator-set** in Settings, never inferred);
- collects **no** telemetry as a v1 requirement.

It is therefore a contextual help/documentation surface, not an education or vocational-training AI system within the meaning of Annex III(3). The component carries **no Annex III high-risk obligations**.

## Article 4 alignment

Article 4 of the Regulation obliges providers and deployers to ensure a sufficient level of **AI literacy** among staff and other persons operating AI systems on their behalf. By making FailSafe's governance concepts comprehensible at the point of use, the Educational Component **supports** the AI-literacy objective — it is literacy-enabling, not outcome-evaluating. This is the intended posture: aligned with the literacy goal, deliberately clear of the Annex III high-risk pattern.

## Risk grade

**L2.** A multi-surface user-facing feature with a new Settings option and a content data model; no security/enforcement surface, no irreversible action, no high-risk classification.

## Escalation trigger (binding)

If **any** later phase or future revision introduces — adaptive assessment, user scoring, learning-outcome evaluation, access/level determination, behaviour monitoring, or inferred proficiency — the component **leaves** this determination's scope. In that event: **STOP**, re-open ideation (`/qor-ideate`) to re-frame scope, and obtain a fresh compliance determination before implementation continues. This trigger is also recorded in the sealed ideation artifact (`.qor/gates/2026-05-22T0000-educational/ideation.json`, failure-remediation FC4) and the v1 plan §Compliance.

---

## Phase 5 expansion — coherence guard and scope-creep defence

Phase 5a adds an automated **lesson-anchor coherence check** (`src/test/education/lesson-anchor-coherence.test.ts`, FX598). It cross-references every `Lesson.anchor` in the shipped registry against the governance-moment surfaces actually mounted in source. Beyond its engineering value (no dead lesson content), this check is also a **compliance guard**:

- It enumerates exactly which governance moments carry a micro-lesson, keeping the surface inventory of the component honest and auditable against this determination.
- It classifies each anchor as **webview-mounted** or **native-mounted** (audit advisory A3) — both are plain contextual help; neither is an assessment surface.
- A future change that wires a lesson into a *new* surface forces a registry entry, which the coherence check enumerates — making any drift toward an out-of-scope surface visible in review.

The check does **not**, and must not, evolve into a scoring or evaluation mechanism. It validates wiring coherence only.

### Confirmed v1 surface inventory (anchor → surface)

| Lesson anchor | Surface | Surface class |
|---|---|---|
| `governance-mode` | Settings governance-mode card (`governance-mode-card.js`) | webview expander |
| `governance-mode` | First-run mode picker + onboarding (`FirstRunModePicker.ts`, `FirstRunOnboarding.ts`) | VS Code native (no expander) |
| `shield.plan` / `shield.audit` / `shield.substantiate` | Monitor SHIELD phase tracker (`monitor-render.js`) | webview expander |
| `glossary.*` (12 agentic-vocabulary terms) | Settings "FailSafe Glossary" section (`education-glossary.js`), rendered below the Education-bearing settings card | webview expander |

Every surface above is static, opt-in, dismissible contextual help. None assesses, scores, gates, or evaluates the user — the determination above holds for the full v1 wired surface.

The Phase 6 `glossary.*` row is the agentic-vocabulary glossary (Phase 6c). It is a `'glossary'`-kind lesson class — definitional, plain-language entries that mount on a single collapsed-by-default Settings section, gated on `failsafe.education.enabled`. It adds no assessment, scoring, or outcome evaluation, so the Annex III determination above is unchanged (RD-6).

---

_Phase 0 originates this determination. Phase 5 §5b expands it with the coherence guard, the confirmed v1 surface inventory, and the scope-creep defence. This document is non-authoritative legal advice; it records the engineering compliance posture and the boundary the component must not cross._

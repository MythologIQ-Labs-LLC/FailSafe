# Compliance Determination — FailSafe Learn (Software Development Craft)

**Component**: FailSafe Learn v2 (the v5.2.0 release-gating Learn-tab surface)
**Determination date**: 2026-05-22 (Phase 4 of `docs/plan-qor-failsafe-learn-swe-craft.md`)
**Status**: v2 scope is **outside** EU AI Act Annex III high-risk classification.
**References**: Regulation (EU) 2024/1689 (EU AI Act) — Article 4 (AI literacy); Annex III point 3 (education and vocational training); GDPR; WCAG 2.x.
**Supersedes**: the v1 + v3 determination for the rejected Educational Component / Guided Dev Cycle (sealed META_LEDGER #388 / #389). The intent changed at the root; this is a fresh determination, not an amendment.

---

## Annex III(3) determination

EU AI Act **Annex III point 3** designates as high-risk certain AI systems used in *education and vocational training*, specifically those intended to:

1. determine access or admission, or assign persons to educational institutions/programmes;
2. **evaluate learning outcomes**, including where used to steer the learning process;
3. assess the appropriate level of education an individual will receive or be able to access;
4. monitor and detect prohibited behaviour of students during tests.

FailSafe Learn v2 does **none** of these. It is a **supporting layer that closes the user-judgment failure gap** in FailSafe's governance — five short SWE-craft essays surfaced contextually via the Learn tab, plus a small set of contextual nudges that point to the relevant essay based on the *project's* state (active plan, file activity, checkpoints). Specifically v2:

- does **not** assess, score, grade, or evaluate the user;
- does **not** evaluate or steer learning outcomes;
- does **not** determine access, admission, or level of education;
- does **not** monitor user behaviour or run tests/quizzes (blocking or otherwise);
- does **not** adapt content based on inferred user performance — the proficiency tier is **operator-set** in Settings (the new `enumDescriptions`-driven labels "New to code" / "AI builder" / "Product/PM background" are *starting-point selectors*, never inferred);
- carries **no telemetry** as a v2 requirement.

It is therefore a contextual help / documentation surface, not an education or vocational-training AI system within the meaning of Annex III(3). The component carries **no Annex III high-risk obligations**.

The contextual surfacing trigger engine (`src/education/lessonTriggers.ts`) observes **project state** — `activePlan.phases`, `recentCheckpoints`, `unattributedFileActivity`, `governancePhase` — *not* the person. A trigger that fires means "the project has reached a state where this essay is relevant," not "this user needs this essay because they performed poorly."

## Article 4 alignment

Article 4 of the Regulation obliges providers and deployers to ensure a sufficient level of **AI literacy** among staff and other persons operating AI systems on their behalf. Teaching non-traditional builders the engineering disciplines that make AI-assisted work sustainable is **exactly the literacy Art. 4 anticipates**. FailSafe Learn v2 is **more strongly aligned** with Article 4 than the rejected v1 was — the SWE-craft content is the literacy substrate; the FailSafe governance product is the application layer that benefits from a literate user.

## GDPR — binding design contract

**Session-duration timing for the "slow down to speed up" trigger MUST stay client-side only.** The webview tracks a session-start timestamp in `sessionStorage` (`fs-learn-session-start`, per-webview lifetime); the trigger evaluator compares it against `Date.now()` *inside the webview*; the only data that crosses to the server is the resulting *UI-state decision* (show essay X). The same `sessionStorage` namespace also holds the per-anchor nudge counts (`fs-learn-nudge-count:<anchor>`, which back the cumulative cap discipline) and per-anchor dismiss flags (`fs-learn-nudge-dismissed:<anchor>`). No session timing, no counts, no dismiss state is transmitted to the FailSafe ConsoleServer or anywhere external. This keeps the component clear of GDPR-relevant data processing.

The hub does expose `recentCheckpoints[0].timestamp` server-side — that is *project artifact data* (when a checkpoint was created), not user data. Comparing server-side checkpoint timestamps against client-side session timestamps inside the webview is consistent with the design contract.

## WCAG accessibility

The v1 micro-lesson `<details>` expander pattern (keyboard-accessible via Enter/Space, screen-reader friendly) carries forward. The new essay-card UI (`learn-essay-list.js`) uses native `<article>` semantics + the same `cc-edu-lesson` dismiss pattern; the templates render inside `<details>` elements. New contextual nudges (when added in a future iteration) must meet the same standard — keyboard-dismissible, screen-reader announces, sufficient color contrast.

## DSA, Art. 13/50 EU AI Act transparency

- **DSA**: does not apply (FailSafe is a locally-installed VS Code/Cursor extension, not a hosted intermediary service).
- **EU AI Act Art. 13/50 transparency**: lesson content is **operator-curated** at the Phase 0 content matrix gate, not runtime-LLM-generated (binding non-goal #2 in plan v4). No live-AI surface = no Art. 13/50 disclosure burden at runtime. If the operator drafts essays with an AI tool offline, the *drafting* happens in operator-supervised editing — the shipped component carries only operator-reviewed copy.

## Risk grade

**L2.** Multi-surface user-facing feature with a new Settings option (`enumDescriptions` enrichment) + a content data model + a small client-side trigger engine. No security/enforcement surface, no irreversible action, no high-risk classification.

## Binding escalation triggers

If **any** later phase or future revision introduces — adaptive assessment, user scoring, learning-outcome evaluation, access/level determination, behaviour monitoring, or inferred proficiency — the component **leaves** this determination's scope. In that event: **STOP**, re-open ideation (`/qor-ideate`) to re-frame scope, and obtain a fresh compliance determination before implementation continues.

A separate binding trigger: any expansion to a **full structured curriculum within the open extension** (LMS-style modules with required progression, gating, or assessment) → **STOP**, escalate to a FailSafe Pro / separate-extension scope decision. Curriculum is explicitly out of scope for this open editor extension per the sealed ideation.

Both triggers are recorded in:
- the sealed ideation artifact (`.failsafe/governance/IDEATION_failsafe-learn-swe-craft.md`) failure_remediation classes 2 + 5;
- plan v4 §boundaries.forbidden_interpretations;
- and this document.

---

## Confirmed v2 surface inventory (anchor → surface)

| Lesson anchor | Surface | Surface class |
|---|---|---|
| `learn.essay.slow-down-to-speed-up` · `learn.essay.scope-before-prompt` · `learn.essay.acceptance-criteria` · `learn.essay.choose-agent-option` · `learn.essay.verify-output` | Learn-tab essay list (`roadmap/ui/modules/learn-essay-list.js`) — five SWE-craft essay cards; primary Learn-tab content | webview essay-list |
| `glossary.*` (12 agentic-vocabulary terms) | Learn-tab "FailSafe Glossary" section (`education-glossary.js`) — secondary reference below the essay list | webview expander |
| `governance-mode` | Settings governance-mode card (`governance-mode-card.js`) — v1 carry-forward (not a Learn-tab surface) | webview expander |
| `governance-mode` | First-run mode picker + onboarding (`FirstRunModePicker.ts`, `FirstRunOnboarding.ts`) — v1 carry-forward | VS Code native |
| `shield.plan` / `shield.audit` / `shield.substantiate` | Monitor SHIELD phase tracker (`monitor-render.js`) — v1 carry-forward | webview expander |

Every surface above is static, opt-in, dismissible contextual help. None assesses, scores, gates, or evaluates the user. The Settings + Monitor surfaces carry the v1 governance-moment lessons unchanged (the SWE-craft pivot affects the Learn tab only).

### Coherence guard (FX598 + FX612)

Two test-side enforcement layers protect the determination at implementation time:

- **FX598 lesson-anchor coherence** — extended in v2 with an **essay-list** mount class. Every `learn.essay.*` anchor must classify to the essay-list surface (`learn-essay-list.js`); a dead essay anchor would be caught.
- **FX612 SWE-vocabulary dominance** — asserts the aggregated `learn.essay.*` body text contains SWE-craft vocabulary at ≥ 3× the FailSafe-governance vocabulary count. A hostile fixture (FailSafe-vocab-only body) is caught. This is the post-implement defense for plan v4 `failure_remediation` class 1 ("content drifts back to FailSafe-vocab-only").

Neither check evolves into a scoring or evaluation mechanism — they validate **content discipline** and **surface coherence**, never user behavior.

### Operator self-select-tier design contract (binding)

The `failsafe.education.proficiency` enum is **operator-set** by definition (it's a VS Code Settings field, edited only by the user). The new `enumDescriptions` strings frame the three values as **starting-point selections** — "where in the curriculum should the content meet me?" — not as skill scores. The system never modifies this value automatically. This is the load-bearing assumption #3 from the sealed ideation; any code path that would auto-mutate, infer, or score the proficiency value is a compliance violation by the binding escalation trigger above.

---

_Phase 4 of `plan-qor-failsafe-learn-swe-craft.md` originates this determination for FailSafe Learn v2. It supersedes the v1 + v3 determination wholesale — the rejected intent voids the prior compliance frame. This document is non-authoritative legal advice; it records the engineering compliance posture and the boundary the component must not cross._

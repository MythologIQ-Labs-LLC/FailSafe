# FailSafe Learn — Software Development Craft

**Introduced**: v5.2.0 · **Plan**: `docs/plan-qor-failsafe-learn-swe-craft.md` · **Compliance**: `docs/compliance-education-component.md` · **Playbook**: `docs/VIBE_CODER_PLAYBOOK.md`

FailSafe Learn is the **Learn tab** on the Command Center: a small set of short essays on the software-development craft, surfaced contextually as you work. The aim is to close the *user-judgment gap* that pure process governance can't reach — a vibe-coder following the SHIELD steps perfectly still fails if they don't know how to scope or pace.

Learn is **a supporting layer** in FailSafe's governance mission, not a headliner. The product is still AI-assisted governance; Learn is what makes that governance *actionable* for non-traditional builders. The mantra: **Slow down to speed up.**

## What's on the Learn tab

| Surface | Content | Primary or secondary? |
|---|---|---|
| **Essay list** (`roadmap/ui/modules/learn-essay-list.js`) | Five short SWE-craft essays — anchor prefix `learn.essay.` — each at three tier framings. The currently-relevant essay (per the contextual trigger engine) appears first with a "Relevant for what you are doing now" badge. | **Primary** |
| **FailSafe Glossary** (`roadmap/ui/modules/education-glossary.js`) | 12-term glossary of FailSafe / agentic-coding vocabulary. Relocated from the Settings tab in v3; kept as a reference in v2. | Secondary |

## The five essays

1. **Slow down to speed up** — the mantra; scope and pacing as the antidote to AI-assisted churn.
2. **Scope before prompt** — define the smallest useful change before you ask the agent.
3. **Acceptance criteria before code** — what *done* looks like, written down before code exists. Carries the acceptance-criteria template.
4. **Choosing between agent suggestions** — option-evaluation by blast radius, reversibility, dependencies, verifiability. Carries the 6-question table.
5. **Verify before you believe** — agent output is a claim, not proof; the 6-step verification loop.

Content lives in `src/education/lessons-content-swe-essays.ts` + `lessons-content-swe-essays-2.ts` (sibling content modules to `lessons.ts`, following the existing `glossary-content-*.ts` split pattern). The Phase 0 content matrix (`.failsafe/governance/CONTENT_MATRIX_failsafe-learn-swe-craft.md`) is the source of truth for the prose; operator owns final wording at the content-review gate.

## Tier framing (`failsafe.education.proficiency`)

The proficiency setting is a **starting-point selector**, not a skill score. The system never modifies or infers it.

| Setting value | User-facing label | Content stance |
|---|---|---|
| `beginner` | New to code | Assume near-zero engineering knowledge; explain terms directly. |
| `intermediate` | AI builder | Can produce code with an agent; needs judgment around scope, verification, maintainability. |
| `advanced` | Product/PM background | Connects software judgment to product judgment: scope, risk, acceptance criteria, tradeoffs, release confidence. |

The enum values are unchanged from v1 for API stability; only the user-facing `enumDescriptions` strings carry the operator-binding tier labels (see `FailSafe/extension/package.json:278`).

## Contextual surfacing (the trigger engine)

`src/education/lessonTriggers.ts` is a pure-function engine that maps hub state to "which essay is relevant right now":

| Nudge anchor | Fire condition |
|---|---|
| `learn.essay.scope-before-prompt` | File activity exists AND (no active plan OR file activity touches paths no plan-phase artifact covers). The activity gate is mandatory — opening Learn on a passive empty state never produces a badge. |
| `learn.essay.acceptance-criteria` | An active-plan phase has a non-empty description but no verification artifacts. |
| `learn.essay.choose-agent-option` | File activity touches a high-blast-radius path: JS/TS lockfiles (`package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock[b]`), `tsconfig*.json`, bundler configs (`vite`/`webpack`/`rollup`/`esbuild`.config.[jt]s), Python (`requirements*.txt`, `Pipfile[.lock]`, `pyproject.toml`, `poetry.lock`), Rust (`Cargo.{toml,lock}`), Go (`go.{mod,sum}`), VS Code extension manifests (`extension.vsixmanifest`, `*.vsix`), or any `.github/workflows/` path. |
| `learn.essay.verify-output` | ≥ 5 unattributed file changes with no checkpoint after the earliest. |
| `learn.essay.slow-down-to-speed-up` | Session > 25 min with no checkpoint after session-start. |

Mitigations against nudge fatigue (binding):
- **Per-anchor cap** (1 per session) — an anchor surfaces as relevant-now at most once per session. Counts persist in webview `sessionStorage` (`fs-learn-nudge-count:<anchor>`); the cap is enforced cumulatively across hub re-renders, not per-render.
- **Per-session global cap** (2) — at most two nudges total per session, also enforced against cumulative `sessionStorage` counts.
- **Non-modal** — fired anchors carry a "Relevant for what you are doing now" badge on their essay card; they never block work and never overlay the editor.
- **Keyboard-accessible** — essay cards are native `<details>` expanders (Enter/Space).
- **"Mark as read" suppresses only the nudge, not the essay.** The control appears solely on the currently-firing card; clicking it writes `fs-learn-nudge-dismissed:<anchor>` to `sessionStorage`, which suppresses the relevant-now badge for the rest of the session. The essay itself **always remains in the curriculum directory** — the directory is the primary content and is never hidden by a dismiss action. `scope-before-prompt` additionally requires actual file activity to fire, so opening Learn on a passive empty state never produces a stray badge.

**GDPR design contract**: session-duration timing (`fs-learn-session-start`), per-anchor counts, and dismiss flags all live **client-side only** (webview `sessionStorage`, per-webview lifetime). Never transmitted server-side. The v1 governance-moment lessons retain their persistent `localStorage` dismiss flag (`fs-edu-dismissed:<anchor>`); the Learn tab's contextual nudges are session-scoped by design.

## Compliance posture

v2 is static contextual help + a state-aware UI surface — no assessment, no scoring, no learning-outcome evaluation, no access determination, no inferred proficiency. It is therefore **outside** EU AI Act Annex III high-risk education/training classification while strongly supporting the Article 4 AI-literacy goal. See `docs/compliance-education-component.md` for the full determination and the two binding escalation triggers.

## Authoring a new essay

1. Add a `Lesson` literal to `lessons-content-swe-essays.ts` (or `-2.ts`) with anchor prefix `learn.essay.`, all three tier bodies, and operator-reviewed prose.
2. Add the row to the Phase 0 content matrix.
3. Optionally add a new nudge anchor to `lessonTriggers.ts` with a fire condition; cap counts may need rebalancing.
4. The FX598 coherence check (essay-list mount class) and the FX612 SWE-vocab dominance check enforce content discipline automatically.

## v1 + v3 history (superseded)

The v1 Educational Component (sealed META_LEDGER #388) and v3 Guided Dev Cycle (sealed #389) were rejected by the operator on 2026-05-22 — they taught FailSafe vocabulary, not software development. The rebuild plan `docs/plan-qor-failsafe-learn-swe-craft.md` reframed the component from the problem up; this document describes the v2 reality.

The four v1 governance-moment lesson literals (`governance-mode`, `shield.plan`, `shield.audit`, `shield.substantiate`) carry forward in the registry — they power the Settings governance-mode card and the Monitor SHIELD phase tracker (both kept unchanged). They are NOT the Learn-tab's content; the Learn tab is purely the SWE-craft essays + glossary.

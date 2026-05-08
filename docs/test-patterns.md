# Test Patterns

doc_tier: system

Canonical home for test-pattern terms introduced by
`plan-monitor-coherence-and-browser-verification.md` (v5.1.0).

This document is descriptive (not prescriptive policy). It defines the
shared vocabulary used by FailSafe test files so reviewers and future
test authors share an intuition for which guard each spec is providing.

---

## cross-component coherence

A property of a painted UI snapshot. Two or more DOM nodes that derive
their visible state from related domain inputs are coherent if no
combination of their painted values can simultaneously be true and
contradict each other in the operator's mental model.

Example contradictions FailSafe has shipped at least once and now
guards against:

- Monitor `status-line` shows `Connecting...` while `sentinel-orb`
  carries class `monitoring` (green) — implies the WebSocket is both
  not-yet-connected and reporting healthy traffic.
- Marketplace card `status="installed"` while the action button label
  reads `Install` — implies the same item is both installed and
  installable.
- Settings panel governance-mode badge reads `enforce` while a
  `writes-blocked` banner whose copy says writes are blocked is hidden
  — implies enforcement is active and not active.
- Monitor `phase-title` reads `AUDIT` while `phase-track` paints `PLAN`
  with the `active` class — implies the active phase is both AUDIT and
  PLAN.

Coherence is asserted at the painted-DOM layer, not at the data layer.
It is therefore framework-agnostic: any renderer (vanilla, React, Vue,
hand-written innerHTML) is in scope.

## coherence test

A test whose purpose is to detect cross-component coherence violations
before they ship. Coherence tests follow this shape:

1. Load the actual HTML source via JSDOM (no mocking of source).
2. Either rely on the painted defaults or paint a fragment matching
   what the live renderer would emit for a given domain input.
3. Read the painted state from the related DOM nodes (class lists,
   text content, attributes).
4. Run a detector function — defined in the test file, not in the
   shipped code — that returns `{coherent, reason?}`.
5. Add at least one negative case that force-paints the contradiction
   and asserts the detector trips. This proves the detector is not a
   tautology.

Reference implementations in this repo:

- `FailSafe/extension/src/test/roadmap/monitor-state-coherence.test.ts`
- `FailSafe/extension/src/test/roadmap/settings-coherence.test.ts`
- `FailSafe/extension/src/test/roadmap/build-phase-coherence.test.ts`
- `FailSafe/extension/src/test/roadmap/marketplace-coherence.test.ts`

## coherence-via-association (deprecated for new specs)

A weaker pattern that asserts a property of a related-but-not-shipped
component (e.g., `ConnectionClient` (FX171)) and treats the assertion
as standing in for the actual painted code (`WebPanelClient` in
`roadmap.js`). Coherence-via-association tests are kept where they
already exist but are not sufficient evidence of feature correctness;
they must be paired with a direct test of the painted module.

The plan-monitor-coherence-and-browser-verification.md cycle replaces
the `roadmap.js` coherence-via-association entry with the direct
`roadmap-connection.test.ts` suite. Future plans should follow the
same migration when an association-only entry is observed.

## ConsoleServer boot fixture (deferred to Phase 2)

A test helper that stands up a real `ConsoleServer` instance, attaches
its private `app: Application` and `wsManager: WebSocketManager` to a
harness `http.createServer`, listens on `127.0.0.1:0`, and returns a
controller that lets a test inject hub fixtures, verdict fixtures,
catalog fixtures, and broadcast WS messages. It is the Playwright-side
equivalent of the unit-test pattern in
`FailSafe/extension/src/test/consoleServer.test.ts:16-29`.

The Phase 2 implementation will live at
`FailSafe/extension/src/test/ui/helpers/serveConsoleServerUI.ts`.
This document will be updated when that file lands.

## browser verification artifact (deferred to Phase 2)

A signed evidence file at `.failsafe/governance/BROWSER_VERIFICATION.md`
that records, per release: which Playwright specs ran clean, which
pages were verified by operator-recorded screenshots (with a stated
reason Playwright could not reach them), and an operator sign-off line.
The artifact is one of the five conditions for lifting `PUBLISH_BLOCK`.
This term is finalised in Phase 2 of the same plan.

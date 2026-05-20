# Plan: B-B199-1 — Brainstorm behavioral E2E

**change_class**: feature

**doc_tier**: standard

**terms_introduced**: (none — new test file only)

**boundaries**:
- limitations:
  - Tests target the BrainstormRenderer SHELL surface (toolbar buttons, view toggles, layout switches, graph-fetch). Voice-input live behavior, 3D canvas rendering, AI Engine status panel, prep-bay LLM streaming, and history-replay are deferred — voice + live behavior are B-B199-3 territory; 3D WebGL canvas content is impractical to E2E without a full graphics stack.
  - Tests use `page.route()` to intercept `/api/v1/brainstorm/graph` (the cold-load fetch). Side effects of UNDO/REDO/EXPORT click (which call into `graph.undo()` / `exportJSON()`) are verified at the renderer-instance level via `window.__failsafeRenderers` (B-B199-2 Phase 0 hook); the actual graph mutation logic is covered by existing mocha tests for `brainstorm-graph.ts`.
  - No voice / Whisper / Piper / multilingual coverage in this cluster (B-B199-3).
- non_goals:
  - Adding new brainstorm features.
  - Canvas rendering E2E (3D WebGL; unstable across CI environments).
  - Voice-input lifecycle E2E.
- exclusions:
  - B-B199-3 voice substrate live behavior.

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX539 | NEW | `FailSafe/extension/src/test/ui/brainstorm-tab.spec.ts` | BrainstormRenderer behavioral E2E: shell renders (toolbar + 4 layout/view buttons + 4 action buttons + canvas container), graph endpoint fetched, layout/view toggle active states, UNDO/REDO/EXPORT/RESET click dispatch verified via window.__failsafeRenderers, empty graph state renders without error |

## Open Questions

(All resolved during plan authoring.)

1. **3D canvas content**: not testable without a WebGL stack. Test the container element renders; defer content assertions.
2. **Voice surface**: explicitly out of scope. B-B199-3 covers voice live behavior separately.
3. **UNDO/REDO/EXPORT click verification**: rather than spying on the graph instance directly, use the existing `window.__failsafeRenderers.workspace` TabGroup wrapper to access `BrainstormRenderer.graph` and inspect its state changes. For EXPORT specifically: `exportJSON()` calls `URL.createObjectURL` + triggers download — capture the click event reaching the handler is sufficient evidence; the download itself depends on browser policy not testable in Playwright without `page.on('download')`.
4. **RESET confirmation**: brainstorm.js:175-176 likely shows a `confirm()` modal; verify via `page.on('dialog')` interception.

## Phase 1: Brainstorm-tab Playwright spec (FX539)

### Affected Files

- `FailSafe/extension/src/test/ui/brainstorm-tab.spec.ts` — NEW. Navigates to Workspace tab → Mindmap sub-pill; mocks `/api/v1/brainstorm/graph`; asserts shell DOM + interactive button behavior.

### Changes

Spec structure (10 cases):

1. **FX539.1 — Shell renders core elements**: navigate; assert `.cc-bs-layout[data-layout="FORCE"]`, `.cc-bs-layout[data-layout="TREE"]`, `.cc-bs-layout[data-layout="CIRCLE"]`, `.cc-bs-view[data-view="2D"]`, `.cc-bs-view[data-view="3D"]`, `.cc-bs-undo`, `.cc-bs-redo`, `.cc-bs-export`, `.cc-bs-clear`, `.cc-brainstorm-canvas` all present.
2. **FX539.2 — Graph endpoint fetched on render**: count `**/api/v1/brainstorm/graph` calls; assert >= 1 after navigation.
3. **FX539.3 — 2D view active by default**: assert `.cc-bs-view[data-view="2D"]` has `.active` class on initial render; `.cc-bs-view[data-view="3D"]` does NOT.
4. **FX539.4 — Click 3D view toggle activates it + deactivates 2D**: click `.cc-bs-view[data-view="3D"]`; assert `.active` moves to 3D.
5. **FX539.5 — Click TREE layout sets border-color (active indicator)**: click `.cc-bs-layout[data-layout="TREE"]`; assert it has non-empty `border-color` style attribute (brainstorm.js:184 sets it on click).
6. **FX539.6 — Click UNDO does not throw**: spy `window.__failsafeRenderers.workspace.subViews.find(s => s.key === 'brainstorm').renderer.graph.undo` call count; click button; assert spy was called once.
7. **FX539.7 — Click REDO does not throw**: same pattern, verify graph.redo invoked.
8. **FX539.8 — Click EXPORT triggers exportJSON path**: spy graph.exportJSON; click; assert invoked.
9. **FX539.9 — RESET button click triggers confirm dialog**: `page.on('dialog')` accepts → graph.clear called; OR dismiss → graph.clear NOT called.
10. **FX539.10 — Empty graph (no nodes) renders shell without error**: graph endpoint returns `{nodes:[],edges:[]}`; shell still renders; canvas container present.

## Phase 2: BACKLOG amendment

### Affected Files

- `docs/BACKLOG.md` — mark B-B199-1 as `[x]` closed with provenance + clarification that voice-input + canvas-content E2E remain deferred to B-B199-3 (voice) and future canvas-rendering work.

## CI Commands

- `cd FailSafe/extension && npm run compile` — TypeScript builds without errors
- `cd FailSafe/extension && npx playwright test src/test/ui/brainstorm-tab.spec.ts` — spec green (target: 10 passing)
- `cd FailSafe/extension && npm run test:ui` — full Playwright suite green (94 existing + 10 new = 104 passing)

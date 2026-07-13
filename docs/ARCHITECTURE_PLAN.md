# FailSafe Architecture Baseline

**Last Updated:** 2026-07-13
**Current Release:** v5.9.0
**Active Branch:** `feat/qor-consumer-stabilization-232` (local Review Boundary)
**Risk Grade:** L2

## System Purpose

FailSafe is a VS Code/Cursor governance extension. It observes agent and workspace activity, evaluates policy and trust, records governed evidence, and presents that state through the Command Center without replacing required human oversight.

## Runtime Boundaries

```text
VS Code extension host
  src/extension/main.ts
    bootstrap modules
      governance + Qor-logic + Sentinel + integrations
    ConsoleServer
      localhost-only HTTP/WebSocket boundary
      route installers
      HubSnapshotService
        WorkspaceArtifactBuilder
        Qor consumer adapter
        checkpoint / risk / transparency sources

Command Center browser surface
  command-center.js
    tab renderers
    BrainstormRenderer
      BrainstormGraph + BrainstormCanvas
      VoiceController
        SttEngine + TtsEngine
```

## Governing Contracts

### Extension host

- `src/extension/main.ts` is the activation entry point and composes bootstrap modules.
- `ConsoleServer` exposes loopback-only routes and broadcasts; route modules reject remote callers before work.
- Route installers are composition seams. Large route families delegate to cohesive modules while retaining their public setup functions.

### Hub snapshot

- `HubSnapshotService.buildHubSnapshot()` is the served `/api/hub` entry point.
- `WorkspaceArtifactBuilder` reads governed artifacts and the Qor consumer adapter classifies supported, degraded, malformed, stale, and unsupported inputs.
- `hub-payload-assembler.ts` performs value-oriented payload composition and ledger/live coalescing.
- Qor consumer diagnostics, workspace identity, checkpoint summaries, risks, and governance phase remain explicit payload fields.

### Brainstorm and Mind Map

- `setupBrainstormRoutes()` composes transcript, graph, pending-transcript, and audio-vault route modules.
- `BrainstormGraph` owns nodes, edges, undo, and persisted graph data.
- `BrainstormCanvas` owns rendering, layout, fit/reset, resize, and cyclic-layout fallback.
- Presentation preferences are stored outside graph data under a key derived from `hub.workspacePath`; repositories cannot share layout or view-mode state.

### Voice lifecycle

- `voice-session-state.js` is the pure controller-state model.
- `VoiceController` serializes start, stop, PTT, wake, and model-swap transitions and exposes active booleans as selectors.
- UI terminal state is published only after awaited engine transitions complete.
- `SttEngine` uses a lifecycle generation to dispose late `getUserMedia()` results after destruction, before recorder or audio-context allocation.
- Voice-pack progress remains incremental; completion refetches the authoritative status endpoint and non-2xx actions render retryable errors.

### Governance documents

- `docs/META_LEDGER.md` is append-only, Merkle-linked evidence.
- `docs/FEATURE_INDEX.md` maps user-visible and platform contracts to source and tests.
- `docs/SYSTEM_STATE.md`, `docs/BACKLOG.md`, and this file are living Tier-1 surfaces.
- `.qor/gates/<session>/` contains structured phase artifacts; the current local cycle is held from release by the Review Boundary.

## Build and Verification Path

1. TypeScript compiles from `src/` to `out/`; UI JavaScript modules are mirrored by `scripts/copy-ui-js.cjs`.
2. `vscode-test` executes the extension-host census from `out/test/**/*.test.js` under the pinned VS Code 1.122.1 host.
3. Playwright exercises real Chromium Command Center surfaces.
4. Binding Razor checks enforce 250 physical lines per touched file, 40 effective lines per function, nesting depth three, and no nested ternaries.
5. Documentation, whitespace, intent-lock, gate, and Merkle checks complete substantiation.

## Physical Isolation

- The open-source extension repository is the only implementation scope for this cycle.
- `PRIVATE/` and `FailSafe-Pro/` are confidential and excluded.
- Marketplace publication, deployment, release tagging, remote branch mutation, and issue closure require explicit operator authorization after review.

## Current Stabilization Delta

The active remediation decomposes the hub and Brainstorm route seams, repairs truthful voice and voice-pack terminal states, scopes Mind Map preferences by workspace, makes drift tests independent of process cwd, and restores a compilable bounded complexity heuristic. Public route paths and hub payload keys remain stable.

# FailSafe Architecture Baseline

**Last Updated:** 2026-11-20 (published-release source reconciliation; native governance review pending).
**Current Release:** v6.0.13 (published 2026-11-13; see [System State](SYSTEM_STATE.md)).
**Development Track:** v6.1.0 in progress under [#679](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/679); not published.
**Design Authority:** [Architecture Index](../ARCHITECTURE_INDEX.md) owns domain/document authority; [Governance Index](GOVERNANCE_INDEX.md) owns governance artifacts.
**Qualification Boundary:** This document reports source and release evidence, not a new `/qor-audit` verdict, substantiation seal or owner release decision.

## Published v6.0.13 boundaries and v6.1.0 direction

- **Host and presentation:** `FailSafe/extension/src/extension/main.ts` composes the extension host; the loopback ConsoleServer serves the Command Center. Console status and policy claims must name their evidence and freshness, not imply that observing an editor action prevented it ([#505](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/505)).
- **Governance authority:** Frozen Qor-logic v0.176.1 and existing FailSafe Sentinel, SHIELD, decision and ledger boundaries remain independent. Qortara Logic's read-only native status pilot is proposed for v6.1.0 ([#668](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/668)); no Qor skill is retired without per-skill installed-host parity and owner acceptance.
- **Native packaging:** v6.0.13 published eight platform-targeted VSIX packages with native SQLite binaries, plus versioned release-notes PDF and SHA256SUMS. Package identity is distinct from installed-host read/write/restart acceptance ([#502](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/502), [#616](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/616)).
- **G4 release witness:** v6.0.13 has the recorded `g4-000001` checkpoint, owner-held trust anchor and RFC 3161 timestamp. This does not erase historical ledger gaps or qualify failure-atomic future rotation/recovery ([G4 operations](releases/G4_WITNESS_OPERATIONS.md), [#660](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/660)).
- **Integration claims:** Statewright ships as an operator-initiated browser handoff to the provider's Run History, not a connected workflow reader or enforcement adapter. Bicameral's legacy integration is frozen pending native current-upstream qualification ([integration portfolio](architecture/INTEGRATION_PORTFOLIO.md)).
- **Not yet shipped:** Voice Pack publisher authentication, real release-backed Piper/Whisper installation and optional-vendor isolation changes are v6.1.0 draft work ([#707](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/707), [#710](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/710), [#732](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/732)). Passing candidate CI is not installed-user proof.
- **Toolchain:** Release and PR CI use Node 22; both repository `.nvmrc` files still pin Node 20.18.1, an unresolved local-toolchain policy mismatch ([#592](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/592)).

The sections below retain established runtime seams and historical stabilization design. For current feature claims, consult [Feature Index](FEATURE_INDEX.md) and the independently qualified evidence linked above.

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

### Governed agent CLI runs (Continue, Aider)

**Current safety boundary:** Continue and Aider execution is disabled in the released path pending OS-enforced containment ([#475](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/475)). The following is the retained isolated-worktree implementation design, **not** proof that those commands launch agents or prevent outside writes.

- `src/integrations/agent-cli/isolated-run.ts` runs the agent in a disposable git worktree; nothing it writes through its working directory reaches the workspace except through `agent-run-promotion.ts`, called from the same command invocation after the operator chooses Apply.
- Every FailSafe git call goes through `git-safety.ts` (system and global config neutralized, hooks / fsmonitor / excludes / attributes disabled, carried EOL / safe.directory / LFS settings).
- `workspace-snapshot.ts` compares the repository before and after the run (content-based for tracked files); any difference is `WORKSPACE_CHANGED_DURING_RUN` and nothing is promotable. `process-tree.ts` kills everything the agent started before that comparison.
- A worktree is not a process sandbox: writes outside the repository, inside ignored directories, or by processes that left the tree are not detected, and every surface says so.
### Sentry import

- `src/integrations/sentry/sentry-transport.ts` carries every Sentry request: it refuses URLs outside the configured HTTPS base, waits on the documented rate-limit headers and bounds retries.
- `sentry-import.ts` runs list -> parse/dedupe -> issue-detail release lookups -> write. Each record is merged and written through `RiskRegisterManager.upsertRiskWith`, one synchronous read-merge-write, so in-process writers such as the Console risk routes are never overwritten by stale data.
- `sentry-report.ts` turns the outcome into the operator message by a fixed precedence.
- Known residual #517: `RiskManager` rewrites the same `risks.json` from a stale in-memory copy.

### Governance documents

- `docs/META_LEDGER.md` is append-only, Merkle-linked evidence.
- `docs/FEATURE_INDEX.md` maps user-visible and platform contracts to source and tests.
- `docs/SYSTEM_STATE.md`, `docs/BACKLOG.md`, and this file are living Tier-1 surfaces.
- `.qor/gates/<session>/` contains native Qor phase artifacts. A proposal, README change or passing GitHub check cannot substitute for source-bound native plan, audit and substantiation receipts.

## Build and Verification Path

1. TypeScript compiles from `src/` to `out/`; UI JavaScript modules are mirrored by `scripts/copy-ui-js.cjs`.
2. `vscode-test` executes the extension-host census from `out/test/**/*.test.js` under the pinned VS Code 1.122.1 host.
3. Playwright exercises real Chromium Command Center surfaces.
4. Binding Razor checks enforce 250 physical lines per touched file, 40 effective lines per function, nesting depth three, and no nested ternaries.
5. Documentation, whitespace, intent-lock, gate, and Merkle checks complete substantiation.

## Physical Isolation

- The open-source extension repository is the implementation boundary described by this baseline; source-only inspection is not proof of OS sandbox containment.
- `PRIVATE/` and `FailSafe-Pro/` are confidential and excluded.
- Marketplace publication, deployment, release tagging, remote branch mutation, and issue closure require explicit operator authorization after review.

## Historical v5.9.0 Stabilization Delta (2026-07-13)

**Historical only:** the former active branch was `feat/qor-consumer-stabilization-232`, with an L2 review boundary. That July activity is not the current release, governance status or v6.1.0 plan.

The then-active remediation decomposes the hub and Brainstorm route seams, repairs truthful voice and voice-pack terminal states, scopes Mind Map preferences by workspace, makes drift tests independent of process cwd, and restores a compilable bounded complexity heuristic. Public route paths and hub payload keys remain stable.

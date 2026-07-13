# Plan: Consumer Stabilization VETO Remediation

**change_class**: hotfix

**doc_tier**: standard

**terms_introduced**: none

**high_risk_target**: false

**required_gate_artifacts**: plan, audit, implement, substantiate

**originating_remediation**: 2026-07-13 final review VETO for branch feat/qor-consumer-stabilization-232

**boundaries**:
- limitations: [Repairs only the reviewed staged branch; preserves public route and hub payload contracts]
- non_goals: [No new product capability, no release or marketplace work, no unrelated backlog cleanup]
- exclusions: [Historical gate directories, unrelated Claude skill-sync edits, remote git operations]

## Open Questions

None. The operator requested an autonomous cycle and the reviewed evidence fixes the scope.

## Locked Decisions and Grounding Evidence

1. **No Section 4 exceptions.** Every production or test file changed by this remediation must finish at no more than 250 physical lines; every function must finish at no more than 40 effective lines; nesting remains at most 3; nested ternaries are prohibited. Grounded 2026-07-13 via the binding ESLint command: `setupBrainstormRoutes` = 200 lines, `assembleHubPayload` = 51 lines, and `HubSnapshotService.ts` = 269 effective lines. Index evidence: `git show :FailSafe/extension/src/roadmap/ui/modules/brainstorm-voice-wiring.js | rg -n "const ttsState"` -> `43: const ttsState = v.tts?.tts ? 'ready' : (ttsErrorSeen ? 'error' : 'unknown');`.
2. **Preserve public composition seams.** `HubSnapshotService.buildHubSnapshot()` and `setupBrainstormRoutes(app, deps)` remain the external entry points. Grep evidence: `rg -n "buildHubSnapshot\(|setupBrainstormRoutes\(" FailSafe/extension/src` shows callers in `ConsoleRouteRegistrar.ts`, `ConsoleLifecycleService.ts`, route tests, and tracker tests.
3. **Derive voice UI state from completed engine transitions.** A pure transition value owns controller phase and recording mode; booleans become selectors. Stop UI is emitted only after the engine reaches idle. Index evidence: `git show :FailSafe/extension/src/roadmap/ui/modules/voice-controller.js | rg -n "voiceActive = false|pttActive = true|await this.stt.stopListening"` -> lines 129 then 133 clear before await, and line 144 sets PTT before acquisition resolves.
4. **Cancel late media acquisition by generation, not browser cancellation.** `getUserMedia()` is not assumed abortable. `SttEngine` captures a lifecycle generation before awaiting, and a stale result immediately stops its tracks without creating audio resources. Index evidence: `git show :FailSafe/extension/src/roadmap/ui/modules/stt-engine.js | rg -n "getUserMedia|AudioContext"` -> line 157 awaits capture and line 158 immediately allocates the audio context without a destroyed check.
5. **Use the existing hub workspace identity.** View-preference APIs accept `workspacePath`; `BrainstormRenderer.render(hubData)` provides it to graph and toolbar callers. Index evidence: `git show :FailSafe/extension/src/roadmap/services/HubSnapshotService.ts | rg -n "workspaceName|workspacePath"` -> lines 259-260 emit both fields; `git show :FailSafe/extension/src/roadmap/ui/command-center.js | rg -n "Object.values\(renderers\)"` -> line 90 fans hub data to renderers; `git show :FailSafe/extension/src/roadmap/ui/modules/tab-group.js | rg -n "renderer.render\(hubData\)"` -> line 90 passes it to the active renderer.
6. **Completion refreshes authoritative status.** `voicePack.install.complete` triggers the existing status-fetch renderer path; progress and errors remain incremental. Every POST checks `response.ok`. Index evidence: `git show :FailSafe/extension/src/roadmap/ui/modules/settings.js | rg -n "voicePack.install.progress|voicePack.install.error|voicePack.install.complete"` -> lines 184 and 187 contain progress/error but no completion; `git show :FailSafe/extension/src/roadmap/ui/modules/voice-pack-settings-card.js | rg -n "await fetch|async postAction"` -> lines 86 and 182 await POST responses without status checks.
7. **Keep the shipped Pro download route.** Current docs are reconciled to `https://mythologiq.studio/products/failsafe-download`. Live verification on 2026-07-13 returned HTTP 200 for both candidates, while the deployed application bundle contained `products/failsafe-download` once and `failsafe-pro/download` zero times.

## Phase 1: Remove Section 4 Debt Without Contract Drift

### Affected Files

- `FailSafe/extension/src/test/roadmap/hub-payload-assembler.test.ts` - invoke the extracted assembler and assert consumer diagnostics and existing hub fields survive unchanged.
- `FailSafe/extension/src/test/roadmap/install-skills-card.test.ts` - retain core rendering and install-action behavior below 250 lines.
- `FailSafe/extension/src/test/roadmap/install-skills-card-status.test.ts` - receive version-floor and Show Output behavior tests split from the oversized suite.
- `FailSafe/extension/src/test/extension/voice-pack-install.test.ts` - retain install success/failure behavior below 250 lines.
- `FailSafe/extension/src/test/extension/voice-pack-install-guards.test.ts` - receive URL, redirect, uninstall, and spawn-boundary guard behavior.
- `FailSafe/extension/src/test/extension/voice-pack-install-test-helpers.ts` - hold shared HTTP/spawn fixtures below 250 lines.
- `FailSafe/extension/src/roadmap/services/hub-payload-assembler.ts` - own pure payload construction and verdict/completion coalescing.
- `FailSafe/extension/src/roadmap/services/hub-revert-deps.ts` - construct revert dependencies outside the hub service.
- `FailSafe/extension/src/roadmap/services/HubSnapshotService.ts` - delegate payload and revert construction; finish below 250 lines.
- `FailSafe/extension/src/roadmap/routes/brainstorm-transcript-routes.ts` - register transcript and audio-processing routes through short named handlers.
- `FailSafe/extension/src/roadmap/routes/brainstorm-graph-routes.ts` - register graph CRUD and seed routes through short named handlers.
- `FailSafe/extension/src/roadmap/routes/brainstorm-pending-routes.ts` - register pending-transcript and audio-vault routes through short named handlers.
- `FailSafe/extension/src/roadmap/routes/BrainstormRoute.ts` - remain a sub-40-line composition entry point.
- `FailSafe/extension/src/roadmap/ui/modules/brainstorm-voice-wiring.js` - replace the nested ternary with an explicit capability-state helper.

### Changes

- Move behavior without changing response status codes, broadcast order, payload keys, checkpoint behavior, or route paths.
- Keep each extracted module cohesive and value-oriented; route installers compose independent named handlers.
- Split oversized tests by behavior, sharing fixtures instead of duplicating setup.
- Run the binding Section 4 rules against every file changed in this phase.

### Unit Tests

- `hub-payload-assembler.test.ts` invokes the assembler with supported and degraded consumer diagnostics and compares returned field values.
- Existing Brainstorm route suites invoke `setupBrainstormRoutes` and retain all success, rejection, mutation, and broadcast assertions.
- Split install suites invoke their renderers/handlers and preserve every current behavioral assertion.

## Phase 2: Repair Voice and Workspace State Semantics

### Affected Files

- `FailSafe/extension/src/test/roadmap/voice-controller-transitions.test.ts` - assert start and stop UI/state at both sides of awaited transitions.
- `FailSafe/extension/src/test/roadmap/voice-controller-wake-destroy.test.ts` - assert auto-stop sequencing and controller destruction behavior.
- `FailSafe/extension/src/test/roadmap/stt-engine-destroy.test.ts` - resolve a real deferred media mock after destroy and assert tracks stop with no recorder or AudioContext allocation.
- `FailSafe/extension/src/test/roadmap/stt-silence-timer.test.ts` - assert rejection is handled and auto-stop publishes only after idle.
- `FailSafe/extension/src/test/roadmap/voice-pack-settings-completion.test.ts` - assert completion refetches installed status and non-2xx actions render an error.
- `FailSafe/extension/src/test/roadmap/brainstorm-view-prefs.test.ts` - assert two workspace paths round-trip independently and corrupt data degrades per key.
- `FailSafe/extension/src/test/roadmap/brainstorm-toolbar-wiring.test.ts` - assert toolbar reads and writes the active workspace key.
- `FailSafe/extension/src/test/ui/brainstorm-viewport.spec.ts` - assert Chromium persistence reads the active workspace-scoped preference key across reload.
- `FailSafe/extension/src/test/ui/bicameral-advanced-tools.spec.ts` - make the browser fixture wait for a successful configured-state probe before refreshing and exercising Connect under parallel load.
- `FailSafe/extension/src/roadmap/ui/modules/voice-session-state.js` - provide pure transition reduction and active-state selectors.
- `FailSafe/extension/src/roadmap/ui/modules/voice-controller.js` - serialize transitions and update session state only after awaited engine outcomes.
- `FailSafe/extension/src/roadmap/ui/modules/voice-controller-support.js` - remove direct boolean mutation from auto-stop settings behavior.
- `FailSafe/extension/src/roadmap/ui/modules/stt-engine.js` - add lifecycle generation, late-stream disposal, unconditional resource release, and handled auto-stop.
- `FailSafe/extension/src/roadmap/ui/modules/settings.js` - route completion to an authoritative voice-pack status refresh.
- `FailSafe/extension/src/roadmap/ui/modules/voice-pack-settings-card.js` - expose completion refresh and reject non-2xx action responses.
- `FailSafe/extension/src/roadmap/ui/modules/brainstorm-graph-io.js` - derive a deterministic preference key from workspace path.
- `FailSafe/extension/src/roadmap/ui/modules/brainstorm-toolbar-wiring.js` - pass workspace identity to preference reads and writes.
- `FailSafe/extension/src/roadmap/ui/modules/brainstorm.js` - capture `hubData.workspacePath` before graph/canvas initialization.

### Changes

- Model `idle`, `requesting_permission`, `listening`, `stopping`, `processing`, `unavailable`, and `destroyed` explicitly.
- Derive `voiceActive` and `pttActive` from state plus recording mode; never publish recording/idle early.
- Increment the STT lifecycle generation on destroy and dispose late streams before any secondary allocation.
- Forward completion into a status refetch and treat every HTTP failure as a terminal visible error.
- Store view preferences under `failsafe-brainstorm-view:<encoded workspacePath>`; an absent path uses a documented local fallback only in isolated tests.

### Unit Tests

- Deferred start/stop tests prove state and UI remain truthful while promises are unresolved.
- Late media resolution proves destruction cannot resurrect or leak capture resources.
- Completion and HTTP-failure tests prove the settings card leaves progress and exposes terminal errors.
- Workspace A/B tests prove layout and view mode never cross-contaminate.
- The viewport browser test derives the persisted key from the live renderer workspace identity and proves reload restores the selected layout and view.

## Phase 3: Restore Truthful Gates and Governance Surfaces

### Affected Files

- `FailSafe/extension/src/test/roadmap/tracker/test-repo-root.ts` - locate the repository root by bounded marker walk from `__dirname`, independent of process cwd.
- `FailSafe/extension/src/test/roadmap/tracker/test-repo-root.test.ts` - invoke the resolver against temporary nested trees and assert success and bounded failure.
- `FailSafe/extension/src/test/roadmap/tracker/governance-projection.test.ts` - consume the shared root resolver.
- `FailSafe/extension/src/test/roadmap/tracker/feature-index-surface.test.ts` - consume the shared root resolver.
- `FailSafe/extension/src/test/sentinel/DefaultPatterns.test.ts` - compile and execute `CMP001_HEURISTIC` against deep and shallow brace samples.
- `FailSafe/extension/src/sentinel/patterns/heuristics.ts` - replace the malformed expression with a balanced, bounded, non-ReDoS pattern.
- `docs/ARCHITECTURE_PLAN.md` - replace the stale v4.9.3 hotfix plan with the current extension topology and lifecycle boundaries.
- `docs/SYSTEM_STATE.md` - correct the Pro URL and record the remediated branch state.
- `docs/ROADMAP.md` - correct the Pro download URL.
- `docs/v5/FAILSAFE_V5_EXTENSION_UPDATE_PLAN.md` - mark the superseded URL assumption and cite the canonical route without rewriting historical outcomes.
- `docs/BACKLOG.md` - close B205, B206, and B208 only after their acceptance conditions pass.
- `docs/FEATURE_INDEX.md` - update FX201, FX204, FX205, FX347, FX348, FX415, FX493, FX893, FX896, FX897, and FX898 evidence.
- `docs/GOVERNANCE_INDEX.md` - register the current plan and refreshed architecture surface.
- `docs/META_LEDGER.md` - append governed audit/implementation/substantiation evidence with clean whitespace.

### Changes

- Remove all test dependence on VS Code's process cwd while retaining real-repository drift checks.
- Make the default complexity heuristic compile silently and detect five nested brace openings without catastrophic pattern shape.
- Reconcile current architecture and URL documentation; preserve historical context explicitly.
- Ensure `git diff --cached --check` is clean and current gate artifacts point at this plan.

### Unit Tests

- Root-resolver tests change process cwd and still locate both real drift-guard targets.
- Pattern tests invoke `PatternLoader.compilePattern`, assert a non-null regex, match deep nesting, and reject shallow nesting.
- The complete VS Code census executes 422/422 or the newly increased total with zero missing and zero failing.

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX201 | MODIFIED | `src/test/roadmap/voice-controller-transitions.test.ts` | Deferred PTT start and stop expose active state only after successful engine transitions. |
| FX204 | MODIFIED | `src/test/roadmap/brainstorm-view-prefs.test.ts` | Layout persisted for workspace A does not change workspace B. |
| FX205 | MODIFIED | `src/test/roadmap/brainstorm-view-prefs.test.ts` | View mode persisted for workspace A does not change workspace B. |
| FX347 | MODIFIED | `src/test/sentinel/DefaultPatterns.test.ts` | PatternLoader compiles the default complexity pattern without an error. |
| FX348 | MODIFIED | `src/test/sentinel/DefaultPatterns.test.ts` | The compiled complexity heuristic matches deep braces and ignores shallow braces. |
| FX493 | MODIFIED | `src/test/roadmap/voice-pack-settings-completion.test.ts` | Completion refetches installed state and failed HTTP actions render a retryable error. |
| FX893 | MODIFIED | `src/test/roadmap/hub-payload-assembler.test.ts` | Extracted payload assembly preserves Qor consumer diagnostics at the served boundary. |
| FX896 | MODIFIED | `src/test/roadmap/voice-controller-transitions.test.ts` | Controller state remains truthful before, during, and after each awaited transition. |
| FX897 | MODIFIED | `src/test/roadmap/brainstorm-view-prefs.test.ts` | View preferences round-trip under distinct workspace-derived keys. |
| FX898 | MODIFIED | `src/test/roadmap/voice-pack-settings-completion.test.ts` | Voice-pack progress reaches an authoritative installed or visible error terminal state. |

## Definition of Done

### Deliverable: Section 4 clean decomposition

- **D1**: Reviewed behavior remains unchanged while all touched files and functions satisfy the Razor.
- **D2**: Hub and Brainstorm public entry points delegate to cohesive modules; split tests retain behavior coverage.
- **D3**: B205 and B206 close only with recorded Razor command output.
- **D4**: Binding ESLint rules report zero max-lines, max-lines-per-function, max-depth, or nested-ternary errors across touched files.

### Deliverable: Truthful voice lifecycle

- **D1**: UI and controller state describe completed engine reality, including failure and destruction.
- **D2**: Pure session state plus lifecycle generation prevents premature state and late media resurrection.
- **D3**: FX201 and FX896 evidence names the new transition and destruction tests.
- **D4**: Voice transition, silence, and destroy suites pass deferred-promise and resource-disposal assertions.

### Deliverable: Terminal voice-pack and isolated workspace preferences

- **D1**: Long-running install UI always terminates visibly; workspace presentation state never crosses repositories.
- **D2**: Completion refetch, HTTP checks, and workspace-derived preference keys are wired through existing seams.
- **D3**: FX204, FX205, FX493, FX897, and FX898 evidence reflects observed behavior.
- **D4**: Completion/error and workspace A/B tests pass, followed by the affected Playwright surfaces.

### Deliverable: Truthful release boundary

- **D1**: Full census, runtime heuristic, architecture, and canonical URL agree with repository reality.
- **D2**: Drift guards are cwd-independent and the default heuristic compiles and executes.
- **D3**: Current plan/audit/implement/substantiate artifacts and ledger evidence replace stale branch claims.
- **D4**: Full VS Code census and Playwright suite pass with zero failures; ledger and diff checks pass.

## CI Commands

- `npm run compile` - compile TypeScript and copy UI modules.
- `npm run lint` - run the repository TypeScript lint contract.
- `npx eslint --env browser src/roadmap/services/HubSnapshotService.ts src/roadmap/services/hub-payload-assembler.ts src/roadmap/services/hub-revert-deps.ts src/roadmap/routes/BrainstormRoute.ts src/roadmap/routes/brainstorm-transcript-routes.ts src/roadmap/routes/brainstorm-graph-routes.ts src/roadmap/routes/brainstorm-pending-routes.ts src/roadmap/ui/modules/brainstorm-voice-wiring.js src/roadmap/ui/modules/voice-session-state.js src/roadmap/ui/modules/voice-controller.js src/roadmap/ui/modules/voice-controller-support.js src/roadmap/ui/modules/stt-engine.js src/roadmap/ui/modules/settings.js src/roadmap/ui/modules/voice-pack-settings-card.js src/roadmap/ui/modules/brainstorm-graph-io.js src/roadmap/ui/modules/brainstorm-toolbar-wiring.js src/roadmap/ui/modules/brainstorm.js src/sentinel/patterns/heuristics.ts src/test/roadmap/hub-payload-assembler.test.ts src/test/roadmap/install-skills-card.test.ts src/test/roadmap/install-skills-card-status.test.ts src/test/extension/voice-pack-install.test.ts src/test/extension/voice-pack-install-guards.test.ts src/test/extension/voice-pack-install-test-helpers.ts src/test/roadmap/voice-controller-transitions.test.ts src/test/roadmap/voice-controller-wake-destroy.test.ts src/test/roadmap/stt-engine-destroy.test.ts src/test/roadmap/stt-silence-timer.test.ts src/test/roadmap/voice-pack-settings-completion.test.ts src/test/roadmap/brainstorm-view-prefs.test.ts src/test/roadmap/brainstorm-toolbar-wiring.test.ts src/test/roadmap/tracker/test-repo-root.ts src/test/roadmap/tracker/test-repo-root.test.ts src/test/roadmap/tracker/governance-projection.test.ts src/test/roadmap/tracker/feature-index-surface.test.ts src/test/sentinel/DefaultPatterns.test.ts src/test/ui/brainstorm-viewport.spec.ts src/test/ui/bicameral-advanced-tools.spec.ts --rule "max-lines:[2,{max:250}]" --rule "max-lines-per-function:[2,{max:40,skipBlankLines:true,skipComments:true}]" --rule "max-depth:[2,3]" --rule "no-nested-ternary:2"` - enforce physical file length plus effective function/depth/ternary limits on the complete affected production and test set.
- `npx vscode-test --config .vscode-test.mjs --reporter dot` - run the complete extension-host census with zero missing and zero failing tests.
- `npm run test:ui` - run the complete Playwright suite for affected Command Center surfaces and blast radius.
- `npm run docs:validate` - validate documentation coherence.
- `git diff --cached --check` - reject staged whitespace defects.
- `qor-logic verify-ledger --ledger docs/META_LEDGER.md --post-anchor --tolerate-known-grandfathered` - verify the post-anchor Merkle chain.

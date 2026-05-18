# Plan: Bicameral MCP Integration + Integrations Tab

**Plan slug**: `plan-qor-bicameral-mcp-integration`
**Target version**: v5.2.0 (no in-cycle version bump; bump deferred to release runbook)
**Change class**: `feature`
**Risk grade**: L2 (new external integration; net-new UI surface; no L3 governance bypass)
**doc_tier**: standard
**high_risk_target**: false
**Research input**: `.failsafe/governance/RESEARCH_BRIEF_bicameral-mcp-integration.md` (this session)
**Review boundary**: stage artifacts only (no push / PR / merge / tag / publish)
**Closes**: foundation for future `/qor-research`-style integrations of additional MCP servers; advances issue #65 work pattern (does not close #65)
**Upstream dependency**: `BicameralAI/bicameral-mcp` `>=0.14, <0.16` — Beta classifier; schema evolution past 0.16 needs re-research

---

## terms_introduced

- **term**: BicameralMcpClient
  **home**: `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts`
- **term**: IntegrationsTab
  **home**: `FailSafe/extension/src/roadmap/ui/modules/integrations.js`
- **term**: McpClientHost
  **home**: `FailSafe/extension/src/integrations/McpClientHost.ts`
- **term**: BicameralDecision
  **home**: `FailSafe/extension/src/integrations/bicameral/types.ts`

## boundaries

- **limitations**:
  - v1 surfaces 4 of 13 Bicameral tools at the data-feed layer (`history`, `preflight`, `drift`, `ratify`); remaining 9 tracked as B-numbered follow-ups but the framework is built to accommodate them.
  - v1 supports both solo + team install **modes** at the install action (operator picks at install time). Team-mode operates the same MCP surface; the Google-Drive-OAuth substrate is operator-owned and FailSafe never touches the token file at `~/.bicameral/google-drive-token.json`.
  - **Bicameral is NOT bundled** in the FailSafe VSIX. The Install action triggers a subprocess `pip install bicameral-mcp` + `bicameral-mcp setup --mode {solo,team}` on the operator's machine, exactly as the operator would run it themselves.
  - No telemetry forwarding. FailSafe will not bridge Bicameral telemetry events anywhere.
- **non_goals**:
  - Cloning Bicameral's dashboard verbatim. Information architecture only; FailSafe CSS tokens.
  - Generic MCP client framework — keep it minimal; refactor to `McpClientHost` only if a second MCP integration arrives.
  - Replacing the user's own bicameral dashboard. The `bicameral.dashboard` tool launches Bicameral's own dashboard; the FailSafe panel coexists.
  - Bundling bicameral-mcp inside the VSIX. We invoke `pip install bicameral-mcp` from the user's environment; the wheel is never carried in our package.
  - Owning Team-mode OAuth. The Drive token cache is operator-owned at `~/.bicameral/google-drive-token.json`; FailSafe never touches it.
- **exclusions**:
  - VS Code workspace settings reorganization
  - Release pipeline workflow edits (autonomy limit per intake)
  - Touching `.bicameral/config.yaml` from inside FailSafe (read-only; operator owns)

---

## Open Questions

1. **Auto-detect vs operator-toggle**: should the Integrations panel always render the Bicameral card with state indicators, or hide it until operator enables in Settings? **Plan decision: always render**; show state (`not installed` / `installed-not-connected` / `connected`). Rationale: discoverability + no hidden gates. If operator never installs, panel is informative not annoying.
2. **Process lifecycle**: spawn `bicameral-mcp` on tab activation (lazy) or on extension activation (eager)? **Plan decision: lazy spawn on first tab open** + keep alive while extension active. Tear down on extension deactivate. Rationale: avoids unnecessary subprocess for operators who never use the tab.
3. **`bicameral.preflight` integration**: feed into FailSafe's intent/L3 flow or panel-only? **Plan decision: panel-only for v1**, surface preflight-on-demand button. Cross-wiring into the existing pre-action surface is its own plan (B-numbered follow-up).
4. **Connection-state polling**: when bicameral-mcp is up, do we poll for new decisions, subscribe to MCP notifications, or refresh on operator action? **Plan decision: refresh on operator action + on hub event**. MCP has notification support but Bicameral's tool surface is request/response; manual refresh button + WS-driven hub.refresh on FailSafe side is sufficient for v1.

---

## CI Commands

- `cd FailSafe/extension && npm run compile` — type-check + bundle
- `cd FailSafe/extension && npm test` — vscode-test (extension host + mocha; will run the new bicameral integration tests)
- `cd FailSafe/extension && npm run lint` — ESLint pass
- `cd FailSafe/extension && npm run test:e2e -- --grep "integrations|bicameral"` — Playwright UI specs (E2E coverage gate per B199 Phase 1 — feature class)
- `npx tsc --noEmit` — strict type-check across new integrations module tree

---

## Phase 1: MCP Client Substrate

### Affected Files

- `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts` — NEW. Owns spawn / connect / call / shutdown. Returns typed results.
- `FailSafe/extension/src/integrations/bicameral/types.ts` — NEW. `BicameralDecision`, `BicameralDriftStatus`, `BicameralFeatureBrief`, `BicameralPreflightResult`. Mirrors tool-output shapes from `server.py` argument schemas.
- `FailSafe/extension/src/integrations/bicameral/install-detector.ts` — NEW. Probes `bicameral-mcp --version` via child_process + `.bicameral/config.yaml` existence to classify state: `not-installed` / `installed-not-configured` / `configured-not-running` / `running`. Also exports `isSafeBicameralCommand(value: string): boolean` — the operator-input validator used at the spawn boundary (per OWASP A03 mitigation in Phase 3).
- `FailSafe/extension/src/integrations/bicameral/index.ts` — NEW. Barrel export.
- `FailSafe/extension/src/test/integrations/bicameral/BicameralMcpClient.test.ts` — NEW. Test descriptors below.
- `FailSafe/extension/src/test/integrations/bicameral/install-detector.test.ts` — NEW.

### Changes

`BicameralMcpClient` (sketch):

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class BicameralMcpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  constructor(
    private readonly command: string = "bicameral-mcp",
    private readonly args: string[] = [],
    private readonly cwd: string,
  ) {}

  async connect(): Promise<void> { /* spawn + initialize */ }
  async disconnect(): Promise<void> { /* close transport */ }
  async history(): Promise<BicameralFeatureBrief[]> { /* tools/call bicameral.history */ }
  async preflight(filePath: string): Promise<BicameralPreflightResult> { /* */ }
  async drift(filePath: string): Promise<BicameralDriftStatus[]> { /* */ }
  async ratify(decisionId: string, verdict: "ratify" | "reject"): Promise<void> { /* */ }
  isConnected(): boolean { return this.client !== null; }
}
```

`install-detector` runs `bicameral-mcp --version` with 3s timeout via `child_process.spawn`; returns `InstallState` enum + optional version string. Probes `path.join(workspaceRoot, ".bicameral", "config.yaml")` for configured state.

### Unit Tests

- `test/integrations/bicameral/install-detector.test.ts`:
  - `probeInstallState — returns 'not-installed' when bicameral-mcp not on PATH (Node ENOENT)` — invokes detector with `command = "bicameral-mcp-nonexistent"`, asserts state.
  - `probeInstallState — returns 'installed-not-configured' when CLI runs but .bicameral/config.yaml absent` — stub `child_process.spawn` to emit version then exit 0; verify state.
  - `probeInstallState — returns 'configured-not-running' when config.yaml exists` — temp workspace with config file; assert.
  - `probeInstallState — version regex extracts MAJOR.MINOR.PATCH from stdout` — stub stdout = `"0.14.6\n"`; assert version field.
  - `probeInstallState — 3s timeout returns 'not-installed' on hung process` — fake-timer-based child that never exits.
  - `isSafeBicameralCommand — accepts bare executable name "bicameral-mcp"` — assert returns true.
  - `isSafeBicameralCommand — rejects shell metacharacters ("bicameral-mcp; rm -rf /")` — assert returns false.
  - `isSafeBicameralCommand — rejects path traversal ("/home/user/../../etc/passwd")` — assert returns false.
  - `isSafeBicameralCommand — accepts absolute path under home dir` — synthesize a test path; assert returns true.
- `test/integrations/bicameral/BicameralMcpClient.test.ts`:
  - `connect — initializes MCP client and stdio transport with cwd` — mock `StdioClientTransport` constructor; assert command + cwd passed through.
  - `connect — failure to spawn surfaces as rejected promise with original error` — make transport throw; verify error propagation.
  - `disconnect — idempotent when not connected` — call without prior connect; no throw.
  - `history — calls tools/call with name=bicameral.history and returns parsed array` — mock client.callTool; assert request shape + response parsing.
  - `preflight(filePath) — passes filePath in arguments.file` — mock + assert.
  - `drift(filePath) — passes filePath in arguments.file_path` — mock + assert (note: Bicameral schema uses `file_path` not `file`).
  - `ratify(decisionId, verdict) — passes both arguments` — mock + assert.
  - `every method throws if not connected` — call without connect; assert rejection.

---

## Phase 1b: Install Handler (Operator-Triggered)

### Affected Files

- `FailSafe/extension/src/integrations/bicameral/install-handler.ts` — NEW. Owns the operator-triggered install action. Runs `pip install bicameral-mcp` + `bicameral-mcp setup --mode {solo|team}` via `child_process.spawn` (list-form argv, no `shell: true`). Emits structured progress events the card consumes.
- `FailSafe/extension/src/test/integrations/bicameral/install-handler.test.ts` — NEW.

### Changes

```typescript
export type InstallMode = 'solo' | 'team';
export interface InstallStep {
  phase: 'pip-install' | 'setup' | 'verify';
  status: 'running' | 'success' | 'error';
  command?: string;
  stdoutTail?: string;
  error?: string;
}
export interface InstallProgressEvent { steps: InstallStep[]; mode: InstallMode; done: boolean; ok?: boolean; error?: string; }

export interface InstallHandlerOptions {
  workspaceRoot: string;
  pythonCommand?: string;  // default 'pip'; operator-overridable via failsafe.integrations.bicameral.pipCommand
  bicameralCommand?: string;  // default 'bicameral-mcp'; same validation as install-detector
  onProgress: (evt: InstallProgressEvent) => void;
  spawn?: typeof child_process.spawn;  // test seam
}

export async function runBicameralInstall(opts: InstallHandlerOptions, mode: InstallMode): Promise<InstallProgressEvent> { /* */ }
```

**Security**: All commands routed through `isSafeBicameralCommand` (extended to also validate the `pip`/`pip3`/`python` command names). `spawn` is invoked list-form: `spawn('pip', ['install', 'bicameral-mcp'])` and `spawn('bicameral-mcp', ['setup', '--mode', mode])`. No `shell: true`. `mode` is restricted to the literal union `'solo' | 'team'` — no injection surface.

**OWASP A03 (supply chain)**: `pip install bicameral-mcp` pulls from PyPI; the same trust posture as any operator who runs the command themselves. We do not pin a specific version in v1 (operator can use a custom `pipCommand` to do `pip install bicameral-mcp==X.Y.Z`); follow-up `B-INT-7` will add version-floor pin. INTEGRATIONS.md documents the supply-chain trust boundary explicitly.

### Unit Tests

- `test/integrations/bicameral/install-handler.test.ts`:
  - `runBicameralInstall — solo mode spawns pip install then bicameral-mcp setup --mode solo`. Mock spawn; assert call sequence + argv shapes.
  - `runBicameralInstall — team mode passes --mode team` — assert argv.
  - `runBicameralInstall — pip install failure halts before setup` — make first spawn exit code 1; verify second spawn not invoked + onProgress emits step with status=error.
  - `runBicameralInstall — setup failure surfaces error in progress event` — pip succeeds, setup fails.
  - `runBicameralInstall — rejects unsafe pipCommand` — pass `pip; rm -rf /`; assert handler refuses + onProgress reports error.
  - `runBicameralInstall — rejects unsafe bicameralCommand` — same shape.
  - `runBicameralInstall — verify step probes install-detector after setup, returns running state on success` — wires through to probeInstallState; assert verify step status reflects detector output.
  - `runBicameralInstall — never invokes shell:true` — assert all spawn calls receive `shell: false` or omit the option.

---

## Phase 2: Integrations Tab Surface

### Affected Files

- `FailSafe/extension/src/roadmap/ui/command-center.html` — add `<button class="tab-btn" data-target="integrations" title="Third-party integrations">` (icon TBD, plan defers icon choice to implement); add `<div class="tab-panel" data-name="integrations">` container.
- `FailSafe/extension/src/roadmap/ui/command-center.js` — register `integrations` renderer in `renderers` map; wire to client events.
- `FailSafe/extension/src/roadmap/ui/modules/integrations.js` — NEW. Top-level tab renderer; manages sub-card list (currently only Bicameral). Pattern matches `marketplace.js` chip-based registry for future expansion.
- `FailSafe/extension/src/roadmap/ui/modules/bicameral-card.js` — NEW. Self-contained card. Renders by `InstallState`:
  - `not-installed` → install actions: `Install (Solo)` + `Install (Team)` buttons + upstream-docs link + `Detect again` button. Click either triggers `runBicameralInstall(...)` and renders a live-progress block (`pip install`, `bicameral-mcp setup`, verify). Mode picker is a button choice, not a separate modal.
  - `installed-not-configured` → "Run setup" with mode picker (`Setup (Solo)` / `Setup (Team)`) — triggers `bicameral-mcp setup --mode {mode}` only, skipping pip install.
  - `configured-not-running` → `Connect` button (triggers `BicameralMcpClient.connect()`)
  - `running` → connected state with feature feed + per-feature decision rows + ratify actions
- `FailSafe/extension/src/test/roadmap/integrations-tab.test.ts` — NEW. Test descriptors below.
- `FailSafe/extension/src/test/roadmap/bicameral-card.test.ts` — NEW.

### Changes

`integrations.js` shape (sketch):

```javascript
import { renderBicameralCard, bindBicameralCard } from './bicameral-card.js';

export function createIntegrationsRenderer({ workspaceRoot }) {
  const state = { bicameral: { installState: 'unknown', decisions: [], drift: {}, error: null } };

  return {
    render(hubData) {
      const panel = document.querySelector('[data-name="integrations"]');
      if (!panel) return;
      panel.innerHTML = renderBicameralCard(state.bicameral);
      bindBicameralCard(panel, { onConnect, onRefresh, onRatify, onDetect });
    },
    onEvent(evt) { /* react to hub events that touch integrations */ },
  };
}
```

### Unit Tests

- `test/roadmap/integrations-tab.test.ts`:
  - `renderIntegrationsTab — renders a Bicameral card slot when state.bicameral exists` — JSDOM; assert query selector matches.
  - `renderIntegrationsTab — Bicameral card is the only entry in v1` — assert no other card containers present.
  - `onEvent — does not throw on irrelevant event types` — pass `{type: 'unrelated'}`; no throw.
- `test/roadmap/bicameral-card.test.ts`:
  - `renderBicameralCard — installState='not-installed' renders Install (Solo) + Install (Team) buttons + upstream docs link` — match `data-action="bicameral-install"` + both `data-mode` values.
  - `renderBicameralCard — installState='not-installed' with installProgress shows live step rows` — pass progress state; assert step rows render with phase + status.
  - `bindBicameralCard — Install button click fires onInstall(mode) with picked mode` — JSDOM click both buttons; spy captures `'solo'` then `'team'`.
  - `renderBicameralCard — installState='configured-not-running' renders a Connect button with data-action="bicameral-connect"` — match selector.
  - `renderBicameralCard — installState='running' with empty decisions renders 'no decisions yet' empty state` — match copy.
  - `renderBicameralCard — installState='running' with 3 feature briefs renders 3 sections in feature order` — assert section count.
  - `renderBicameralCard — drift status 'drifted' on a row renders amber accent` — assert CSS class or inline color.
  - `bindBicameralCard — Connect button click fires onConnect callback exactly once` — JSDOM click + spy.
  - `bindBicameralCard — Ratify button click on a decision row fires onRatify with that decision id` — spy.
  - `bindBicameralCard — Detect-again button click fires onDetect callback` — spy.
  - `bindBicameralCard — esc() escapes decision text + symbol bindings before rendering` — XSS-style poisoned input; assert escaped.

---

## Phase 3: Wiring + Activation + Settings

### Affected Files

- `FailSafe/extension/src/extension/main.ts` — wire IntegrationsTab renderer into Command Center bootstrap (single import + registration line).
- `FailSafe/extension/src/extension/bootstrapCore.ts` — instantiate `BicameralMcpClient` on activation (lazy: not connected until tab open). Pass to ConsoleServer for any future API needs.
- `FailSafe/extension/src/roadmap/ui/modules/settings.js` — add a Bicameral section (toggle for "Auto-connect on Command Center open" + display of detected version + link to Bicameral docs).
- `FailSafe/extension/package.json` — add config keys:
  - `failsafe.integrations.bicameral.command` (default `"bicameral-mcp"`)
  - `failsafe.integrations.bicameral.autoConnect` (default `false`)
- `FailSafe/extension/src/test/extension/bicameral-activation.test.ts` — NEW.
- `FailSafe/extension/src/test/roadmap/settings-bicameral.test.ts` — NEW.

### Changes

`bootstrapCore.ts` adds (after existing initialization). `ConfigManager` lives at `FailSafe/extension/src/shared/ConfigManager.ts` and returns a typed `FailSafeConfig` shape via `getConfig()` — it has no generic key lookup, so we read the bicameral-specific keys directly from the VS Code workspace config API:

```typescript
import * as vscode from "vscode";
import { BicameralMcpClient } from "../integrations/bicameral";
import { isSafeBicameralCommand } from "../integrations/bicameral/install-detector";

const cfg = vscode.workspace.getConfiguration("failsafe");
const rawCommand = cfg.get<string>("integrations.bicameral.command", "bicameral-mcp");
// OWASP A03 mitigation: command is operator-configurable; reject anything
// with shell metacharacters or path traversal before passing to spawn().
const command = isSafeBicameralCommand(rawCommand) ? rawCommand : "bicameral-mcp";
const bicameralClient = new BicameralMcpClient(command, [], workspaceRoot);
// Do NOT call connect() here — IntegrationsTab does that lazily on first tab open.
```

**Security note**: `isSafeBicameralCommand` (exported from `install-detector.ts`) accepts only:
- Bare executable names matching `/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/`
- OR absolute paths that resolve under the user's home directory tree (no `..` segments after normalization)

Any other value falls back to the default. Documented in `docs/INTEGRATIONS.md` Security section. All `spawn` invocations use the list-form `args` parameter (no `shell: true`).

### Unit Tests

- `test/extension/bicameral-activation.test.ts`:
  - `extension activates without throwing when bicameral-mcp is not installed` — env without PATH entry; activate; verify no throw + state surfaces as 'not-installed'.
  - `extension does not spawn bicameral-mcp at activate time (lazy)` — spy on `BicameralMcpClient.connect`; assert not called.
  - `BicameralMcpClient.disconnect runs on extension deactivate` — trigger deactivate; spy.
- `test/roadmap/settings-bicameral.test.ts`:
  - `Settings renders Bicameral section with auto-connect toggle` — JSDOM; assert selector match.
  - `toggling auto-connect persists to workspace config under failsafe.integrations.bicameral.autoConnect` — fake config + spy.

---

## Phase 4: Docs + FEATURE_INDEX + Memory

### Affected Files

- `docs/INTEGRATIONS.md` — NEW. User-facing doc for the new tab. Bicameral as first entry. Pattern for future MCP additions.
- `docs/FEATURE_INDEX.md` — APPEND 8 entries: `FX-INT-001` (Integrations tab), `FX-INT-002` (Bicameral card states), `FX-INT-003` (BicameralMcpClient connect/disconnect), `FX-INT-004` (history wrapper), `FX-INT-005` (drift wrapper), `FX-INT-006` (ratify wrapper), `FX-INT-007` (install handler — pip + bicameral-mcp setup), `FX-INT-008` (install action UI — solo/team picker + live progress). Each with file pointers + test pointers.
- `CHANGELOG.md` — APPEND `## [Unreleased]` block with the v5.2.0 draft entries (per `feedback_no_v4_10_x_version.md` — no version bump in this plan; substantiate may stamp).
- `FailSafe/extension/README.md` — APPEND a "Third-party integrations" section + link to docs/INTEGRATIONS.md.
- `README.md` (root) — APPEND a single-line entry under "What's new in v5.1.0" (or open a new "Upcoming" subsection above it if v5.2.0 work is being teased).
- Memory: NEW `reference_bicameral_mcp.md` after substantiate (deferred). NEW link in `MEMORY.md` index.

### Changes

`docs/INTEGRATIONS.md` skeleton (≤200 lines):

```markdown
# FailSafe Integrations

The Integrations tab in the FailSafe Command Center surfaces third-party services
that augment governance + decision-tracking workflows.

## Bicameral MCP

Local-first decision ledger. Captures meeting transcripts and PRDs, pins decisions
to code symbols, surfaces drift before agents touch the wrong code.

### Install

(operator runs `pip install bicameral-mcp && bicameral-mcp setup` — FailSafe does
not install bicameral-mcp for you)

### How FailSafe surfaces it

(state matrix: not-installed / installed-not-configured / configured-not-running / running)

### Tools wrapped in v1

| Tool | Purpose |
|---|---|
| `bicameral.history` | Read-only decision feed (powers the panel) |
| `bicameral.preflight` | On-demand pre-action surfacing |
| `bicameral.drift` | File-scoped drift indicators |
| `bicameral.ratify` | Ratify/reject decision action |
```

### Unit Tests

- `test/docs/feature-index-bicameral.test.ts` — NEW. Assert 6 new FX-INT-* rows exist with non-empty file + test columns. Existing FEATURE_INDEX format-checker may already cover row-level integrity; we add a target-existence check.

---

## Phase 5: Per-Feature Integration Test

### Affected Files

- `FailSafe/extension/src/test/ui/integrations-bicameral.spec.ts` — NEW Playwright spec (per B199 release-class gate; feature class).

### Changes

End-to-end Playwright flow against a stubbed bicameral-mcp child:

```typescript
test.describe('Integrations — Bicameral panel', () => {
  test('panel renders not-installed state when no CLI available', async ({ page }) => {
    await page.goto(servedCompactUI());
    await page.click('[data-target="integrations"]');
    await expect(page.locator('.bicameral-card')).toContainText(/install bicameral/i);
  });

  test('connect button triggers MCP spawn and renders running state', async ({ page }) => {
    // Stub child_process.spawn via a fixture; provide canned tools/call responses.
    await mockBicameralServer({ history: [{ feature: 'auth', decisions: [...] }] });
    await page.goto(servedCompactUI());
    await page.click('[data-target="integrations"]');
    await page.click('[data-action="bicameral-connect"]');
    await expect(page.locator('.bicameral-feature')).toHaveCount(1);
  });

  test('ratify button on a drifted decision row posts ratify call', async ({ page, requests }) => {
    /* */
  });
});
```

### Unit Tests

(see Phase 1–3 sections; consolidated coverage)

---

## Phase Affected Files Summary

| Phase | Files Created | Files Modified |
|---|---|---|
| 1 | 6 (MCP client + types + detector + 2 tests + barrel) | 0 |
| 1b | 2 (install-handler + test) | 0 |
| 2 | 4 (integrations.js + bicameral-card.js + 2 tests) | 2 (command-center.html, command-center.js) |
| 3 | 2 (2 tests) | 3 (main.ts, bootstrapCore.ts, settings.js, package.json) |
| 4 | 1 (INTEGRATIONS.md) + tests | 3 (FEATURE_INDEX.md, CHANGELOG.md, root README.md, extension README.md) |
| 5 | 1 (Playwright spec) | 0 |

Total: 16 new files, 8 modified files.

---

## Acceptance Criteria

- [ ] Command Center has a 6th tab labeled "Integrations"
- [ ] Tab activates; Bicameral card renders all 4 install states correctly per JSDOM tests
- [ ] When bicameral-mcp is installed + configured, Connect button spawns it and `history` returns feature briefs
- [ ] Decision rows render with binding-to-symbol info + drift status indicators
- [ ] Ratify action calls `bicameral.ratify` with correct args; UI updates on success
- [ ] No bicameral-mcp subprocess spawned at extension activate (lazy verified by spy)
- [ ] Extension deactivate cleanly closes any open MCP session (no orphan processes)
- [ ] `npm run compile` clean, `npm test` green, `npm run lint` clean, Playwright spec green
- [ ] FEATURE_INDEX has 6 new FX-INT-* rows; each row has a file pointer + test pointer
- [ ] CHANGELOG draft entry written; no version bump in this plan
- [ ] Upstream Bicameral repo + license credited in INTEGRATIONS.md + extension README

---

## Out of Scope (Backlog Candidates)

- `B-INT-1` — Surface remaining 9 Bicameral tools (`ingest`, `search`, `brief`, `judge_gaps`, `resolve_compliance`, `link_commit`, `update`, `reset`, `dashboard`, `validate_symbols`, `get_neighbors`)
- `B-INT-2` — Team-mode Bicameral support (Drive OAuth state, replicated event log visualization)
- `B-INT-3` — Wire `bicameral.preflight` into FailSafe's existing pre-action surfacing (intent flow, L3 approval)
- `B-INT-4` — Generic `McpClientHost` framework for second MCP integration (defer until second MCP target arrives)
- `B-INT-5` — Sub-tab UI in Integrations panel for multi-service future
- `B-INT-6` — Issue #65 Guided Dev Cycle onboarding (separate plan, independent scope, mentioned only because it shares the Command Center)

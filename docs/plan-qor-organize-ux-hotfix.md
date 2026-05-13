# Plan: Organize/Bootstrap UX Hotfix

**change_class**: hotfix

**doc_tier**: standard

**boundaries**:
- limitations:
  - Three UX defects bundled into one hotfix because their surfaces are tiny, share the same operator-observed symptom class (post-action confusion), and ship in adjacent files.
  - No new feature surface. Behavior of `failsafe.bootstrap`, `failsafe.organize`, the sidebar's Initialize/Organize button toggle, and `bootstrapWorkspace.assembleReport` remains the same; only **timing**, **wording**, and **post-execute UI signalling** change.
  - Does NOT modify the `runWorkspaceBootstrap` step graph (no new bootstrap steps, no change to which steps defer in which mode).
  - Does NOT extend `runOrganize` to invoke `runWorkspaceBootstrap` or change which proposals get generated.
- non_goals:
  - NOT a v5.1.1 hotfix shipping path. This plan ships under the v5.1.0 PUBLISH_BLOCK; the post-lift release process is owned by `docs/release-runbook-v5-1-0.md` and stays unchanged.
  - NOT a `/qor-substantiate` Step 8.5 doctrine change (the "substantiate should also run `npm run build:package`" process-fix from Entry #360 Fix C remains a separate doctrine-level concern; out of scope here).
  - NOT a vscode-test integration harness rebuild. Tests use pure unit-level seams (extracted helpers + injected callbacks) so they run under existing `node --test`; full sidebar-mounted integration is deferred.
- exclusions:
  - The `failsafe.installQorLogicSkillsDefaults` web-flow surface (operator's uncommitted bootstrap-web-flow WIP) is preserved as-is.
  - Marketplace publish path unchanged.
- precondition: v5.1.0 publish-block-lift plan sealed at META_LEDGER #359; debug at #360 surfaced the three defects this plan bundles.

**Defects this plan closes** (per `.agent/staging/DEBUG_REPORT_ORGANIZE_BOOTSTRAP_MISATTRIBUTION.md` + the post-Organize UX gap surfaced 2026-05-14):

- **Defect-1**: Sidebar button optimistically renames to "Organize" before `failsafe.bootstrap` completes, so the bootstrap completion popup arrives after the rename and reads as if "Organize" produced it. `FailSafeSidebarProvider.ts:138-143`. Resolved via V1 Path C (host-side decision) per audit Entry #361.
- **Defect-2**: `bootstrapWorkspace.assembleReport` produces the alarming summary `"Bootstrap: N step(s) deferred"` for the common user-deferred case (operator clicked "Later" on pip install). `bootstrapWorkspace.ts:177-178`.
- **Defect-3**: `runOrganize` returns silently after `executeProposals` — no toast, no `hub.refresh` broadcast, no next-step suggestion. Operator's only signal is `[organize] applied:` lines in the FailSafe output channel. Asymmetric with the install-skills path which broadcasts `skills.install.complete` + `hub.refresh`. `organizeWorkspace.ts:174-202`.

## Open Questions

1. **Defect-1 reply-message naming**: under V1 Path C the host posts a generic `{ type: "failsafe.button.update", text, title, persistState }` payload rather than a step-specific `*.complete` event. This lets future click outcomes (e.g., a future "Re-initialize" state) reuse the same DOM-mutation channel without proliferating message types. Matches the namespacing convention of the existing `failsafe.openPopout` message at FailSafeSidebarProvider.ts:149. Settled.
2. **Defect-2 contextual-summary trigger**: should the contextual wording fire on ANY deferred step whose `detail === "user deferred"`, or only when EVERY deferred step is user-deferred? Default proposed: every-deferred-is-user-deferred (more conservative — avoids hiding mixed deferral states).
3. **Defect-3 next-step suggestion**: should `runOrganize` always emit a `hub.refresh` broadcast, or only when `executed.length > 0`? Default proposed: only when `executed.length > 0` — no UI noise for no-op organize runs.

## Phase 1: Defect-2 — contextual bootstrap summary (smallest surface; lands first)

### Affected Files

- `FailSafe/extension/src/test/extension/bootstrapWorkspaceAssembleReport.test.cjs` — NEW; pure unit tests of `assembleReport` against fabricated `BootstrapStep[]` inputs. Pre-Defect-2 case + post-fix case + mixed-deferral case + failure-trumps-deferral case.
- `FailSafe/extension/src/extension/bootstrapWorkspace.ts` — MODIFIED; `assembleReport` learns to detect the all-user-deferred pattern and emit a contextual summary.

### Changes

`assembleReport` (currently line 165-180). Replace the catch-all `else` branch:

```typescript
} else {
  summary = `Bootstrap: ${deferred.length} step(s) deferred`;
}
```

with:

```typescript
} else if (deferred.every((s) => s.detail === "user deferred")) {
  summary = "Bootstrap paused — run Initialize again when ready to install qor-logic";
} else {
  summary = `Bootstrap: ${deferred.length} step(s) deferred`;
}
```

The existing `BootstrapStep` interface already carries `detail?: string`. `stepQorLogicPackage` (line 96-125) already sets `detail: "user deferred"` when the operator clicks "Later" on the install prompt. No new fields; no migration.

### Unit Tests

- `bootstrapWorkspaceAssembleReport.test.cjs`:
  - Invokes `assembleReport([{name,status:"ok"},{name,status:"performed"},{name,status:"deferred",detail:"user deferred"},{name,status:"deferred",detail:"user deferred"}])` and asserts `summary === "Bootstrap paused — run Initialize again when ready to install qor-logic"`.
  - Invokes against `[{name,status:"performed"}, ...]` and asserts `summary` starts with `Bootstrap performed:`.
  - Invokes against mixed deferred (`detail: "user deferred"` + `detail: "silent mode"`) and asserts old `"Bootstrap: N step(s) deferred"` wording is preserved (conservative — only user-only-deferral gets the new copy).
  - Invokes against `[{name,status:"failed",detail:"x"},{name,status:"deferred",detail:"user deferred"}]` and asserts the failure branch wins (summary contains `failure(s)`).

## Phase 2: Defect-1 — defer button rename until bootstrap completion (V1 Path C: host-side decision)

### Affected Files

- `FailSafe/extension/src/test/roadmap/sidebarInitializeLogic.test.ts` — NEW; tests the pure host-side decision function `decideSidebarClick(currentLabel, registeredCommands)` against a covering input matrix. Runs under vscode-test mocha (`npm test`) — no vscode imports in the unit under test, so the harness only provides the mocha runner; no `getCommands` mock plumbing is needed at unit boundary.
- `FailSafe/extension/src/roadmap/sidebarInitializeLogic.ts` — NEW (no `import` of `vscode`; pure TS); exports `decideSidebarClick` and the `SidebarClickDecision` discriminated union below.
- `FailSafe/extension/src/roadmap/FailSafeSidebarProvider.ts` — MODIFIED; (a) `onDidReceiveMessage` collapses the prior `initialize` / `organize` cases into a single `sidebar.click` case that delegates the decision to `decideSidebarClick`; (b) on `run-bootstrap` decisions, the host posts `{ type: "failsafe.button.update", ... }` after `executeCommand("failsafe.bootstrap")` returns; (c) webview JS becomes a thin click-and-postMessage shell that ONLY mutates DOM in response to host messages.

### Changes

Approach (V1 Path C from audit Entry #361 V1 remediation): the click-decision and label-mutation logic live host-side in TypeScript. The webview JS owns no decision state — it sends the current label, the host computes what to do, and the host posts back the next DOM mutation. Single source of truth; no `.js` helper file; no new build step; the unit-under-test is the actual deployed TS code.

#### NEW file — `FailSafe/extension/src/roadmap/sidebarInitializeLogic.ts`

```typescript
export type ButtonUpdate = {
  type: "failsafe.button.update";
  text: string;
  title: string;
  persistState: boolean;
};

export type SidebarClickDecision =
  | { kind: "run-organize" }
  | { kind: "run-bootstrap"; postUpdate: ButtonUpdate }
  | { kind: "bootstrap-not-ready" };

export function decideSidebarClick(
  currentLabel: string,
  registeredCommands: ReadonlySet<string>,
): SidebarClickDecision {
  if (currentLabel === "Organize") return { kind: "run-organize" };
  if (registeredCommands.has("failsafe.bootstrap")) {
    return {
      kind: "run-bootstrap",
      postUpdate: {
        type: "failsafe.button.update",
        text: "Organize",
        title: "Organize Workspace Structure",
        persistState: true,
      },
    };
  }
  return { kind: "bootstrap-not-ready" };
}
```

#### MODIFIED — `FailSafe/extension/src/roadmap/FailSafeSidebarProvider.ts`

Replace the prior `case "initialize"` + `case "organize"` blocks (currently lines 46-67) with a single `case "sidebar.click"`:

```typescript
case "sidebar.click": {
  const allCmds = new Set(await vscode.commands.getCommands(true));
  const decision = decideSidebarClick(message.currentLabel, allCmds);
  switch (decision.kind) {
    case "run-organize":
      if (allCmds.has("failsafe.organize")) {
        await vscode.commands.executeCommand("failsafe.organize");
      }
      break;
    case "run-bootstrap":
      await vscode.commands.executeCommand("failsafe.bootstrap");
      this.view?.webview.postMessage(decision.postUpdate);
      break;
    case "bootstrap-not-ready":
      vscode.window.showWarningMessage(
        "Bootstrap command is not yet registered. The extension may still be activating — try again in a moment.",
      );
      break;
  }
  break;
}
```

The discriminated-union switch enforces exhaustiveness via TypeScript so any new `SidebarClickDecision` variant requires the handler to grow.

Webview `<script>` (replaces inline lines 121-145):

```js
const vscode = acquireVsCodeApi();
const initBtn = document.getElementById('init-workspace');

// Restore state — but no decision logic; just the label.
const state = vscode.getState() || { initDone: false };
if (state.initDone && initBtn) {
  initBtn.textContent = 'Organize';
  initBtn.title = 'Organize Workspace Structure';
}

document.getElementById('open-popout')?.addEventListener('click',
  () => vscode.postMessage({ command: 'openPopout' }));
document.getElementById('reload')?.addEventListener('click',
  () => vscode.postMessage({ command: 'reload' }));

initBtn?.addEventListener('click', () => {
  vscode.postMessage({ command: 'sidebar.click', currentLabel: initBtn.textContent });
  // No optimistic rename. Wait for `failsafe.button.update` from the host.
});

window.addEventListener('message', (event) => {
  const data = event && event.data ? event.data : null;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'failsafe.button.update' && initBtn) {
    initBtn.textContent = data.text;
    initBtn.title = data.title;
    if (data.persistState) {
      vscode.setState({ ...vscode.getState(), initDone: true });
    }
    return;
  }
  if (data.type === 'failsafe.openPopout') {
    // ...existing handler preserved
  }
});
```

`onDidReceiveMessage`'s message-shape union (currently at line 8) extends to include the new variant:

```typescript
type WebviewMessage =
  | { command: "openPopout" }
  | { command: "openEditor" }
  | { command: "reload" }
  | { command: "sidebar.click"; currentLabel: string };  // NEW
```

The prior `{ command: "initialize" }` and `{ command: "organize" }` variants are removed. The webview no longer sends those.

### Unit Tests

- `sidebarInitializeLogic.test.ts` — six cases, each invoking `decideSidebarClick` and asserting on the returned `SidebarClickDecision`:
  - `decideSidebarClick("Organize", new Set(["failsafe.organize"]))` → `{ kind: "run-organize" }`.
  - `decideSidebarClick("Organize", new Set([]))` → still `{ kind: "run-organize" }` (label-only decision; the host's outer switch decides what to do if `failsafe.organize` is unregistered).
  - `decideSidebarClick("Initialize", new Set(["failsafe.bootstrap"]))` → `{ kind: "run-bootstrap", postUpdate: { type: "failsafe.button.update", text: "Organize", title: "Organize Workspace Structure", persistState: true } }`.
  - `decideSidebarClick("Initialize", new Set([]))` → `{ kind: "bootstrap-not-ready" }`.
  - `decideSidebarClick("Initialize", new Set(["unrelated.command"]))` → `{ kind: "bootstrap-not-ready" }` (negative — non-matching command set).
  - Idempotence: calling `decideSidebarClick` twice with same inputs returns deep-equal output and does not mutate the input Set.

Test mechanics: file at `src/test/roadmap/sidebarInitializeLogic.test.ts` follows the suite/test convention used by `src/test/roadmap/HubSnapshotService.test.ts` and other vscode-test mocha files. Imports `decideSidebarClick` directly from `../../roadmap/sidebarInitializeLogic`. Runs under `npm test`. (Pure TS unit — no `vscode` API access — so the test does not depend on the harness mocking VS Code state beyond what mocha already provides.)

## Phase 3: Defect-3 — Organize post-execute UX

### Affected Files

- `FailSafe/extension/src/test/extension/organizeWorkspaceCallbacks.test.cjs` — NEW; pure unit tests of `runOrganize` invoking injected callbacks with the expected payload. Mock `vscode.window.showQuickPick` (returns selected) + capture toast + capture broadcast.
- `FailSafe/extension/src/extension/organizeWorkspace.ts` — MODIFIED; (a) `runOrganize` accepts optional callbacks `{ onToast?, onHubRefresh?, onNextStep? }`; (b) `summarize` unchanged (keeps the outputChannel diagnostic surface); (c) post-execute logic computes a `nextStep` suggestion + invokes callbacks when present.
- `FailSafe/extension/src/extension/bootstrapServers.ts` — MODIFIED; the `failsafe.organize` command registration (currently lines 139-144) is enriched to wire the three callbacks against `consoleServer.broadcastEvent` + `vscode.window.showInformationMessage`.

### Changes

In `organizeWorkspace.ts`:

```typescript
export interface OrganizeCallbacks {
  onToast?: (message: string) => void;          // surfaces vscode.window.showInformationMessage
  onHubRefresh?: (reason: string) => void;      // broadcasts hub.refresh to the Console UI
  onNextStep?: (suggestion: NextStep) => void;  // surfaces a follow-up action recommendation
}

export interface NextStep {
  label: string;
  command?: string;       // e.g. "failsafe.bootstrap" for "Now run Initialize"
}

function computeNextStep(report: OrganizeReport): NextStep | null {
  if (report.executed.length === 0) return null;
  const executedLabels = report.executed.join("; ");
  // Heuristic: if a governance-dir was just created, suggest Initialize.
  if (report.executed.some((l) => l.includes("governance/plans"))) {
    return { label: "Now run Initialize to bootstrap qor-logic + skills", command: "failsafe.bootstrap" };
  }
  if (report.executed.some((l) => l.startsWith("Add"))) {
    return { label: "Review the .gitignore patches and commit when ready" };
  }
  return { label: `Organize applied ${report.executed.length} change(s): ${executedLabels}` };
}

export async function runOrganize(
  workspaceRoot: string,
  output: vscode.OutputChannel,
  callbacks: OrganizeCallbacks = {},
): Promise<OrganizeReport> {
  const archetype = detectArchetype(workspaceRoot);
  const proposals = buildProposals(workspaceRoot);
  const selected = await pickProposals(proposals);
  const { executed, skipped } = await executeProposals(selected);
  const report: OrganizeReport = { archetype, proposals, executed, skipped };
  summarize(output, report);
  if (executed.length > 0) {
    const toast = skipped.length === 0
      ? `Organize: applied ${executed.length} change(s)`
      : `Organize: applied ${executed.length}, ${skipped.length} skipped`;
    callbacks.onToast?.(toast);
    callbacks.onHubRefresh?.("workspace-organized");
  }
  const next = computeNextStep(report);
  if (next) callbacks.onNextStep?.(next);
  return report;
}
```

In `bootstrapServers.ts` (replace lines 139-144):

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand("failsafe.organize", async () => {
    const { runOrganize } = await import("./organizeWorkspace");
    await runOrganize(deps.workspaceRoot, outputChannel, {
      onToast: (message) => { void vscode.window.showInformationMessage(message); },
      onHubRefresh: (reason) => consoleServer.broadcastEvent({ type: "hub.refresh", reason }),
      onNextStep: (suggestion) => {
        outputChannel.appendLine(`[organize] next: ${suggestion.label}`);
        if (suggestion.command) {
          void vscode.window.showInformationMessage(suggestion.label, "Run").then((choice) => {
            if (choice === "Run") void vscode.commands.executeCommand(suggestion.command!);
          });
        }
      },
    });
  }),
);
```

`OrganizeReport` shape unchanged; callers that pre-existed (test fixtures, etc.) keep working because callbacks default to `{}`.

### Unit Tests

- `organizeWorkspaceCallbacks.test.cjs`:
  - Stub `vscode.window.showQuickPick` to return a single fake proposal whose `action` is a no-op. Invoke `runOrganize(tmp, mockOutputChannel, { onToast, onHubRefresh, onNextStep })`. Assert `onToast` invoked with `Organize: applied 1 change(s)`; `onHubRefresh` invoked with `workspace-organized`; `onNextStep` invoked with a `NextStep` whose `label` is non-empty.
  - Stub `showQuickPick` to return `undefined` (operator dismissed). Invoke. Assert NO callbacks fired; `summarize` still wrote `[organize] workspace already tidy` to the mock outputChannel.
  - Invoke against a fixture where one proposal's `action` throws. Assert `onToast` reflects `applied 0, 1 skipped`; `onHubRefresh` is NOT called (executed.length === 0); `onNextStep` is NOT called.
  - Direct unit of `computeNextStep`: given `{executed: ["Create .failsafe/governance/plans"], ...}` returns `{ label: ..., command: "failsafe.bootstrap" }`. Given `{executed: ["Add 2 governance pattern(s) to .gitignore"], ...}` returns `{ label: /Review.+commit/ }`. Given `{executed: []}` returns `null`.

## CI Commands

- `cd FailSafe/extension; npm run compile` — TypeScript compilation (covers all three modified .ts files).
- `cd FailSafe/extension; npm run bundle` — esbuild bundle so `dist/extension/main.js` reflects the source edits (closes the Entry #360 process gap retroactively for this plan's seal).
- `cd FailSafe/extension; node --test src/test/extension/bootstrapWorkspaceAssembleReport.test.cjs src/test/extension/organizeWorkspaceCallbacks.test.cjs` — two `node --test` surfaces (Phase 1 + Phase 3) in isolation.
- `cd FailSafe/extension; npm test -- --grep sidebarInitializeLogic` — vscode-test mocha runs the Phase 2 TS test surface (`sidebarInitializeLogic.test.ts`).
- `cd FailSafe/extension; npm test -- --runInBand` — full extension vscode-test surface (deterministic serial; regression coverage that no existing test broke).
- `cd FailSafe/extension; npx playwright test` — Playwright re-run (regression coverage that the sidebar-button-related changes did not break Monitor / Command Center UI).
- `node FailSafe/extension/scripts/check-governance-canaries.cjs --repo-root .` — governance markdown canary scan (per the prompt-injection audit pass).

## Phase Order Rationale

- Phase 1 first because `bootstrapWorkspace.assembleReport` is the smallest pure-function surface (no IPC, no DOM, no vscode API mocks). Lands the contextual summary and unblocks the message-wording change.
- Phase 2 second because Defect-1's fix relies on the host-side reply contract — adding the reply post lands cleanly before the webview JS removes its optimistic rename.
- Phase 3 last because Defect-3's UX additions (toast + broadcast + next-step) sit atop the same `runOrganize` surface and can be reviewed against the now-stable bootstrap-message wording from Phase 1.

## Review-Boundary attestation

This plan honors the no-ship rule at every phase:

- `/qor-implement` for Phase 1-3 lands source edits, runs `node --test`, runs `npm run compile && npm run bundle` (closes the Entry #360 process gap by including the dist rebuild as a CI command), and stages files. It does NOT push, tag, or marketplace-publish.
- `/qor-substantiate` for this plan SKIPS Steps 7.4 / 7.5 / 7.6 / 9.5.5 (SSDF emission + version bump + CHANGELOG stamp + annotated tag). The hotfix is `change_class: hotfix` per top-matter, exempt from the Phase 33 release-doc rule. Per `feedback_no_publish_until_full_coverage.md` HARD RULE, the v5.1.0 PUBLISH_BLOCK remains held until the operator-attestation conditions clear; this hotfix lands behind that block.
- Marketplace publish: out of scope. The eventual v5.1.0 marketplace dispatch incorporates this hotfix via the normal release commit per `docs/release-runbook-v5-1-0.md`.

`feedback_no_ship_without_approval.md` HARD RULE applies throughout: no push, no PR, no merge, no tag, no build-publish commands without explicit per-action operator approval, even when this plan's phases enumerate them as the documented next step.

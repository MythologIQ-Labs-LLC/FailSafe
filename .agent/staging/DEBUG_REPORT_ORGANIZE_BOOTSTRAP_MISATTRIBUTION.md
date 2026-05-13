# DEBUG REPORT — Organize button apparent "Bootstrap: 1 step(s) deferred" misattribution

**Date**: 2026-05-14
**Persona**: The Qor-logic Specialist (debug mode)
**Scope**: Operator-reported runtime defect surfaced during agent-portion runbook execution at META_LEDGER #358.
**Risk Grade**: L1 (UX misattribution; no data integrity or security impact)

---

## Operator report

> "did you run the build? because the Organize button still produces Bootstrap: 1 step(s) deferred."

## Reproduction

1. Operator activates the FailSafe extension. The activation-time silent bootstrap (bootstrapServers.ts:174) runs; if qor-logic is not installed, `skill-ingestion` is auto-deferred → outputChannel line `[bootstrap-on-activation] Bootstrap: 1 step(s) deferred`. **No popup**.
2. Operator opens the sidebar. The webview JS reads `vscode.getState()`:
   - If `initDone: false` → button shows "Initialize".
   - If `initDone: true` (set by a prior session click) → button shows "Organize".
3. Operator clicks the button labeled "Initialize" → JS sends `command: 'initialize'` → FailSafeSidebarProvider runs `failsafe.bootstrap` → `runWorkspaceBootstrap(..., "interactive")` → eventually invokes `reportBootstrapToUser` which calls `vscode.window.showInformationMessage(report.summary)` → **popup with "Bootstrap: 1 step(s) deferred"**.
4. **Crucially**, the webview JS optimistically renames the button to "Organize" IMMEDIATELY after posting the message (FailSafeSidebarProvider.ts:138-143):
   ```js
   if (!isOrganize) {
     initBtn.textContent = 'Organize';
     initBtn.title = 'Organize Workspace Structure';
     vscode.setState({ ...vscode.getState(), initDone: true });
   }
   ```
   The rename happens BEFORE `runWorkspaceBootstrap` returns (no await on the post-message round-trip).
5. By the time the bootstrap finishes and the popup surfaces, the button label has already changed to "Organize". The operator attributes the popup to the renamed button.

## Build-currency check

| Artifact | Mtime | Source mtime | Stale? |
|---|---|---|---|
| `dist/extension/main.js` | 2026-05-12 09:56 | n/a | — |
| `src/extension/bootstrapServers.ts` | — | 2026-05-13 16:03 | **YES** (deployed binary trails source by ~30h) |
| `src/extension/bootstrapWorkspace.ts` | — | 2026-04-27 11:01 | — |
| Working tree | — | uncommitted edits to `bootstrapServers.ts`, `installSkillsHandler.ts`, `ActionsRoute.ts`, `SreTemplate.ts`, `types.ts`, `index.html`, `install-skills-card.js`, 2 test files, `BACKLOG.md` | **YES** (operator WIP not bundled) |

Operator's question "did you run the build?" — direct answer: **no**, the agent ran `npx tsc --noEmit -p ./` (type-check only, no emit) and `node --test` (functional .cjs tests), but NOT `npm run compile && npm run bundle`. The deployed `dist/extension/main.js` was therefore stale at the time of the report.

Just-now remediation: agent ran `cd FailSafe/extension && npm run compile && npm run bundle` → tsc clean → esbuild produced 3.8 MB bundle in 978 ms → `dist/extension/main.js` now reflects current source including uncommitted operator WIP.

## Call-graph evidence

`grep -rnE "runWorkspaceBootstrap|reportBootstrap" FailSafe/extension/src/ --include="*.ts" --include="*.js"` (excluding tests):

```
FailSafe/extension/src/extension/bootstrapServers.ts:24: import runWorkspaceBootstrap from "./bootstrapWorkspace"
FailSafe/extension/src/extension/bootstrapServers.ts:134: const report = await runWorkspaceBootstrap(bootstrapDeps, "interactive");
FailSafe/extension/src/extension/bootstrapServers.ts:135: reportBootstrapToUser(report, outputChannel);
FailSafe/extension/src/extension/bootstrapServers.ts:174: void runWorkspaceBootstrap(bootstrapDeps, "silent").then((report) => {
FailSafe/extension/src/extension/bootstrapServers.ts:195: function reportBootstrapToUser(...)
FailSafe/extension/src/extension/bootstrapWorkspace.ts:45: export async function runWorkspaceBootstrap(...)
```

Exactly two call sites:
- Line 134 (popup): inside `failsafe.bootstrap` command handler.
- Line 174 (outputChannel only, no popup): activation-time silent.

`grep -nE "bootstrap|runBootstrap|workspaceBootstrap" FailSafe/extension/src/extension/organizeWorkspace.ts FailSafe/extension/src/extension/organizeProposals.ts` returns **zero matches**. `runOrganize` does NOT invoke any bootstrap path.

The popup with "Bootstrap: 1 step(s) deferred" can ONLY originate from the `failsafe.bootstrap` command — i.e., from clicking the button labeled "Initialize", not from clicking the button labeled "Organize".

## Root cause (Five-Whys)

1. **Why does the operator see "Bootstrap: 1 step(s) deferred" after clicking the button labeled "Organize"?**
   Because the bootstrap popup is the asynchronous completion of the prior `failsafe.bootstrap` invocation, and the button was renamed to "Organize" before the popup surfaced.

2. **Why is the rename optimistic?**
   Webview JS in FailSafeSidebarProvider.ts:138-143 renames immediately after `vscode.postMessage` (no acknowledgement wait).

3. **Why no acknowledgement wait?**
   FailSafeSidebarProvider's `onDidReceiveMessage` handler (lines 30-69) is one-way; the host never posts back to the webview on command completion.

4. **Why was fire-and-forget acceptable when the code was authored?**
   Earlier bootstrap steps were near-instant. Adding `stepQorLogicPackage` (pip install — variable latency depending on user QuickPick "Later" choice) changed the latency profile, but the optimistic-rename was not revisited.

5. **Why did automated tests miss this?**
   Playwright suite boots `ConsoleServer` directly (`src/test/ui/helpers/serveConsoleServerUI.ts`); it does not mount the VS Code-host `FailSafeSidebarProvider`. No vscode-test integration test asserts button-state vs notification-timing.

## Process gap

`/qor-substantiate` Step 8.5 (`dist_recompile`) was DEGRADED-NOOP because `.qor/` runtime is uninitialized in this workspace. The Step 8.5 narrative was framed around `qor-logic` Python dist-compile; it did NOT cover the extension's webpack/esbuild build. The seal at Entry #359 therefore landed without confirming `dist/extension/main.js` was current.

**Process fix candidate**: `/qor-substantiate` Step 8.5 should additionally invoke `npm run build:package` (or at minimum `compile && bundle`) when the extension surface is in `files_touched`. This is a doctrine-level change that would require a separate plan; flagged here as out-of-scope for this debug cycle.

The v5.1.0 release runbook (`docs/release-runbook-v5-1-0.md`) should also add an explicit `npm run build:package` step BEFORE step 3 (Playwright run), so the Playwright suite tests the production-shape bundle, not a stale one. Same plan boundary.

## Proposed fixes

### Fix A — defer the rename (minimal, recommended for hotfix)

`FailSafe/extension/src/roadmap/FailSafeSidebarProvider.ts`:

```typescript
// Inside onDidReceiveMessage `case "initialize"`:
case "initialize": {
  const initCmds = await vscode.commands.getCommands(true);
  if (initCmds.includes("failsafe.bootstrap")) {
    await vscode.commands.executeCommand("failsafe.bootstrap");
    this.view?.webview.postMessage({ type: "initialize.complete" }); // NEW
  } else {
    vscode.window.showWarningMessage("...");
  }
  break;
}
```

```js
// Inside the webview <script>:
initBtn?.addEventListener('click', () => {
  const isOrganize = initBtn.textContent === 'Organize';
  vscode.postMessage({ command: isOrganize ? 'organize' : 'initialize' });
  // Removed: optimistic rename.
});

window.addEventListener('message', (event) => {
  if (event.data?.type === 'initialize.complete' && initBtn) {
    initBtn.textContent = 'Organize';
    initBtn.title = 'Organize Workspace Structure';
    vscode.setState({ ...vscode.getState(), initDone: true });
  }
  // ...existing handler for failsafe.openPopout
});
```

### Fix B — contextual summary (defensive)

`FailSafe/extension/src/extension/bootstrapWorkspace.ts` `assembleReport`:

```typescript
} else {
  const userDeferred = deferred.some((s) => s.detail === "user deferred");
  if (userDeferred) {
    summary = "Bootstrap paused (run Initialize again when ready to install qor-logic)";
  } else {
    summary = `Bootstrap: ${deferred.length} step(s) deferred`;
  }
}
```

Makes the user-visible message context-aware so that "user clicked Later" reads as the expected outcome, not as an alarming partial failure.

### Fix C — regression test (process)

Add a vscode-test integration spec at `src/test/extension/sidebar-initialize-rename.test.ts` that:
1. Activates the extension in a vscode-test harness.
2. Resolves the `FailSafeSidebarProvider` via `getCommands`/webview API.
3. Posts `command: 'initialize'`; awaits the host's reply.
4. Asserts the webview state mutation order: bootstrap completes → reply posted → only then would the rename apply.

This is a per-feature test descriptor (per `feedback_per_feature_tdd.md`) for a UI-host integration; requires a plan + audit cycle.

## Routing

This debug cycle does NOT apply any fix automatically. Per `feedback_no_ship_without_approval.md`, source edits to FailSafeSidebarProvider.ts + bootstrapWorkspace.ts require operator authorization or a new SHIELD plan/audit/implement cycle. The fixes are documented above as ready-to-implement proposals.

**Severity**: L1 UX misattribution. The deployed extension is functionally correct (clicking Organize does NOT invoke bootstrap; the popup is a delayed completion notification of an earlier Initialize click). No data integrity or security impact.

**Next-skill recommendation**: `/qor-plan` for a small UX-hotfix scoping Fixes A + B together; or operator-accepts the WAI behavior with a documentation note explaining the timing.

## Verification path the operator can run NOW

Now that `dist/extension/main.js` is fresh:

1. **Reload the FailSafe extension** (`Developer: Reload Window` in VS Code, or fully restart).
2. **Confirm activation outputChannel** shows `[bootstrap-on-activation] Bootstrap: 1 step(s) deferred` (this is expected behavior; activation runs silent bootstrap; pip install is rightfully deferred).
3. **Click the sidebar button** when it reads "Initialize". Wait for the interactive popup; click "Later" on pip install. The popup `Bootstrap: 1 step(s) deferred` will appear. This is by-design — operator deferred pip install.
4. **Wait for the popup to dismiss** (auto-dismiss after a few seconds, or click x). The button now reads "Organize".
5. **Click the button labeled "Organize"**. A QuickPick should appear showing organize proposals (or "workspace already tidy" in the outputChannel if nothing to do). **No bootstrap popup should appear** at this point.

If step 5 still produces a bootstrap popup, the build is somehow still mis-targeted; report back with the popup contents + timestamp and the agent will deepen the trace.

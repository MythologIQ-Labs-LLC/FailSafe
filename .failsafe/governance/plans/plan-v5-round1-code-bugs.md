# Plan: v5.0.0 Round 1 — Code Bugs

**Issues closed:** #46, #47, #48
**Tracker:** #63
**Plan author:** /qor-plan, 2026-04-27
**Status:** implementation-ready

## Open Questions

1. **Backward-compat for `failsafe.openFailSafeProDownload`** — issue #46 suggestion says keep as alias and deprecate. Project memory says "no backwards-compatibility hacks." Default in this plan: hard rename to `failsafe.openFailSafeProAbout`, no alias. The command is unreleased (only in v5 pre-merge), so no users have keybindings against it yet.
2. **Should the extension still register a `FailSafe: Download FailSafe Pro` command?** Issue #46 says "remove direct extension UI references to the download URL." Default: no — the learn page has its own Download button, that's the canonical action surface. Keep `FAILSAFE_PRO_DOWNLOAD_URL` as a constant for the drift-guard test only.
3. **Where to surface the `lastInstallReport` state for #48** — Settings card alone, or also broadcast via `/api/hub`? Default: Settings card webview state only (broadcast on mutation). The hub snapshot remains the source of truth for `bootstrapState.skillsInstalled`.

## Affected Surfaces (cross-phase index)

```text
NEW src/test/extension/about-pro-command.test.ts
NEW src/test/roadmap/operations-phase-progress.test.ts
NEW src/test/extension/install-skills-handler-progress.test.ts

MOD src/shared/constants.ts                          # split FAILSAFE_PRO_ABOUT_URL + DOWNLOAD_URL
MOD src/extension/commands.ts                        # rename command, point to ABOUT URL
MOD src/extension/installSkillsHandler.ts            # progressive report shape; emit hub.refresh
MOD src/extension/bootstrapServers.ts                # pass progress callback to handler
MOD src/test/shared/constants.test.ts                # both URLs asserted; rename guard
MOD src/test/docs/v5-coherence.test.ts               # update command name + URL match
MOD src/test/extension/installSkillsHandler.test.ts  # progress callback contract
MOD src/roadmap/ConsoleServer.ts                     # broadcast `skills.install.progress` + `hub.refresh`
MOD src/roadmap/ui/modules/operations.js             # use normalizePhaseProgress() helper
MOD src/roadmap/ui/modules/settings.js               # render progressive steps; disable button while running
MOD package.json                                     # rename command title + activation event
MOD FailSafe/extension/CHANGELOG.md                  # v5.0.0 entry: 3 fixed bullets
MOD CHANGELOG.md                                     # mirror
MOD FailSafe/extension/docs/v5/PRO_INTEGRATION.md    # update command name + URL roles
```

No deletions. Three new test files. No new dependencies.

---

## Phase 1 — URL & command semantic fix (#46)

**Goal:** "About FailSafe Pro" anywhere in the extension opens the learn page (`/products/failsafe-pro`). The download URL becomes a constant referenced only by the drift-guard test, not by any UI surface.

### Unit Tests (write first)

- `src/test/extension/about-pro-command.test.ts` (new)
  - `failsafe.openFailSafeProAbout` is registered on activation.
  - Executing it calls `vscode.env.openExternal(Uri.parse(FAILSAFE_PRO_ABOUT_URL))`.
  - The old name `failsafe.openFailSafeProDownload` is **not** registered.
- `src/test/shared/constants.test.ts` (extend)
  - `FAILSAFE_PRO_ABOUT_URL` equals `https://mythologiq.studio/products/failsafe-pro`.
  - `FAILSAFE_PRO_DOWNLOAD_URL` equals `https://mythologiq.studio/products/failsafe-download`.
  - Both URLs use https.
- `src/test/docs/v5-coherence.test.ts` (modify)
  - Asserts `failsafe.openFailSafeProAbout` is the registered command (not the old name).
  - Asserts root README links to `/products/failsafe-pro` exactly once.

### Changes

`src/shared/constants.ts`:

```ts
export const FAILSAFE_PRO_ABOUT_URL = "https://mythologiq.studio/products/failsafe-pro";
export const FAILSAFE_PRO_DOWNLOAD_URL = "https://mythologiq.studio/products/failsafe-download";
```

`src/extension/commands.ts`:

```ts
context.subscriptions.push(
  vscode.commands.registerCommand("failsafe.openFailSafeProAbout", async () => {
    await vscode.env.openExternal(vscode.Uri.parse(FAILSAFE_PRO_ABOUT_URL));
  }),
);
```

`package.json`:

```json
{ "command": "failsafe.openFailSafeProAbout", "title": "FailSafe: About FailSafe Pro" }
```

Activation event update: `"onCommand:failsafe.openFailSafeProAbout"`.

`src/roadmap/ui/modules/settings.js`:

```js
window.location.href = 'command:failsafe.openFailSafeProAbout';
```

(Settings card button label stays "About FailSafe Pro".)

`docs/v5/PRO_INTEGRATION.md`: update command name; clarify that the extension exposes only the ABOUT URL; the learn page has its own Download button.

### CI / validation

```bash
cd FailSafe/extension
npm run lint
npm run compile
npx vscode-test --extensionDevelopmentPath . --extensionTestsPath ./out/test/suite/index
```

Manual: command palette → "FailSafe: About FailSafe Pro" opens `/products/failsafe-pro`.

---

## Phase 2 — Operations phase-progress normalization (#47)

**Goal:** `operations.js` never renders a completed-greater-than-planned ratio. Math is centralized in a tested helper.

### Unit Tests (write first)

- `src/test/roadmap/operations-phase-progress.test.ts` (new)
  - `normalizePhaseProgress({ plansStarted: 0, sessionsCompleted: 4 })` returns `{ planned: 4, completed: 4, adherence: 100 }`.
  - `normalizePhaseProgress({ plansStarted: 120, sessionsCompleted: 53 })` returns `{ planned: 120, completed: 53, adherence: 44 }`.
  - `normalizePhaseProgress({ plansStarted: 0, sessionsCompleted: 0 })` returns `{ planned: 0, completed: 0, adherence: 0 }`.
  - `normalizePhaseProgress(null)` returns the all-zero shape (no throw).
  - `normalizePhaseProgress({ plansStarted: 5, sessionsCompleted: 5 })` returns `{ planned: 5, completed: 5, adherence: 100 }`.
  - `normalizePhaseProgress({ plansStarted: 'bad', sessionsCompleted: '4' })` coerces to numbers (4 / 4 / 100), no NaN propagation.

### Changes

Move `normalizePhaseProgress` to a small JS module:

`src/roadmap/ui/modules/phase-progress.js` (new):

```js
export function normalizePhaseProgress(summary) {
  const completed = Number(summary?.sessionsCompleted ?? 0) || 0;
  const rawPlanned = Number(summary?.plansStarted ?? 0) || 0;
  const planned = Math.max(rawPlanned, completed);
  const adherence = planned > 0 ? Math.round((completed / planned) * 100) : 0;
  return { planned, completed, adherence };
}
```

`src/roadmap/ui/modules/operations.js`:

```js
import { normalizePhaseProgress } from './phase-progress.js';
// ...
renderMetrics(run, checks) {
  const total = checks.length;
  const passed = checks.filter(c => c.policyVerdict !== 'VIOLATION').length;
  const rate = total ? Math.round((passed / total) * 100) : 0;
  const phases = normalizePhaseProgress(this.roadmap?.ledgerSummary);
  // ...
  return `
    <div class="cc-grid-4" style="margin-bottom:16px">
      ${this.metricCard('Phases', `${phases.completed} / ${phases.planned}`, 'Completed vs Planned')}
      ${this.metricCard('Checkpoints', String(total), 'Total recorded')}
      ${this.metricCard('Pass Rate', `${rate}%`, `${passed} of ${total} passed`)}
      ${this.metricCard('Adherence', `${phases.adherence}%`, this.deviationBar(phases.adherence))}
    </div>`;
}
```

### CI / validation

Same as Phase 1.

Manual: open Operations tab on FailSafe repo workspace; Phases shows `53 / 120` (or current values). Open in a workspace with substantiations but no gates — Phases shows `N / N` (100% adherence).

---

## Phase 3 — Install button feedback + state refresh (#48)

**Goal:** clicking "Install QorLogic Skills" produces visible progress, surfaces final destinations + counts, refreshes hub data on success, and disables the button while running. The Get Started banner disappears after a successful install without a page reload.

### Unit Tests (write first)

- `src/test/extension/install-skills-handler-progress.test.ts` (new)
  - Handler accepts a `{ onProgress, onComplete }` callback bag and emits one event per ingest step (resolve-python, pip-install, qorlogic-install per host, provenance-synthesis, refresh).
  - Each step has shape `{ id, status: 'pending' | 'running' | 'success' | 'error', label, command?, path?, count? }`.
  - On success, the final report carries `{ ok: true, totalInstalled: N, destinations: [path, ...] }`.
  - On per-host failure, sibling hosts continue; report aggregates failures with `{ ok: false, failures: [{ host, error }] }`.
- `src/test/extension/installSkillsHandler.test.ts` (modify existing)
  - When called without a progress callback, behavior matches v5.0.0 baseline (back-compat for tests not migrated yet).

### Changes

`src/extension/installSkillsHandler.ts` — extend to accept progress callback:

```ts
export interface InstallStep {
  id: 'resolve-python' | 'pip-install' | `qorlogic-install:${string}` | 'provenance' | 'refresh';
  status: 'pending' | 'running' | 'success' | 'error';
  label: string;
  command?: string;
  path?: string;
  count?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface InstallReport {
  ok: boolean;
  pythonPath?: string;
  packageVersion?: string;
  steps: InstallStep[];
  totalInstalled: number;
  destinations: string[];
  failures: Array<{ host: string; error: string }>;
}

export interface InstallCallbacks {
  onProgress?: (step: InstallStep) => void;
  onComplete?: (report: InstallReport) => void;
}

export function createInstallSkillsHandler(
  context: vscode.ExtensionContext,
  ingestor: QorLogicSkillIngestor,
  callbacks: InstallCallbacks = {},
): () => Promise<InstallReport> {
  // ... orchestrate ingestor + emit progress per step ...
}
```

`src/roadmap/ConsoleServer.ts` — wire progress broadcasts:

```ts
const handler = createInstallSkillsHandler(context, ingestor, {
  onProgress: (step) => this.broadcast({ type: 'skills.install.progress', step }),
  onComplete: (report) => {
    this.broadcast({ type: 'skills.install.complete', report });
    this.broadcast({ type: 'hub.refresh', reason: 'skills-installed' });
  },
});
this.consoleServer.setScaffoldCallback(handler);
```

`src/roadmap/ui/modules/settings.js` — handle progress events:

```js
this.installState = { running: false, steps: [], lastReport: null };

_onProgress(step) {
  // append/update step in this.installState.steps; re-render the QorLogic card.
}

_onComplete(report) {
  this.installState = { running: false, steps: report.steps, lastReport: report };
  this._renderQorLogicCard();
}
```

The card binds to messages `skills.install.progress` and `skills.install.complete` from the WebSocket. While `running === true`, the install button is disabled and shows "Installing...".

The "Get Started" banner is driven by `bootstrapState.skillsInstalled`. On `hub.refresh`, the webview re-fetches `/api/hub`, the banner re-evaluates, and disappears when `hasQorLogicProvenance(workspaceRoot)` flips to true.

### CI / validation

```bash
npm test
npx vscode-test --extensionDevelopmentPath . --extensionTestsPath ./out/test/suite/index
```

Manual:
1. Fresh workspace → click "Install QorLogic Skills" → button disables → 5 progress lines stream into the Settings card → banner disappears on success.
2. Disconnect network → click install → pip step shows error inline → button re-enables.
3. Click install again with hosts already populated → success path is fast (cached pip), skill ingestion still re-runs and refreshes UI.

---

## Aggregate verification (after all 3 phases)

```bash
cd FailSafe/extension
npm run lint
npm run compile
npx vscode-test --extensionDevelopmentPath . --extensionTestsPath ./out/test/suite/index
```

Per-phase test additions: +3, +6, +5 = **+14 new tests** (target: 759 → 773).

Manual smoke test:
- "FailSafe: About FailSafe Pro" command + Settings button both open `/products/failsafe-pro`.
- No code path opens `/products/failsafe-download` directly.
- Operations tab shows sane Phases ratio in 3 workspace flavors (FailSafe repo, fresh, ledger-only-with-substantiations).
- Install button: disabled while running, progressive status, hub refresh after success, banner gone.

CHANGELOG.md (root + extension): add "Fixed" subsection under v5.0.0 with three bullets crediting #46/#47/#48.

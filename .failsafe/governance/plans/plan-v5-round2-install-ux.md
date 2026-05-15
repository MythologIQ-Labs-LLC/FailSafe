# Plan: v5.0.0 Round 2 — Install UX (Transparency + Choice)

**Issues closed:** #49, #50
**Tracker:** #63
**Depends on:** Plan A (#48 lays the progress callback infrastructure that this plan extends)
**Plan author:** /qor-plan, 2026-04-27
**Status:** implementation-ready

## Open Questions

1. **Default-path command** — should we register a parallel `failsafe.installQorLogicSkillsDefaults` command that bypasses the QuickPick (for automation / scripts)? Default in this plan: yes, but routed through the same handler with `mode: 'defaults'`.
2. **Persistence key namespace** — issue #50 suggests `failsafe.installSkills.lastOptions` in `workspaceState`. Confirm naming; default to that exact key.
3. **Install ceremony reuse** — issue #50 mentions a possible existing `GovernanceCeremony.showQuickPick()` pattern. Pre-implementation: grep the codebase; if such a pattern exists, reuse it. If not, the QuickPick lives in a small `resolveInstallSkillsOptions(context)` helper.

## Affected Surfaces

```text
NEW src/extension/installSkillsOptions.ts                       # resolveInstallSkillsOptions helper
NEW src/extension/installSkillsReport.ts                        # report-shape types + helpers
NEW src/test/extension/install-skills-options.test.ts
NEW src/test/extension/install-skills-report.test.ts

MOD src/extension/installSkillsHandler.ts                       # accept options + emit transparency report
MOD src/extension/bootstrapServers.ts                           # construct handler with `mode: 'prompt'`
MOD src/extension/commands.ts                                   # register defaults command
MOD src/roadmap/ConsoleServer.ts                                # broadcast install report; "Show Output" message
MOD src/roadmap/ui/modules/settings.js                          # render full report; "Show Output" button
MOD package.json                                                # new command contribution
MOD FailSafe/extension/CHANGELOG.md
MOD CHANGELOG.md
```

---

## Phase 1 — Install transparency report (#49)

**Goal:** every install action produces a structured report (interpreter, exact pip command, per-host qorlogic invocation, destinations, counts) that the Settings card displays inline. Failures stay visible until the next install. "Show Output" focuses the FailSafe (QorLogic) output channel.

### Unit Tests (write first)

- `src/test/extension/install-skills-report.test.ts` (new)
  - `runInstallStep({ phase, label }, fn)` returns `{ status: 'success', startedAt, completedAt, ... }` on resolution.
  - On thrown error: `{ status: 'error', error: err.message }` — no exception propagation.
  - Report aggregator reduces N invocations into `{ ok, totalInstalled, destinations, failures }`.
  - Report is JSON-serializable (no Error instances or circular refs).
- `src/test/extension/installSkillsHandler.test.ts` (extend)
  - With success: report contains 1 `python-probe` + 1 `pip-install` + N `qorlogic-install:<host>` + 1 `provenance` + 1 `refresh` invocation, in order.
  - With pip failure: report has `pip-install` status `error`; subsequent invocations skipped.
  - With one host failure: that invocation status `error`; sibling hosts succeed; report `ok: false` but `installedHosts.length > 0`.

### Changes

`src/extension/installSkillsReport.ts` (new):

```ts
export interface QorLogicInstallInvocation {
  phase: 'python-probe' | 'pip-install' | 'qorlogic-install' | 'provenance' | 'refresh';
  status: 'success' | 'error';
  command?: string;
  interpreter?: string;
  host?: string;
  scope?: 'repo' | 'global';
  destination?: string;
  installedCount?: number;
  version?: string;
  startedAt: string;
  completedAt: string;
  stdoutTail?: string;
  stderrTail?: string;
  error?: string;
}

export interface QorLogicInstallReport {
  ok: boolean;
  invocations: QorLogicInstallInvocation[];
  totalInstalled: number;
  destinations: string[];
  failures: Array<{ host: string; error: string }>;
}

export async function runInstallStep<T extends Partial<QorLogicInstallInvocation>>(
  step: T & { phase: QorLogicInstallInvocation['phase'] },
  fn: () => Promise<Partial<QorLogicInstallInvocation>>,
): Promise<QorLogicInstallInvocation> {
  const startedAt = new Date().toISOString();
  try {
    const result = await fn();
    return {
      ...step, ...result,
      status: 'success', startedAt, completedAt: new Date().toISOString(),
    } as QorLogicInstallInvocation;
  } catch (err) {
    return {
      ...step, status: 'error', startedAt, completedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    } as QorLogicInstallInvocation;
  }
}
```

`src/extension/installSkillsHandler.ts` — wrap each subprocess call with `runInstallStep`; aggregate into `QorLogicInstallReport`; pass to `onComplete` callback (Plan A Phase 3 wiring).

`src/roadmap/ui/modules/settings.js` — render the report:

```text
✓ Resolved Python: <interpreter> (source: probe)
✓ python -m pip install --upgrade qor-logic — 0.31.1 installed
✓ qorlogic install --host claude --scope repo — 17 skills → .claude/skills/
✓ qorlogic install --host codex --scope repo — 17 skills → .codex/skills/
✓ Provenance synthesized for 34 skills.

[ Show Output ]
```

Failure rendering keeps the failed step visible with the exact `command`, `error`, and `stderrTail` until the next install run replaces the report.

The "Show Output" button posts a webview message that ConsoleServer handles by calling `outputChannel.show(true)`.

### CI / validation

```bash
cd FailSafe/extension
npm test
```

Manual: trigger install — every step appears with its exact command and result. Force a pip failure (offline) — failed step + stderr remains visible after re-enable.

---

## Phase 2 — Host/scope QuickPick (#50)

**Goal:** install action prompts for hosts and scope (multi-select hosts, single-select scope), persists choices to `workspaceState`, and supports a defaults-only command for automation.

### Unit Tests (write first)

- `src/test/extension/install-skills-options.test.ts` (new)
  - `resolveInstallSkillsOptions(ctx)` shows two QuickPicks (hosts then scope) and returns `{ hosts, scope }` from the user's selections.
  - With no prior `workspaceState`: hosts default to `['claude','codex']` (pre-checked), scope `'repo'`.
  - After a successful resolution: `workspaceState` updated to the selection.
  - On host cancel: returns `undefined`; ingestor not invoked.
  - On scope cancel: returns `undefined`; ingestor not invoked.
  - Empty host selection: returns `undefined`.
  - Re-running pre-checks the prior selection.

### Changes

`src/extension/installSkillsOptions.ts` (new) — exact code from issue #50 suggestion (with stricter typing).

`src/extension/installSkillsHandler.ts`:

```ts
export type InstallMode = 'prompt' | 'defaults';

export function createInstallSkillsHandler(
  context: vscode.ExtensionContext,
  ingestor: QorLogicSkillIngestor,
  callbacks: InstallCallbacks = {},
  mode: InstallMode = 'prompt',
): () => Promise<QorLogicInstallReport | null> {
  return async () => {
    const options = mode === 'defaults'
      ? DEFAULT_OPTIONS
      : await resolveInstallSkillsOptions(context);
    if (!options) return null;
    return runInstall(ingestor, options, callbacks);
  };
}
```

`src/extension/bootstrapServers.ts` — pass `'prompt'` mode to the default handler.

`src/extension/commands.ts` — register defaults command:

```ts
context.subscriptions.push(
  vscode.commands.registerCommand("failsafe.installQorLogicSkillsDefaults", async () => {
    const handler = createInstallSkillsHandler(context, skillIngestor, {}, 'defaults');
    await handler();
  }),
);
```

`package.json` adds:

```json
{
  "command": "failsafe.installQorLogicSkillsDefaults",
  "title": "FailSafe: Install QorLogic Skills (defaults)"
}
```

The Settings card "Install QorLogic Skills" button continues to invoke the prompt-mode handler via the existing scaffold-skills flow.

### CI / validation

Same as Phase 1.

Manual:
1. Fresh workspace → click "Install QorLogic Skills" → host QuickPick appears with `claude` + `codex` pre-checked → scope QuickPick → install runs.
2. Re-run → prior selection pre-checked.
3. Cancel host or scope mid-prompt → no install runs.
4. Run `FailSafe: Install QorLogic Skills (defaults)` from the command palette → no prompts, install runs with defaults.

---

## Aggregate verification

```bash
cd FailSafe/extension
npm run lint
npm run compile
npx vscode-test --extensionDevelopmentPath . --extensionTestsPath ./out/test/suite/index
```

Per-phase additions: +6, +6 = **+12 new tests** (target: 773 → 785 after Plan A + B).

CHANGELOG.md (root + extension): under v5.0.0 "Added" — install transparency + host/scope prompt.

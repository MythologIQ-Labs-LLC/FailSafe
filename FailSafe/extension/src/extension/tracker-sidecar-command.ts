// registerGovernanceSidecarCommand + wireGovernanceSidecarAutoEmit (GH #194; A.2).
//
// Two triggers over one pure core (governance-sidecar.ts emitGovernanceSidecar):
//   1. `failsafe.emitGovernanceSidecar` command — always available, manual on-demand emit.
//   2. opt-in WorkspaceMutationBus auto-emit — when `failsafe.tracker.emitGovernanceSidecar`
//      is true, re-emit on META_LEDGER / FEATURE_INDEX writes (the governance sidecar stays
//      in sync with the SHIELD lifecycle). Off by default: auto-writing a file into the
//      operator's repo is a side effect that warrants explicit consent.
//
// Mirrors the substrate-command.ts bus-watcher posture (debounced, degrade-safe, disposables
// pushed to context.subscriptions). The emit is idempotent (skip-if-unchanged), so no
// seed-state guard is needed — a no-op change yields `unchanged` with no write.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { WorkspaceMutationBus } from '../shared/WorkspaceMutationBus';
import {
  emitGovernanceSidecar,
  nodeSidecarDeps,
  GOVERNANCE_SIDECAR_RELPATH,
  type SidecarEmitResult,
} from '../roadmap/tracker/governance-sidecar';

const AUTO_EMIT_DEBOUNCE_MS = 1500;

function describe(result: SidecarEmitResult): string {
  const rel = GOVERNANCE_SIDECAR_RELPATH; // already a POSIX workspace-relative key
  switch (result.status) {
    case 'written':
      return `Emitted ${rel} — ${result.counts?.rcs ?? 0} releases, `
        + `${result.counts?.verticals ?? 0} verticals, ${result.counts?.decisions ?? 0} decisions.`;
    case 'unchanged':
      return `${rel} already up to date with the governance ledger.`;
    case 'skipped-no-governance':
      return `No docs/META_LEDGER.md — nothing to project (ungoverned repo; use "Generate Tracker Manifest" instead).`;
    default:
      return `Could not emit ${rel}: ${result.reason ?? 'unknown error'}.`;
  }
}

/** Register the on-demand `failsafe.emitGovernanceSidecar` command. */
export function registerGovernanceSidecarCommand(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.emitGovernanceSidecar', () => {
      const result = emitGovernanceSidecar(nodeSidecarDeps(workspaceRoot));
      const msg = describe(result);
      if (result.status === 'error') {
        vscode.window.showWarningMessage(`FailSafe: ${msg}`);
      } else {
        vscode.window.showInformationMessage(`FailSafe: ${msg}`);
      }
    }),
  );
}

/**
 * Wire opt-in auto-emit: when `failsafe.tracker.emitGovernanceSidecar` is enabled, re-emit
 * the sidecar whenever docs/META_LEDGER.md or docs/FEATURE_INDEX.md change. No-op (and no
 * watchers registered) when the setting is off. Degrade-safe: missing files are simply not
 * watched (WorkspaceMutationBus returns a no-op Disposable).
 */
export function wireGovernanceSidecarAutoEmit(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  mutationBus: WorkspaceMutationBus,
  config: Pick<vscode.WorkspaceConfiguration, 'get'> = vscode.workspace.getConfiguration('failsafe'),
): void {
  if (config.get<boolean>('tracker.emitGovernanceSidecar') !== true) return;

  const deps = nodeSidecarDeps(workspaceRoot);
  const onMutation = (): void => { emitGovernanceSidecar(deps); };

  for (const rel of [path.join('docs', 'META_LEDGER.md'), path.join('docs', 'FEATURE_INDEX.md')]) {
    const abs = path.join(workspaceRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const disposable = mutationBus.registerWatcher(abs, onMutation, AUTO_EMIT_DEBOUNCE_MS);
    context.subscriptions.push({ dispose: () => disposable.dispose() });
  }
}

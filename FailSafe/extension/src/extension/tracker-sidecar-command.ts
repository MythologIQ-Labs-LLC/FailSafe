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
import type { ConsumerReadOptions } from '../qorlogic/consumer/consumer-adapter';

const AUTO_EMIT_DEBOUNCE_MS = 1500;

/** True when the result needs operator attention beyond a routine info toast (#233). */
function needsAttention(result: SidecarEmitResult): boolean {
  return result.status === 'error' || result.status === 'skipped-ledger-untrusted' || result.ledgerState === 'stale';
}

function describe(result: SidecarEmitResult): string {
  const rel = GOVERNANCE_SIDECAR_RELPATH; // already a POSIX workspace-relative key
  // #233: `stale` is still consumed (the persisted sidecar itself carries the caveat in its
  // banner — see serializeGovernanceSidecar), but the operator-facing message must not read
  // identically to a routine fresh emit either.
  const staleSuffix = result.ledgerState === 'stale'
    ? ` STALE SOURCE: ${result.reason ?? 'docs/META_LEDGER.md is older than the configured freshness threshold.'}`
    : '';
  switch (result.status) {
    case 'written':
      return `Emitted ${rel} — ${result.counts?.rcs ?? 0} releases, ${result.counts?.programs ?? 0} programs, `
        + `${result.counts?.verticals ?? 0} verticals, ${result.counts?.decisions ?? 0} decisions.${staleSuffix}`;
    case 'unchanged':
      return `${rel} already up to date with the governance ledger.${staleSuffix}`;
    case 'skipped-no-governance':
      return `No docs/META_LEDGER.md — nothing to project (ungoverned repo; use "Generate Tracker Manifest" instead).`;
    case 'skipped-ledger-untrusted':
      return `docs/META_LEDGER.md exists but is ${result.ledgerState ?? 'untrusted'} — nothing emitted: `
        + `${result.reason ?? 'unknown reason'}.`;
    default:
      return `Could not emit ${rel}: ${result.reason ?? 'unknown error'}.`;
  }
}

/** Register the on-demand `failsafe.emitGovernanceSidecar` command.
 *
 * `getOpts`, when supplied, is called fresh on every invocation (not captured once at
 * registration) so a real caller can back it with a cache that refreshes independently —
 * the same "resolve once per rebuild, not per call" posture `HubSnapshotService` already
 * uses for the async B197 verifier. No caller supplies one today: wiring a live
 * `QorLogicVersionStatus` here needs main.ts to construct/share a cache before this command
 * registers (currently `bootstrapServers.ts`'s installer ref is built *after* this point in
 * activation), which is an activation-sequencing decision, not a mechanical one — see #233 /
 * Myth-Tech-Forge#212 review discussion. Omitting `getOpts` reproduces today's exact
 * behavior: no versionStatus/maxAgeMs, so unsupported/stale stay unreachable here.
 */
export function registerGovernanceSidecarCommand(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  getOpts?: () => ConsumerReadOptions | undefined,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.emitGovernanceSidecar', () => {
      const result = emitGovernanceSidecar(nodeSidecarDeps(workspaceRoot), getOpts?.());
      const msg = describe(result);
      if (needsAttention(result)) {
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
 * watched (WorkspaceMutationBus returns a no-op Disposable). `getOpts` — see
 * `registerGovernanceSidecarCommand`'s doc — is likewise resolved fresh per mutation, not
 * captured once; no caller supplies one today.
 */
export function wireGovernanceSidecarAutoEmit(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  mutationBus: WorkspaceMutationBus,
  config: Pick<vscode.WorkspaceConfiguration, 'get'> = vscode.workspace.getConfiguration('failsafe'),
  getOpts?: () => ConsumerReadOptions | undefined,
): void {
  if (config.get<boolean>('tracker.emitGovernanceSidecar') !== true) return;

  const deps = nodeSidecarDeps(workspaceRoot);
  const onMutation = (): void => { emitGovernanceSidecar(deps, getOpts?.()); };

  for (const rel of [path.join('docs', 'META_LEDGER.md'), path.join('docs', 'FEATURE_INDEX.md')]) {
    const abs = path.join(workspaceRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const disposable = mutationBus.registerWatcher(abs, onMutation, AUTO_EMIT_DEBOUNCE_MS);
    context.subscriptions.push({ dispose: () => disposable.dispose() });
  }
}

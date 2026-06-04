// Standalone-process governance-mode contract (GH #172 Part 2). The ACP proxy
// runs as a SEPARATE process (no VS Code runtime), so it cannot read
// `governance.mode` from VS Code settings. Instead the extension MIRRORS the
// current mode to `.failsafe/governance/runtime-mode.json`, which the proxy reads.
//
// Contract chosen by evidence (matches the WorkspaceMutationBus substrate +
// FailSafe-Pro-coexistence-via-shared-filesystem, no IPC). File shape:
//   { "mode": "observe" | "assist" | "enforce" }
//
// FAIL-SAFE DEFAULT: a missing/unreadable/malformed mirror resolves to "observe"
// — identical to EnforcementEngine.getGovernanceModeState's own default. observe
// never withholds, and the governor's B3 surfacing records enforcing=false, so a
// degraded mirror can never silently present an enforced grant; it degrades to
// transparent monitoring, never to a false sense of enforcement.

import * as fs from 'fs';
import * as path from 'path';
import type { GovernanceMode } from '../../../../governance/types';

const VALID_MODES: ReadonlySet<string> = new Set(['observe', 'assist', 'enforce']);

/** Absolute path to the mode mirror for a workspace. */
export function runtimeModePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.failsafe', 'governance', 'runtime-mode.json');
}

/** Read the mirrored governance mode. Missing/malformed → "observe" (fail-safe). */
export function readRuntimeMode(workspaceRoot: string): GovernanceMode {
  try {
    const raw = fs.readFileSync(runtimeModePath(workspaceRoot), 'utf8');
    const parsed = JSON.parse(raw) as { mode?: unknown };
    if (typeof parsed.mode === 'string' && VALID_MODES.has(parsed.mode)) {
      return parsed.mode as GovernanceMode;
    }
  } catch {
    /* missing/unreadable/malformed → fall through to the safe default */
  }
  return 'observe';
}

/** Mirror the current governance mode to disk (atomic temp+rename). Used by the
 *  extension-side writer and by tests. Creates the governance dir if absent. */
export function writeRuntimeMode(workspaceRoot: string, mode: GovernanceMode): void {
  const target = runtimeModePath(workspaceRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ mode }, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, target);
}

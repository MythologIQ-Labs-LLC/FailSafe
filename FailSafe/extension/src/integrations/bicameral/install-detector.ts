// Bicameral install-state detector + spawn-boundary input validator.
// Plan: docs/plan-qor-bicameral-mcp-integration.md Phase 1.

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BicameralInstallProbe, BicameralInstallState } from './types';

const VERSION_TIMEOUT_MS = 3000;
const SAFE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const VERSION_RE = /(\d+\.\d+\.\d+(?:[A-Za-z0-9.-]*)?)/;

/**
 * Operator-supplied command validator for the spawn boundary.
 * Accepts bare executable names OR absolute paths under the user's home tree.
 * Rejects shell metacharacters, path traversal, and unanchored relative paths.
 * Closes OWASP A03 (injection) for the bicameral-mcp spawn surface.
 */
export function isSafeBicameralCommand(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
    return false;
  }
  if (SAFE_NAME_RE.test(value)) {
    return true;
  }
  if (!path.isAbsolute(value)) {
    return false;
  }
  const normalized = path.normalize(value);
  if (normalized.split(path.sep).includes('..')) {
    return false;
  }
  const home = os.homedir();
  if (!home) return false;
  const rel = path.relative(home, normalized);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function classifyConfigured(workspaceRoot: string): { configured: boolean; configPath: string } {
  const configPath = path.join(workspaceRoot, '.bicameral', 'config.yaml');
  return { configured: fs.existsSync(configPath), configPath };
}

interface ProbeOptions {
  command: string;
  workspaceRoot: string;
  timeoutMs?: number;
}

/**
 * Probe install state by:
 *   1. Running `<command> --version` (ENOENT -> not-installed; success -> at least installed).
 *   2. Checking `<workspaceRoot>/.bicameral/config.yaml` for configured/running.
 * Never throws. Defaults to `not-installed` on any error per fail-closed posture.
 */
export async function probeInstallState(opts: ProbeOptions): Promise<BicameralInstallProbe> {
  const { command, workspaceRoot } = opts;
  const timeoutMs = opts.timeoutMs ?? VERSION_TIMEOUT_MS;

  if (!isSafeBicameralCommand(command)) {
    return { state: 'not-installed' };
  }

  const versionInfo = await runVersionProbe(command, timeoutMs);
  if (versionInfo.state === 'not-installed') {
    return { state: 'not-installed' };
  }

  const { configured, configPath } = classifyConfigured(workspaceRoot);
  const state: BicameralInstallState = configured ? 'configured-not-running' : 'installed-not-configured';
  return { state, version: versionInfo.version, configPath };
}

function runVersionProbe(command: string, timeoutMs: number): Promise<{ state: 'installed' | 'not-installed'; version?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v: { state: 'installed' | 'not-installed'; version?: string }) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    let child;
    try {
      child = spawn(command, ['--version'], { shell: false });
    } catch {
      settle({ state: 'not-installed' });
      return;
    }
    let stdout = '';
    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.on('error', () => settle({ state: 'not-installed' }));
    child.on('close', (code) => {
      if (code !== 0) { settle({ state: 'not-installed' }); return; }
      const m = stdout.match(VERSION_RE);
      settle({ state: 'installed', version: m ? m[1] : undefined });
    });
    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      settle({ state: 'not-installed' });
    }, timeoutMs);
  });
}

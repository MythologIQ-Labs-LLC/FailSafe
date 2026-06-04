// Operator-triggered Bicameral MCP install handler.
// Plan: docs/plan-qor-bicameral-mcp-integration.md Phase 1b.
// Runs `pip install bicameral-mcp` then `bicameral-mcp setup --mode {mode}`
// via list-form spawn (no shell:true). Mode is a literal-union enum so the
// argv cannot be poisoned by upstream string input.

import * as child_process from 'child_process';
import { isSafeBicameralCommandResolved, probeInstallState } from './install-detector';
import { InstallMode, InstallProgressEvent, InstallStep, BicameralInstallState } from './types';

const STDOUT_TAIL_BYTES = 2048;

/** B-INT-3: pinned upstream version range. Tool schemas are Beta-classified
 *  per the upstream README; a hard ceiling protects against silent breakage
 *  when the schema changes outside our tested surface. Bump as we validate
 *  newer releases. */
export const MIN_BICAMERAL_VERSION = '0.14.0';
export const MAX_BICAMERAL_VERSION = '0.16.0'; // exclusive
export const BICAMERAL_PIP_SPEC = 'bicameral-mcp>=0.14,<0.16';

/**
 * B-BIC-5: Sanitize raw stdout/stderr captured from the bicameral CLI before
 * it surfaces to the operator (Settings card + WebSocket broadcast). Strips
 * ANSI CSI sequences (SGR colors + cursor moves) plus C0 control characters
 * other than `\t`, `\n`, `\r`. Caps length to `maxLen` (preserves the trailing
 * bytes — recent output is the operator-relevant signal).
 *
 * Defensive against any future bicameral CLI release that emits color or
 * progress-bar escape codes which would otherwise render as garbage in the
 * operator's Settings card and pass through unbounded to subscribers.
 */
export function sanitizeStdoutTail(raw: string, maxLen = STDOUT_TAIL_BYTES): string {
  const stripped = String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*[mGKHF]/g, '')              // CSI sequences (SGR/cursor)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // C0 controls (preserves \t \n \r)
  return stripped.length > maxLen ? stripped.slice(-maxLen) : stripped;
}

export interface InstallHandlerOptions {
  workspaceRoot: string;
  pythonCommand?: string;       // default 'pip'
  bicameralCommand?: string;    // default 'bicameral-mcp'
  onProgress: (evt: InstallProgressEvent) => void;
  /** Test seam: override spawn to avoid real subprocesses. */
  spawn?: typeof child_process.spawn;
  /** Test seam: override the post-setup verify probe. */
  verifyState?: (workspaceRoot: string, command: string) => Promise<BicameralInstallState>;
  /** Interactive-terminal bridge (same shape as the AGT installer's runInTerminal).
   *  REQUIRED for team-mode setup, which performs an interactive Google Drive
   *  OAuth that cannot complete in the non-interactive spawn path (no TTY).
   *  When absent in team mode, the handler errors with operator guidance rather
   *  than hanging. FailSafe never reads/writes the OAuth token. */
  runInTerminal?: (name: string, command: string) => void;
  /** Per-step spawn timeout (ms). Defense-in-depth: kills a spawned child that
   *  never responds (e.g. a process blocked on an interactive prompt) so the
   *  install cannot hang indefinitely. Default 120000 (2 min). */
  stepTimeoutMs?: number;
}

const VALID_MODES: ReadonlySet<InstallMode> = new Set(['solo', 'team']);

/** Public: drive the full install. Returns final progress event. Always
 *  emits a final onProgress with done=true. */
export async function runBicameralInstall(
  opts: InstallHandlerOptions,
  mode: InstallMode,
): Promise<InstallProgressEvent> {
  if (!VALID_MODES.has(mode)) {
    return finish(opts, mode, [], `Unsupported install mode: ${String(mode)}`);
  }
  const pip = opts.pythonCommand ?? 'pip';
  const bicameral = opts.bicameralCommand ?? 'bicameral-mcp';
  // B-BIC-6: resolve symlinks before spawn — a path inside an allowed root that
  // resolves outside it is rejected here, before `runStep` reaches `spawn`.
  const [pipSafe, bicameralSafe] = await Promise.all([
    isSafeBicameralCommandResolved(pip),
    isSafeBicameralCommandResolved(bicameral),
  ]);
  if (!pipSafe || !bicameralSafe) {
    return finish(opts, mode, [], 'Install rejected: unsafe pip or bicameral command name');
  }

  const steps: InstallStep[] = [];
  emit(opts, mode, steps, false);

  // B-INT-3: pin version floor + ceiling. Upstream Bicameral tool schemas are
  // Beta-classified; a hard ceiling avoids silent breakage when the schema
  // changes outside our supported range.
  const pipResult = await runStep(opts, mode, steps, {
    phase: 'pip-install',
    command: `${pip} install '${BICAMERAL_PIP_SPEC}'`,
    bin: pip,
    args: ['install', BICAMERAL_PIP_SPEC],
  });
  if (!pipResult.ok) return finish(opts, mode, steps, pipResult.error || 'pip install failed');

  const setupCommand = `${bicameral} setup --mode ${mode}`;

  if (mode === 'team') {
    // Team setup performs an interactive Google Drive OAuth (browser + console
    // prompt). That CANNOT complete in the non-interactive spawn path (no TTY) —
    // it would block forever (GH #165). Route it through the integrated terminal
    // so the operator completes the OAuth in a real TTY, then re-probes via the
    // card's Refresh. FailSafe never touches the OAuth token
    // (~/.bicameral/google-drive-token.json). Verify is deferred because the
    // config is not done until the operator finishes the OAuth.
    const setupStep: InstallStep = { phase: 'setup', status: 'running', command: setupCommand };
    steps.push(setupStep);
    emit(opts, mode, steps, false);
    if (!opts.runInTerminal) {
      setupStep.status = 'error';
      setupStep.error = `Team setup needs an interactive terminal for the Google Drive OAuth. Run \`${setupCommand}\` in a terminal, then click Refresh.`;
      return finish(opts, mode, steps, setupStep.error);
    }
    opts.runInTerminal('Bicameral: team setup', setupCommand);
    setupStep.status = 'success';
    setupStep.stdoutTail = 'Complete the Google Drive OAuth in the opened terminal, then click Refresh to verify.';
    return finish(opts, mode, steps);
  }

  const setupResult = await runStep(opts, mode, steps, {
    phase: 'setup',
    command: setupCommand,
    bin: bicameral,
    args: ['setup', '--mode', mode],
  });
  if (!setupResult.ok) return finish(opts, mode, steps, setupResult.error || 'bicameral-mcp setup failed');

  return await runVerifyStep(opts, mode, steps, bicameral);
}

async function runVerifyStep(
  opts: InstallHandlerOptions,
  mode: InstallMode,
  steps: InstallStep[],
  bicameralCommand: string,
): Promise<InstallProgressEvent> {
  const verifyStep: InstallStep = { phase: 'verify', status: 'running' };
  steps.push(verifyStep);
  emit(opts, mode, steps, false);
  try {
    const state = opts.verifyState
      ? await opts.verifyState(opts.workspaceRoot, bicameralCommand)
      : (await probeInstallState({ command: bicameralCommand, workspaceRoot: opts.workspaceRoot })).state;
    if (state === 'configured-not-running' || state === 'running' || state === 'installed-not-configured') {
      verifyStep.status = 'success';
      return finish(opts, mode, steps);
    }
    verifyStep.status = 'error';
    verifyStep.error = `Post-install verify returned state=${state}`;
    return finish(opts, mode, steps, verifyStep.error);
  } catch (err) {
    verifyStep.status = 'error';
    verifyStep.error = String(err);
    return finish(opts, mode, steps, verifyStep.error);
  }
}

interface StepRequest { phase: InstallStep['phase']; command: string; bin: string; args: string[]; }

async function runStep(
  opts: InstallHandlerOptions,
  mode: InstallMode,
  steps: InstallStep[],
  req: StepRequest,
): Promise<{ ok: boolean; error?: string }> {
  const step: InstallStep = { phase: req.phase, status: 'running', command: req.command };
  steps.push(step);
  emit(opts, mode, steps, false);
  return new Promise((resolve) => {
    const spawnFn = opts.spawn ?? child_process.spawn;
    let child;
    try {
      child = spawnFn(req.bin, req.args, { shell: false, cwd: opts.workspaceRoot });
    } catch (err) {
      step.status = 'error';
      step.error = String(err);
      emit(opts, mode, steps, false);
      resolve({ ok: false, error: step.error });
      return;
    }
    // Defense-in-depth: a child that never closes (e.g. one blocked on an
    // interactive prompt) must not hang the install forever. `settled` guards
    // against a timeout/close race double-resolving or double-mutating the step.
    let settled = false;
    const timeoutMs = opts.stepTimeoutMs ?? 120_000;
    const settle = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      step.status = 'error';
      step.error = `${req.bin} timed out after ${timeoutMs}ms (no response — an interactive prompt may be blocking).`;
      try { child.kill(); } catch { /* best-effort */ }
      emit(opts, mode, steps, false);
      settle({ ok: false, error: step.error });
    }, timeoutMs);
    let tail = '';
    child.stdout?.on('data', (chunk) => {
      tail = (tail + String(chunk)).slice(-STDOUT_TAIL_BYTES);
      // B-BIC-5: sanitize ANSI + C0 controls before surfacing to UI/WebSocket.
      step.stdoutTail = sanitizeStdoutTail(tail);
      emit(opts, mode, steps, false);
    });
    child.stderr?.on('data', (chunk) => {
      tail = (tail + String(chunk)).slice(-STDOUT_TAIL_BYTES);
      step.stdoutTail = sanitizeStdoutTail(tail);
    });
    child.on('error', (err) => {
      if (settled) return;
      step.status = 'error';
      step.error = String(err);
      emit(opts, mode, steps, false);
      settle({ ok: false, error: step.error });
    });
    child.on('close', (code) => {
      if (settled) return;
      if (code === 0) {
        step.status = 'success';
        emit(opts, mode, steps, false);
        settle({ ok: true });
      } else {
        step.status = 'error';
        step.error = `${req.bin} exited with code ${code}`;
        emit(opts, mode, steps, false);
        settle({ ok: false, error: step.error });
      }
    });
  });
}

function emit(opts: InstallHandlerOptions, mode: InstallMode, steps: InstallStep[], done: boolean, error?: string) {
  opts.onProgress({ steps: [...steps], mode, done, ok: done && !error, error });
}

function finish(opts: InstallHandlerOptions, mode: InstallMode, steps: InstallStep[], error?: string): InstallProgressEvent {
  const evt: InstallProgressEvent = { steps: [...steps], mode, done: true, ok: !error, error };
  opts.onProgress(evt);
  return evt;
}

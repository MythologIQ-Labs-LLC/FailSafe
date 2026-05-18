// Operator-triggered Bicameral MCP install handler.
// Plan: docs/plan-qor-bicameral-mcp-integration.md Phase 1b.
// Runs `pip install bicameral-mcp` then `bicameral-mcp setup --mode {mode}`
// via list-form spawn (no shell:true). Mode is a literal-union enum so the
// argv cannot be poisoned by upstream string input.

import * as child_process from 'child_process';
import { isSafeBicameralCommand, probeInstallState } from './install-detector';
import { InstallMode, InstallProgressEvent, InstallStep, BicameralInstallState } from './types';

const STDOUT_TAIL_BYTES = 2048;

export interface InstallHandlerOptions {
  workspaceRoot: string;
  pythonCommand?: string;       // default 'pip'
  bicameralCommand?: string;    // default 'bicameral-mcp'
  onProgress: (evt: InstallProgressEvent) => void;
  /** Test seam: override spawn to avoid real subprocesses. */
  spawn?: typeof child_process.spawn;
  /** Test seam: override the post-setup verify probe. */
  verifyState?: (workspaceRoot: string, command: string) => Promise<BicameralInstallState>;
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
  if (!isSafeBicameralCommand(pip) || !isSafeBicameralCommand(bicameral)) {
    return finish(opts, mode, [], 'Install rejected: unsafe pip or bicameral command name');
  }

  const steps: InstallStep[] = [];
  emit(opts, mode, steps, false);

  const pipResult = await runStep(opts, mode, steps, {
    phase: 'pip-install',
    command: `${pip} install bicameral-mcp`,
    bin: pip,
    args: ['install', 'bicameral-mcp'],
  });
  if (!pipResult.ok) return finish(opts, mode, steps, pipResult.error || 'pip install failed');

  const setupResult = await runStep(opts, mode, steps, {
    phase: 'setup',
    command: `${bicameral} setup --mode ${mode}`,
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
    let tail = '';
    child.stdout?.on('data', (chunk) => {
      tail = (tail + String(chunk)).slice(-STDOUT_TAIL_BYTES);
      step.stdoutTail = tail;
      emit(opts, mode, steps, false);
    });
    child.stderr?.on('data', (chunk) => {
      tail = (tail + String(chunk)).slice(-STDOUT_TAIL_BYTES);
      step.stdoutTail = tail;
    });
    child.on('error', (err) => {
      step.status = 'error';
      step.error = String(err);
      emit(opts, mode, steps, false);
      resolve({ ok: false, error: step.error });
    });
    child.on('close', (code) => {
      if (code === 0) {
        step.status = 'success';
        emit(opts, mode, steps, false);
        resolve({ ok: true });
      } else {
        step.status = 'error';
        step.error = `${req.bin} exited with code ${code}`;
        emit(opts, mode, steps, false);
        resolve({ ok: false, error: step.error });
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

// Phase 1 — Pure-reducer contract for install-skills-progress.js.
// Pins applyProgressUpdate / applyCompletion / applyError behavior so the
// modal's WS-driven progress render can be reasoned about in isolation.
// SG-035: every test invokes the unit and asserts on returned values;
// a silent break of the reducer would fail these assertions.

import { strict as assert } from 'assert';
import {
  applyProgressUpdate,
  applyCompletion,
  applyError,
// @ts-expect-error JS module import in TS test context
} from '../../roadmap/ui/modules/install-skills-progress.js';

interface ProgressLine {
  phase: string;
  status: 'running' | 'success' | 'error';
  label?: string;
  detail?: string;
  error?: string;
}

interface ProgressState {
  lines: ProgressLine[];
  terminal: 'idle' | 'running' | 'done' | 'error';
  destinations?: string[];
  err?: { error: string; stderrTail?: string };
}

const emptyState = (): ProgressState => ({ lines: [], terminal: 'idle' });

suite('install-skills-progress reducer (Phase 1 contract)', () => {
  test('applyProgressUpdate appends a new line for a fresh phase + flips terminal to running', () => {
    const next: ProgressState = applyProgressUpdate(emptyState(), {
      phase: 'python-probe',
      status: 'running',
    });
    assert.equal(next.lines.length, 1, 'one line appended');
    assert.equal(next.lines[0].phase, 'python-probe');
    assert.equal(next.lines[0].status, 'running');
    assert.equal(next.terminal, 'running');
  });

  test('applyProgressUpdate mutates existing phase line instead of appending duplicate', () => {
    const first: ProgressState = applyProgressUpdate(emptyState(), {
      phase: 'python-probe',
      status: 'running',
    });
    const second: ProgressState = applyProgressUpdate(first, {
      phase: 'python-probe',
      status: 'success',
      interpreter: 'python3',
    });
    assert.equal(second.lines.length, 1, 'still one line — phase entry mutated, not appended');
    assert.equal(second.lines[0].status, 'success');
    assert.ok(
      (second.lines[0].detail ?? '').includes('python3'),
      `expected detail to mention python3, got: ${second.lines[0].detail}`,
    );
  });

  test('applyCompletion transitions terminal to done + exposes destinations on state', () => {
    const seed: ProgressState = {
      lines: [{ phase: 'refresh', status: 'success' }],
      terminal: 'running',
    };
    const done: ProgressState = applyCompletion(seed, {
      ok: true,
      totalInstalled: 47,
      destinations: ['.claude/skills/'],
    });
    assert.equal(done.terminal, 'done');
    assert.deepEqual(done.destinations, ['.claude/skills/']);
  });

  test('applyError flips terminal to error, captures the error, and preserves lines', () => {
    const seed: ProgressState = {
      lines: [{ phase: 'pip-install', status: 'running' }],
      terminal: 'running',
    };
    const failed: ProgressState = applyError(seed, {
      error: 'pip failed',
      stderrTail: 'ERROR: Could not find a version',
    });
    assert.equal(failed.terminal, 'error');
    assert.equal(failed.lines.length, 1, 'lines preserved so operator sees how far we got');
    assert.equal(failed.lines[0].phase, 'pip-install');
    assert.equal(failed.err?.error, 'pip failed');
  });

  test('full 5-phase happy-path sequence yields 5 success lines + terminal stays running until applyCompletion', () => {
    const sequence: Array<{
      phase: string;
      status: 'running' | 'success';
      interpreter?: string;
      command?: string;
      version?: string;
      host?: string;
      scope?: string;
      installedCount?: number;
      destination?: string;
      summary?: { hostsVerified: number; totalFiles: number };
    }> = [
      { phase: 'python-probe', status: 'running' },
      { phase: 'python-probe', status: 'success', interpreter: '/usr/bin/python3' },
      { phase: 'pip-install', status: 'running', command: 'pip install qor-logic' },
      { phase: 'pip-install', status: 'success', version: '0.31.1' },
      { phase: 'qorlogic-install', status: 'running', host: 'claude', scope: 'repo' },
      {
        phase: 'qorlogic-install', status: 'success', host: 'claude', scope: 'repo',
        installedCount: 17, destination: '.claude/skills/',
      },
      { phase: 'provenance', status: 'running' },
      { phase: 'provenance', status: 'success', summary: { hostsVerified: 1, totalFiles: 17 } },
      { phase: 'refresh', status: 'running' },
      { phase: 'refresh', status: 'success' },
    ];
    let state: ProgressState = emptyState();
    for (const ev of sequence) {
      state = applyProgressUpdate(state, ev);
    }
    assert.equal(state.lines.length, 5, 'one line per distinct phase');
    const phases = state.lines.map(l => l.phase);
    assert.deepEqual(phases, ['python-probe', 'pip-install', 'qorlogic-install', 'provenance', 'refresh']);
    assert.ok(state.lines.every(l => l.status === 'success'), 'all phases succeeded');
    assert.equal(state.terminal, 'running', 'terminal stays running until applyCompletion fires');
  });
});

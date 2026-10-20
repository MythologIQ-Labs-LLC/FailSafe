// Functional tests for CheckpointRoute (checkpoint list/detail/rollback).
// Routes were extracted from ConsoleServer; verify each branch + cap behavior
// + the rollback security gates.

import { strict as assert } from 'assert';
import { setupCheckpointRoutes } from '../../roadmap/routes/CheckpointRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp, invokeRemote } from './helpers/routeTestHarness';
import type { OperatorActionRequest, OperatorConfirmation } from '../../extension/operatorConfirmation';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { FailSafeRevertService } from '../../governance/revert/FailSafeRevertService';
import { GitResetService, type CommandRunner } from '../../governance/revert/GitResetService';
import {
  buildCheckpointRecord, persistCheckpoint, verifyCheckpointRecord, type CheckpointRecord,
} from '../../roadmap/services/CheckpointStore';

/** #514: a fake confirmer recording each dialog request and answering `result`. */
function confirmer(result: OperatorConfirmation): {
  confirm: (r: OperatorActionRequest) => Promise<OperatorConfirmation>;
  shown: OperatorActionRequest[];
} {
  const shown: OperatorActionRequest[] = [];
  return { shown, confirm: async (r) => { shown.push(r); return result; } };
}

interface Checkpoint { id: string; createdAt: string; checkpointType: string; }

/** #532 (plan-532c LD8a): fakes answer prepare with a fixed plan; the real-repo suite below uses the real service. */
const PLAN = {
  checkpointId: 'cp-1', target: 'a'.repeat(40), targetSubject: 'stable', targetDate: '2026-10-14T01:02:03Z',
  workTree: '/ws', branch: 'main', head: 'b'.repeat(40), leaving: 1,
};
const preparedPlan = async () => ({ ok: true, plan: PLAN });

function makeDeps(overrides: Partial<ApiRouteDeps> = {}): {
  deps: ApiRouteDeps;
  broadcasts: Array<Record<string, unknown>>;
} {
  const broadcasts: Array<Record<string, unknown>> = [];
  const deps = Object.assign({
    rejectIfRemote: () => false,
    broadcast: (data: Record<string, unknown>) => { broadcasts.push(data); },
    getRecentCheckpoints: () => [] as Checkpoint[],
    getCheckpointById: () => null,
    verifyCheckpointChain: () => true,
    revertService: null,
    confirmOperatorAction: async () => 'approved',
  } as Partial<ApiRouteDeps>, overrides) as ApiRouteDeps;
  return { deps, broadcasts };
}

suite('CheckpointRoute (FX list/detail + /api/actions/rollback)', () => {
  let harness: RouteHarness;
  teardown(async () => { if (harness) await harness.stop(); });

  test('GET /api/checkpoints — returns checkpoints + chain valid flag', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      getRecentCheckpoints: () => [
        { id: 'cp-1', createdAt: 't1', checkpointType: 'monitoring.resumed' },
        { id: 'cp-2', createdAt: 't2', checkpointType: 'monitoring.stopped' },
      ] as never,
      verifyCheckpointChain: () => true,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/checkpoints' });
    assert.equal(res.status, 200);
    assert.equal(res.body.checkpoints.length, 2);
    assert.equal(res.body.chainValid, true);
  });

  test('GET /api/checkpoints — limit query is parsed and capped at 200', async () => {
    let received: number | undefined;
    const app = makeApp();
    const { deps } = makeDeps({
      getRecentCheckpoints: (limit?: number) => { received = limit; return [] as never; },
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    await harness.request({ path: '/api/checkpoints?limit=500' });
    assert.equal(received, 200, 'limit should clamp to 200 max');
  });

  test('GET /api/checkpoints — invalid limit defaults to 50', async () => {
    let received: number | undefined;
    const app = makeApp();
    const { deps } = makeDeps({
      getRecentCheckpoints: (limit?: number) => { received = limit; return [] as never; },
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    await harness.request({ path: '/api/checkpoints?limit=notanumber' });
    assert.equal(received, 50);
  });

  test('GET /api/checkpoints — limit floor is 1', async () => {
    let received: number | undefined;
    const app = makeApp();
    const { deps } = makeDeps({
      getRecentCheckpoints: (limit?: number) => { received = limit; return [] as never; },
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    await harness.request({ path: '/api/checkpoints?limit=-5' });
    assert.equal(received, 1, 'limit should clamp to 1 minimum');
  });

  test('GET /api/checkpoints/:id — returns checkpoint when found', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      getCheckpointById: (id: string) => ({ id, checkpointType: 'sprint.start' }) as never,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ path: '/api/checkpoints/cp-42' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.checkpoint.id, 'cp-42');
  });

  test('GET /api/checkpoints/:id — non-loopback rejected (403)', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupCheckpointRoutes(app, deps);
    const captured = await invokeRemote(app, 'GET', '/api/checkpoints/cp-42');
    assert.equal(captured.statusCode, 403);
  });

  test('POST /api/actions/rollback — 503 when revertService is unavailable', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      revertService: null,
      getCheckpointById: (id: string) => ({ checkpointId: id, timestamp: 't' }) as never,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/rollback', body: { checkpointId: 'cp-1' },
    });
    assert.equal(res.status, 503);
    assert.match(String(res.body.error), /revert service unavailable/);
  });

  test('POST /api/actions/rollback — 400 when checkpointId missing', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      revertService: { prepare: preparedPlan, revert: async () => ({ success: true }) } as never,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/rollback', body: {} });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error), /checkpointId required/);
  });

  test('POST /api/actions/rollback — 404 when checkpoint not found, before any dialog', async () => {
    const app = makeApp();
    const c = confirmer('approved');
    const { deps } = makeDeps({
      revertService: { prepare: preparedPlan, revert: async () => ({ success: true }) } as never,
      getCheckpointById: () => null,
      confirmOperatorAction: c.confirm,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/rollback', body: { checkpointId: 'missing' },
    });
    assert.equal(res.status, 404);
    assert.match(String(res.body.error), /checkpoint not found/);
    assert.equal(c.shown.length, 0, 'no dialog for an unknown checkpoint');
  });

  test('#514 FX960 POST /api/actions/rollback — declined in VS Code returns 409 and revert is not called', async () => {
    let revertCalls = 0;
    const app = makeApp();
    const c = confirmer('declined');
    const { deps, broadcasts } = makeDeps({
      revertService: { prepare: preparedPlan, revert: async () => { revertCalls += 1; return { success: true }; } } as never,
      getCheckpointById: (id: string) => ({ checkpointId: id, checkpointType: 'sprint.start', timestamp: '2026-10-14T01:02:03Z' }) as never,
      confirmOperatorAction: c.confirm,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/rollback', body: { checkpointId: 'cp-9', reason: 'undo' },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.confirmation, 'declined');
    assert.equal(revertCalls, 0, 'revertService.revert not called');
    assert.equal(broadcasts.length, 0);
    // The dialog shows the stored checkpoint's id, type and timestamp.
    assert.equal(c.shown.length, 1);
    for (const part of ['cp-9', 'sprint.start', '2026-10-14T01:02:03Z', 'Reason (as requested): undo']) {
      assert.ok(c.shown[0].detail.includes(part), `detail has ${part}`);
    }
  });

  test('#514 FX960 POST /api/actions/rollback — busy returns 429 and unwired returns 503, revert not called', async () => {
    let revertCalls = 0;
    for (const [confirm, status] of [[confirmer('busy').confirm, 429], [undefined, 503]] as const) {
      const app = makeApp();
      const { deps } = makeDeps({
        revertService: { prepare: preparedPlan, revert: async () => { revertCalls += 1; return { success: true }; } } as never,
        getCheckpointById: (id: string) => ({ checkpointId: id, timestamp: 't' }) as never,
        confirmOperatorAction: confirm,
      });
      setupCheckpointRoutes(app, deps);
      const h = new RouteHarness(app);
      await h.start();
      try {
        const res = await h.request({ method: 'POST', path: '/api/actions/rollback', body: { checkpointId: 'cp-1' } });
        assert.equal(res.status, status);
      } finally {
        await h.stop();
      }
    }
    assert.equal(revertCalls, 0);
  });

  test('POST /api/actions/rollback — happy path calls revert + broadcasts hub.refresh', async () => {
    let revertCalled = false;
    let revertArgs: unknown = null;
    const app = makeApp();
    const { deps, broadcasts } = makeDeps({
      revertService: {
        prepare: preparedPlan,
        revert: async (req: unknown) => {
          revertCalled = true;
          revertArgs = req;
          return { success: true, steps: [] };
        },
      } as never,
      getCheckpointById: (id: string) => ({ id, checkpointType: 'sprint.start' }) as never,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/rollback',
      body: { checkpointId: 'cp-42', reason: 'rollback test' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(revertCalled);
    const args = revertArgs as { actor: string; reason: string; targetCheckpoint: { id: string } };
    assert.equal(args.actor, 'user.local');
    assert.equal(args.reason, 'rollback test');
    assert.equal(args.targetCheckpoint.id, 'cp-42');
    assert.ok(broadcasts.some((b) => b.type === 'hub.refresh'));
  });

  test('#514 FX960 POST /api/actions/rollback — the reason shown and the reason sealed are the same sanitized, 500-character text', async () => {
    let captured = '';
    const app = makeApp();
    const c = confirmer('approved');
    const { deps } = makeDeps({
      revertService: {
        prepare: preparedPlan,
        revert: async (req: unknown) => {
          captured = (req as { reason: string }).reason;
          return { success: true };
        },
      } as never,
      getCheckpointById: () => ({ checkpointId: 'cp-1', checkpointType: 'x' }) as never,
      confirmOperatorAction: c.confirm,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const raw = 'line one\nRequested by the operator\u202E' + 'r'.repeat(2000);
    await harness.request({
      method: 'POST', path: '/api/actions/rollback',
      body: { checkpointId: 'cp-1', reason: raw },
    });
    assert.equal(captured.length, 500);
    // eslint-disable-next-line no-control-regex
    assert.ok(!/[\u0000-\u001f\u202e]/.test(captured), 'control and bidi characters removed');
    assert.ok(captured.startsWith('line one Requested by the operator'));
    assert.ok(c.shown[0].detail.includes(`Reason (as requested): ${captured}`), 'shown text equals sealed text');
  });

  test('POST /api/actions/rollback — 500 when revert throws', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      revertService: {
        prepare: preparedPlan,
        revert: async () => { throw new Error('git reset failed'); },
      } as never,
      getCheckpointById: () => ({ id: 'cp-1', checkpointType: 'x' }) as never,
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({
      method: 'POST', path: '/api/actions/rollback', body: { checkpointId: 'cp-1' },
    });
    assert.equal(res.status, 500);
    assert.match(String(res.body.error), /git reset failed/);
  });

  test('POST /api/actions/rollback — non-loopback rejected (403)', async () => {
    const app = makeApp();
    const { deps } = makeDeps({
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
    });
    setupCheckpointRoutes(app, deps);
    const captured = await invokeRemote(app, 'POST', '/api/actions/rollback');
    assert.equal(captured.statusCode, 403);
  });
});

// #532 (plan-532c LD8a/LD10, B284): the Console rollback over a real temp git repository, the real
// GitResetService (through a recording runner that spawns git), the real FailSafeRevertService and
// a real memory checkpoint store. Every refusal leaves HEAD unchanged with no `reset` run; an
// approved rollback runs exactly one `git reset --keep` and lands HEAD on the checkpoint. K1: a
// tracked file the reset would change, edited after the last check, survives and the reset fails.
// K2: an edit to a tracked file the reset does not change survives. A branch switched in the final
// window is reported as a failure with the previous HEAD for recovery from the reflog.
suite('CheckpointRoute rollback on a real repository (#532 B284)', () => {
  let root = '';
  let harness: RouteHarness | null = null;
  let A = '';
  let B = '';
  let SIDE = '';

  function git(...args: string[]): string {
    const r = spawnSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return String(r.stdout).trim();
  }
  const write = (rel: string, text: string) => fs.writeFileSync(path.join(root, rel), text);

  setup(() => {
    root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-rollback-')));
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'FailSafe-Test');
    git('config', 'user.email', 'test@failsafe.invalid');
    write('f.txt', 'one\n');
    write('h.txt', 'same in both\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'stable state');
    A = git('rev-parse', 'HEAD');
    git('checkout', '-q', '-b', 'side');
    write('side.txt', 'side\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'side work');
    SIDE = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'main');
    write('f.txt', 'two\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'later work');
    B = git('rev-parse', 'HEAD');
  });
  teardown(async () => {
    if (harness) await harness.stop();
    harness = null;
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  });

  interface Rig {
    res: { status: number; body: any };
    shown: OperatorActionRequest[];
    resets: string[][];
  }

  /**
   * Record a checkpoint naming `target` in a memory store, wire the real services and POST the
   * rollback. `beforeReset` runs just before the reset spawn (after every prepare spawn).
   */
  async function rollback(opts: {
    target?: string; confirm?: OperatorConfirmation; onConfirm?: () => void; beforeReset?: () => void;
    failStatus?: boolean; tamper?: boolean;
  } = {}): Promise<Rig> {
    const memory: CheckpointRecord[] = [];
    const rec = buildCheckpointRecord({
      checkpointType: 'monitoring.resumed', actor: 'system', phase: 'plan', status: 'validated', policyVerdict: 'PASS', evidenceRefs: [], payload: {},
    }, new Date().toISOString(), 'run-1', null, memory, opts.target ?? A);
    persistCheckpoint(rec, null, memory);
    if (opts.tamper) memory[0] = { ...memory[0], gitHash: SIDE };
    const resets: string[][] = [];
    const runner: CommandRunner = async (_cmd, args) => {
      if (args[0] === 'reset') { opts.beforeReset?.(); resets.push(args); }
      if (opts.failStatus && args[0] === 'status') return { code: 128, stdout: '', stderr: 'fatal: index unreadable' };
      const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
      return { code: r.status ?? 1, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') };
    };
    const getCheckpoint = (id: string) => {
      const m = memory.find((r) => r.checkpointId === id);
      return m ? { checkpointId: m.checkpointId, gitHash: m.gitHash, timestamp: m.timestamp, phase: m.phase, status: m.status } : null;
    };
    const revertService = new FailSafeRevertService({
      getCheckpoint, gitService: new GitResetService(runner), purgeRagAfter: () => 0, recordRevertCheckpoint: () => 'revert-1',
      workspaceRoot: root, verifyCheckpoint: (id) => verifyCheckpointRecord(null, memory, id),
    });
    const shown: OperatorActionRequest[] = [];
    const app = makeApp();
    const { deps } = makeDeps({
      revertService: revertService as never,
      getCheckpointById: ((id: string) => getCheckpoint(id)) as never,
      confirmOperatorAction: async (r) => { shown.push(r); opts.onConfirm?.(); return opts.confirm ?? 'approved'; },
    });
    setupCheckpointRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: '/api/actions/rollback', body: { checkpointId: rec.checkpointId, reason: 'test' } });
    return { res, shown, resets };
  }

  test('declined: 409, no reset, HEAD unchanged', async () => {
    const r = await rollback({ confirm: 'declined' });
    assert.equal(r.res.status, 409);
    assert.equal(r.shown.length, 1);
    assert.deepEqual(r.resets, []);
    assert.equal(git('rev-parse', 'HEAD'), B);
  });

  test('a dirty tree, a failing git status, a non-ancestor target, a tampered row and an unknown commit are refused before the dialog with no reset', async () => {
    write('f.txt', 'dirty\n');
    let r = await rollback();
    assert.equal(r.res.status, 409, 'dirty');
    assert.match(String(r.res.body.error), /uncommitted/);
    git('checkout', '--', 'f.txt');
    await harness!.stop(); harness = null;
    const cases: Array<[string, Parameters<typeof rollback>[0], number, RegExp]> = [
      ['failing status', { failStatus: true }, 503, /git status/],
      ['non-ancestor', { target: SIDE }, 409, /not an ancestor/],
      ['tampered row', { tamper: true }, 409, /does not match its recorded hashes/],
      ['unknown commit', { target: 'unknown' }, 409, /did not record a commit/],
    ];
    for (const [name, opts, status, error] of cases) {
      r = await rollback(opts);
      assert.equal(r.res.status, status, `${name}: ${JSON.stringify(r.res.body)}`);
      assert.match(String(r.res.body.error), error, name);
      assert.equal(r.shown.length, 0, `${name}: no dialog`);
      assert.deepEqual(r.resets, [], `${name}: no reset`);
      assert.equal(git('rev-parse', 'HEAD'), B, `${name}: HEAD unchanged`);
      await harness!.stop(); harness = null;
    }
  });

  test('HEAD moved while the dialog was open: 409, no reset', async () => {
    const r = await rollback({ onConfirm: () => { write('n.txt', 'new\n'); git('add', 'n.txt'); git('commit', '-q', '-m', 'during dialog'); } });
    assert.equal(r.res.status, 409, JSON.stringify(r.res.body));
    assert.match(String(r.res.body.error), /changed after you confirmed/);
    assert.deepEqual(r.resets, []);
    assert.notEqual(git('rev-parse', 'HEAD'), A);
  });

  test('approved: exactly one reset --keep lands HEAD on the checkpoint; the dialog showed work tree, branch, HEAD, target and the count', async () => {
    const r = await rollback();
    assert.equal(r.res.status, 200, JSON.stringify(r.res.body));
    assert.equal(r.res.body.ok, true);
    assert.deepEqual(r.resets, [['reset', '--keep', A]]);
    assert.equal(git('rev-parse', 'HEAD'), A);
    assert.equal(git('symbolic-ref', '--short', 'HEAD'), 'main');
    const d = r.shown[0].detail;
    for (const want of [`Work tree: ${git('rev-parse', '--show-toplevel')}`, 'Branch: main', `Current HEAD: ${B}`,
      `Checkpoint commit: ${A} stable state`, 'Commits leaving the branch: 1', 'git reset --keep', 'reflog', 'Ignored files']) {
      assert.ok(d.includes(want), `dialog shows "${want}":\n${d}`);
    }
    assert.doesNotMatch(d, /Files changed since the checkpoint are reverted/);
  });

  test('K1: a tracked file the reset would change, edited (size changed) after the last check, survives; the reset fails and the route reports it', async () => {
    const edited = 'edited after the last check, longer than before\n';
    const r = await rollback({ beforeReset: () => write('f.txt', edited) });
    assert.equal(r.res.body.ok, false, JSON.stringify(r.res.body));
    assert.equal(r.resets.length, 1, 'exactly one reset attempt');
    assert.equal(fs.readFileSync(path.join(root, 'f.txt'), 'utf8'), edited, 'the edit survives byte for byte');
    assert.notEqual(edited.length, 'two\n'.length, 'the edit changes the file size');
    assert.equal(git('rev-parse', 'HEAD'), B, 'HEAD unchanged');
  });

  test('K2: an edit to a tracked file the reset does not change survives, and the reset lands', async () => {
    const edited = 'edited, unchanged between the commits\n';
    const r = await rollback({ beforeReset: () => write('h.txt', edited) });
    assert.equal(r.res.body.ok, true, JSON.stringify(r.res.body));
    assert.equal(fs.readFileSync(path.join(root, 'h.txt'), 'utf8'), edited);
    assert.equal(git('rev-parse', 'HEAD'), A);
  });

  test('a branch switched in the final window: the route reports failure with the previous HEAD for the reflog', async () => {
    git('branch', 'other', B);
    const r = await rollback({ beforeReset: () => git('checkout', '-q', 'other') });
    assert.equal(r.res.body.ok, false, JSON.stringify(r.res.body));
    assert.equal(r.res.body.result.previousHead, B);
    assert.match(String(r.res.body.result.error), /reflog/);
    assert.equal(git('rev-parse', 'main'), B, 'main was not moved');
  });
});

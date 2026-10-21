/**
 * C2 (plan-c2-chokidar, T3): the Sentinel file watcher's semantics, on the real SentinelDaemon and
 * the real chokidar watcher over a temp folder.
 *
 * Characterization: every row except the bracketed-root row must pass before the chokidar 4
 * migration (chokidar 3) and after it. They are the watch-semantics guard, not red-first evidence.
 * The bracketed-root row records a deliberate behaviour change (chokidar 3 read such a root as a
 * glob); its result on chokidar 3 is recorded as observed.
 */
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SentinelDaemon } from '../../sentinel/SentinelDaemon';
import { EventBus } from '../../shared/EventBus';

type RawEvent = [event: string, filePath: string];
type Watcher = {
  on: (event: string, fn: (...args: any[]) => void) => Watcher;
  emit: (event: string, ...args: unknown[]) => boolean;
  close: () => Promise<void>;
  getWatched: () => Record<string, string[]>;
  closed?: boolean;
  options: { usePolling?: boolean; atomic?: boolean | number };
};

const STABILITY_MS = 100; // SentinelDaemon's awaitWriteFinish.stabilityThreshold
const SCAN_MARGIN_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(cond: () => boolean, ms = 8000, what = 'condition'): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(25);
  }
}

async function startDaemon(prefix: string) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  const configProvider: any = {
    getWorkspaceRoot: () => root,
    getConfig: () => ({ sentinel: { ragEnabled: false } }),
  };
  const arbiter: any = {
    getMode: () => 'heuristic',
    checkLLMAvailability: async () => false,
    isLlmAvailable: () => false,
    evaluateEvent: async () => ({ decision: 'PASS', confidence: 1 }),
  };
  const router: any = { route: async () => undefined };
  const daemon = new SentinelDaemon(configProvider, arbiter, router, new EventBus());
  const queued: Array<{ type: string; path: string }> = [];
  const inner = daemon as unknown as {
    queue: { enqueue: (e: { type: string; payload: { path: string } }) => void };
    onWatcherReady: () => void;
    logger: { error: (m: string, e?: unknown) => void };
    watcher?: Watcher;
  };
  inner.queue.enqueue = (e) => { queued.push({ type: e.type, path: e.payload.path }); };
  let ready = false;
  const onReady = inner.onWatcherReady.bind(daemon);
  inner.onWatcherReady = () => { onReady(); ready = true; };
  const errors: string[] = [];
  const logError = inner.logger.error.bind(inner.logger);
  inner.logger.error = (m, e) => { errors.push(m); logError(m, e); };
  await daemon.start();
  const watcher = inner.watcher as Watcher;
  assert.ok(watcher, 'the daemon built no watcher');
  const raw: RawEvent[] = [];
  watcher.on('all', (event: string, p: string) => raw.push([event, p]));
  await until(() => ready, 10000, 'watcher ready');
  return { root, daemon, watcher, queued, raw, errors };
}

function cleanup(root: string) {
  fs.rmSync(root, { recursive: true, force: true });
}

suite('SentinelDaemon file watcher (C2 T3, characterization)', function () {
  this.timeout(30000);

  test('host runtime is logged', () => {
    const features = (process as unknown as { features: Record<string, unknown> }).features;
    console.log(`[sentinel-watcher] node ${process.versions.node}, require_module ${String(features.require_module)}`);
    assert.ok(process.versions.node);
  });

  test('create, change and delete under src/ are queued in order; ready sets filesWatched', async () => {
    const { root, daemon, queued } = await startDaemon('sentinel-watch-');
    try {
      assert.equal(typeof daemon.getStatus().filesWatched, 'number');
      const file = path.join(root, 'src', 'a.ts');
      fs.writeFileSync(file, 'export const a = 1;\n');
      await until(() => queued.some((e) => e.type === 'FILE_CREATED' && e.path === file), 8000, 'FILE_CREATED');
      fs.writeFileSync(file, 'export const a = 2;\n');
      await until(() => queued.some((e) => e.type === 'FILE_MODIFIED' && e.path === file), 8000, 'FILE_MODIFIED');
      fs.rmSync(file);
      await until(() => queued.some((e) => e.type === 'FILE_DELETED' && e.path === file), 8000, 'FILE_DELETED');
      assert.equal(queued.filter((e) => e.type === 'FILE_CREATED' && e.path === file).length, 1);
    } finally {
      daemon.stop();
      cleanup(root);
    }
  });

  test('ignored paths raise no raw watcher event at all (node_modules, dist, .failsafe/runtime, .log)', async () => {
    const { root, daemon, raw } = await startDaemon('sentinel-watch-');
    try {
      const ignored = [
        path.join(root, 'node_modules', 'x.ts'),
        path.join(root, 'dist', 'y.ts'),
        path.join(root, '.failsafe', 'runtime', 'z.json'),
        path.join(root, 'app.log'),
      ];
      for (const p of ignored) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'x'); }
      await sleep(STABILITY_MS + SCAN_MARGIN_MS);
      const marker = path.join(root, 'src', 'marker.ts');
      fs.writeFileSync(marker, 'export {};\n');
      await until(() => raw.some((e) => e[1] === marker), 8000, 'marker event');
      const counts = ignored.map((p) => `${path.relative(root, p)}=${raw.filter((e) => e[1] === p || e[1].startsWith(p + path.sep)).length}`);
      const nonzero = counts.filter((c) => !c.endsWith('=0'));
      assert.deepEqual(nonzero, [], `raw events for ignored paths: ${counts.join(', ')}`);
    } finally {
      daemon.stop();
      cleanup(root);
    }
  });

  test('an error emitted by the watcher reaches the logger', async () => {
    const { root, daemon, watcher, errors } = await startDaemon('sentinel-watch-');
    try {
      watcher.emit('error', new Error('synthetic watcher error'));
      assert.ok(errors.includes('File watcher error'), `logged: ${JSON.stringify(errors)}`);
    } finally {
      daemon.stop();
      cleanup(root);
    }
  });

  // No "no events after stop" check: close() removes every listener (chokidar index.js:400), so such a
  // check could never fail. closed and the empty getWatched() are the falsifiers.
  test('stop() closes the watcher: closed, nothing watched, daemon stopped', async () => {
    const { root, daemon, watcher } = await startDaemon('sentinel-watch-');
    try {
      daemon.stop();
      await watcher.close(); // the close stop() started
      assert.equal(watcher.closed, true);
      assert.deepEqual(watcher.getWatched(), {});
      assert.equal(daemon.isRunning(), false);
    } finally {
      cleanup(root);
    }
  });

  test('resolved watcher options on this host: no polling, atomic on', async () => {
    const { root, daemon, watcher } = await startDaemon('sentinel-watch-');
    try {
      assert.equal(watcher.options.usePolling, false, 'usePolling');
      assert.ok(watcher.options.atomic === true || typeof watcher.options.atomic === 'number', `atomic ${String(watcher.options.atomic)}`);
    } finally {
      daemon.stop();
      cleanup(root);
    }
  });

  test('behaviour change: a workspace root whose name contains [x] is watched as a literal folder', async () => {
    const { root, daemon, queued } = await startDaemon('sentinel-[x]-');
    try {
      assert.ok(root.includes('[x]'), root);
      const file = path.join(root, 'src', 'a.ts');
      fs.writeFileSync(file, 'export const a = 1;\n');
      await until(() => queued.some((e) => e.type === 'FILE_CREATED' && e.path === file), 8000, 'FILE_CREATED under [x] root');
    } finally {
      daemon.stop();
      cleanup(root);
    }
  });
});

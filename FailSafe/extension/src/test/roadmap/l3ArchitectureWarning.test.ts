// B311 (plan-b311-b312 LD5, LD6, LD11): affected architecture decisions in the Console L3
// decision dialogs, warn-only.
//
// decide-l3 for a file a canonical row names lists it and the decision still runs; a descriptive
// row's file and a workspace without an index leave the dialog byte-identical; repository text is
// review-rendered and capped; the batch dialog has a total cap; a throwing describe and a read that
// never settles never block the decision or the loopback server.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setupActionsRoutes } from '../../roadmap/routes/ActionsRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import type { OperatorActionRequest } from '../../extension/operatorConfirmation';
import { describeAffectedArchitecture } from '../../governance/architecture/affectedArchitecture';
import { RouteHarness, makeApp } from '../extension/helpers/routeTestHarness';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require('../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };

const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';
const SEP = '|---|---|---|---|---|---|---|---|---|---|---|';
const row = (id: string, domain: string, link: string, status: string, contract: string): string =>
  `| ${id} | ${domain} | ${link} | ${status} | manual | - | - | - | ${contract} | unknown | manual |`;
const LONG = `src/${'L'.repeat(300)}.ts`;
const ROWS = [
  row('architecture-navigation', 'architecture navigation', '[Architecture Index](ARCHITECTURE_INDEX.md)', 'canonical', 'unknown'),
  row('runtime', 'runtime', '[R](architecture/RUNTIME.md)', 'canonical', '`src/runtime/engine.ts`'),
  row('overview', 'overview', '[O](architecture/OVERVIEW.md)', 'descriptive', '`src/overview.ts`'),
  row('rlo', 'rlo', '[RLO](architecture/RLO.md)', 'canonical', '[evil](../src/%E2%80%AEevil.ts)'),
  row('long', 'long', '[L](architecture/LONG.md)', 'canonical', `\`${LONG}\``),
  ...Array.from({ length: 12 }, (_, i) => row(`m${i}`, `m${i}`, `[M${i}](architecture/M${i}.md)`, 'canonical', `\`src/m${i}.ts\``)),
];
const TITLE = 'Architecture decisions for these files (warn-only):';
const made: string[] = [];

function workspace(withIndex = true): string {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-arch-l3warn-')));
  made.push(root);
  if (withIndex) {
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md'), ['# Architecture Index', '', '## Registry', '', HEADER, SEP, ...ROWS, '',
      '```architecture-normative', 'docs/architecture/**/*.md', '```', '', '```architecture-legacy', 'docs/archive/**', '```', ''].join('\n'));
  }
  return root;
}

const item = (id: string, filePath: string) => ({
  id, state: 'QUEUED', filePath, riskGrade: 'L3', agentDid: 'did:agent:x', agentTrust: 0.4, sentinelSummary: 's', flags: [],
  queuedAt: 't', slaDeadline: 't',
});

suite('B311 affected architecture decisions in the Console L3 dialogs', () => {
  let harness: RouteHarness | null = null;
  teardown(async () => { if (harness) await harness.stop(); harness = null; });
  suiteTeardown(() => { for (const d of made) removeTempTree(d); });

  async function start(queue: unknown[], over: Partial<ApiRouteDeps> = {}) {
    const shown: OperatorActionRequest[] = [];
    const decided: string[] = [];
    const app = makeApp();
    app.get('/ping', (_req, res) => { res.json({ ok: true }); });
    const deps = {
      rejectIfRemote: () => false, broadcast: () => undefined,
      qorelogicManager: { getL3Queue: () => queue, processL3Decision: async (id: string) => { decided.push(id); } },
      confirmOperatorAction: async (r: OperatorActionRequest) => { shown.push(r); return 'approved'; },
      ...over,
    } as unknown as ApiRouteDeps;
    setupActionsRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    return { h: harness, shown, decided };
  }
  const real = (root: string, opts: Record<string, unknown> = {}) => ({
    describeArchitecture: (paths: string[], o?: { maxLines?: number }) =>
      describeAffectedArchitecture({ workspaceRoot: root }, paths, { ...o, ...opts }),
  }) as unknown as Partial<ApiRouteDeps>;

  test('decide-l3 lists the canonical row for an absolute contract path, and the decision still runs', async () => {
    const root = workspace();
    const { h, shown, decided } = await start([item('a', path.join(root, 'src', 'runtime', 'engine.ts'))], real(root));
    const res = await h.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 'a', decision: 'APPROVED' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(decided, ['a'], 'warn-only: the decision is processed');
    assert.ok(shown[0].detail.includes(TITLE));
    assert.ok(shown[0].detail.includes('src/runtime/engine.ts: runtime (canonical, "runtime") docs/architecture/RUNTIME.md, via contract'), shown[0].detail);
  });

  test('a descriptive row and a workspace without an index leave the dialog byte-identical', async () => {
    const root = workspace();
    const baseline = await start([item('b', 'src/overview.ts')]);
    await baseline.h.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 'b' } });
    await baseline.h.stop();
    harness = null;
    const withIndex = await start([item('b', 'src/overview.ts')], real(root));
    await withIndex.h.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 'b' } });
    assert.equal(withIndex.shown[0].detail, baseline.shown[0].detail);
    await withIndex.h.stop();
    harness = null;
    const empty = workspace(false);
    const noIndex = await start([item('b', 'src/overview.ts')], real(empty));
    await noIndex.h.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 'b' } });
    assert.equal(noIndex.shown[0].detail, baseline.shown[0].detail);
  });

  test('repository text is rendered and capped: a percent-decoded RLO and a 300-character path', async () => {
    const root = workspace();
    const { h, shown } = await start([item('r', 'src/\u202Eevil.ts'), item('l', LONG)], real(root));
    await h.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 'r' } });
    await h.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 'l' } });
    assert.ok(shown[0].detail.includes('src/[U+202E]evil.ts: rlo '), shown[0].detail);
    assert.ok(!shown[0].detail.includes('\u202E'));
    const line = shown[1].detail.split('\n').find((l) => l.startsWith('src/LLL')) ?? '';
    assert.ok(Array.from(line).length <= 240 && line.endsWith('...'), line);
  });

  test('the batch dialog has a total cap of 10 lines', async () => {
    const root = workspace();
    const queue = Array.from({ length: 12 }, (_, i) => item(`q${i}`, `src/m${i}.ts`));
    const { h, shown, decided } = await start(queue, real(root));
    const res = await h.request({ method: 'POST', path: '/api/actions/approve-l3-batch', body: { decision: 'APPROVED' } });
    assert.equal(res.status, 200);
    assert.equal(decided.length, 12);
    const lines = shown[0].detail.split('\n');
    const at = lines.indexOf(TITLE);
    const block = lines.slice(at + 1).filter((l) => l.startsWith('src/m'));
    assert.equal(block.length, 10);
    assert.ok(lines.includes('and 2 more'));
  });

  test('a throwing describe gives the dialog without lines, and the decision proceeds', async () => {
    const root = workspace();
    const baseline = await start([item('t', 'src/runtime/engine.ts')]);
    await baseline.h.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 't' } });
    await baseline.h.stop();
    harness = null;
    void root;
    const { h, shown, decided } = await start([item('t', 'src/runtime/engine.ts')],
      { describeArchitecture: async () => { throw new Error('boom'); } } as unknown as Partial<ApiRouteDeps>);
    const res = await h.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 't' } });
    assert.equal(res.status, 200);
    assert.deepEqual(decided, ['t']);
    assert.equal(shown[0].detail, baseline.shown[0].detail);
  });

  test('a read that never settles: "not checked (timeout)" within the budget, the decision runs, the server keeps answering', async () => {
    const root = workspace();
    const { h, shown, decided } = await start([item('s', 'src/runtime/engine.ts')],
      real(root, { budgetMs: 300, readIndex: () => new Promise(() => undefined) }));
    const started = Date.now();
    const pending = h.request({ method: 'POST', path: '/api/actions/decide-l3', body: { id: 's' } });
    await new Promise((r) => setTimeout(r, 50));
    const pingStarted = Date.now();
    const ping = await h.request({ path: '/ping' });
    assert.equal(ping.status, 200);
    assert.ok(Date.now() - pingStarted < 200, `ping took ${Date.now() - pingStarted} ms while the decision was pending`);
    const res = await pending;
    assert.equal(res.status, 200);
    assert.ok(Date.now() - started < 300 + 250, `${Date.now() - started} ms`);
    assert.deepEqual(decided, ['s']);
    assert.ok(shown[0].detail.includes('Architecture authority not checked (timeout).'), shown[0].detail);
  });
});

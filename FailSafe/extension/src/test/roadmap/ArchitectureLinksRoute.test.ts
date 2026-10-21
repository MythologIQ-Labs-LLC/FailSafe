// B312 / B253 (plan-b311-b312 LD3, LD4, LD9, LD11): registry and decision links through the
// architecture routes, on real temp git repositories.
//
// GET returns authority.links and per-row decision links from a fake ledger (unavailable without
// the optional read, truncated past the cap); open accepts a present contract document and refuses a
// missing one, a pattern, an outside path and an unnamed path; open runs the Console request guard.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { setupArchitectureIndexRoutes, type ArchitectureIndexRouteDeps } from '../../roadmap/routes/ArchitectureIndexRoute';
import { RouteHarness, makeApp } from '../extension/helpers/routeTestHarness';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require('../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };

const ARCH_DID = 'did:failsafe:agent:architecture-index';
const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';
const SEP = '|---|---|---|---|---|---|---|---|---|---|---|';
const INDEX = 'docs/ARCHITECTURE_INDEX.md';
const row = (id: string, domain: string, link: string, status: string, o: Record<string, string> = {}): string =>
  `| ${id} | ${domain} | ${link} | ${status} | manual | ${o.supersedes ?? '-'} | ${o.related ?? '-'} | ${o.gov ?? '-'} | ` +
  `${o.contract ?? 'unknown'} | ${o.verification ?? 'unknown'} | manual |`;
const ROWS = [
  row('architecture-navigation', 'architecture navigation', '[Architecture Index](ARCHITECTURE_INDEX.md)', 'canonical'),
  row('runtime', 'runtime', '[R](architecture/RUNTIME.md)', 'canonical', {
    related: 'storage', gov: '#769', contract: '`src/runtime/engine.ts`, `src/**/*.ts`, `src/ignored.ts`', verification: '`src/test/missing.test.ts`',
  }),
  row('storage', 'storage', '[S](architecture/STORAGE.md)', 'proposed'),
];

const made: string[] = [];

function repo(): string {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-arch-linksroute-')));
  made.push(root);
  const git = (...args: string[]) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  };
  git('init', '-q');
  const files: Record<string, string> = {
    [INDEX]: ['# Architecture Index', '', '## Registry', '', HEADER, SEP, ...ROWS, '', '```architecture-normative',
      'docs/architecture/**/*.md', 'docs/ARCHITECTURE*.md', '```', '', '```architecture-legacy', 'docs/archive/**', '```', ''].join('\n'),
    'docs/architecture/RUNTIME.md': 'r', 'docs/architecture/STORAGE.md': 's', 'src/runtime/engine.ts': 'e',
    // On disk but ignored, so git does not list it: a contract path that is never opened.
    '.gitignore': 'src/ignored.ts\n', 'src/ignored.ts': 'i',
  };
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  git('add', '-A');
  git('-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=', 'commit', '-q', '-m', 'fixture');
  return root;
}

interface Entry { id: number; eventType: string; agentDid: string; payload: Record<string, unknown> }
function ledger(entries: Entry[], withRead = true) {
  const calls: Array<[string, number]> = [];
  return {
    calls,
    isAvailable: () => true,
    appendEntry: async () => ({ id: 1, entryHash: 'h' }),
    getEntriesByType: async () => [],
    getEntryById: async () => null,
    ...(withRead ? {
      getEntriesByAgent: async (did: string, limit: number) => {
        calls.push([did, limit]);
        return entries.filter((e) => e.agentDid === did).sort((a, b) => b.id - a.id).slice(0, limit);
      },
    } : {}),
  };
}

suite('B312 architecture links route', () => {
  let harness: RouteHarness | null = null;
  teardown(async () => { if (harness) await harness.stop(); harness = null; });
  suiteTeardown(() => { for (const d of made) removeTempTree(d); });

  async function start(root: string, l: unknown, opened: string[] = []): Promise<RouteHarness> {
    const app = makeApp();
    setupArchitectureIndexRoutes(app, {
      rejectIfRemote: () => false, workspaceRoot: root, getIndexPathSetting: () => undefined, getLedgerManager: () => l,
      queueL3Approval: async () => 'x', getL3Queue: () => [], openFileInEditor: async (abs: string) => { opened.push(abs); },
      confirmOperatorAction: async () => 'approved',
    } as unknown as ArchitectureIndexRouteDeps);
    harness = new RouteHarness(app);
    await harness.start();
    return harness;
  }

  test('GET returns registry links and decision links (outcome, roles, id order)', async () => {
    const root = repo();
    const entries: Entry[] = [
      { id: 10, eventType: 'PROPOSAL', agentDid: ARCH_DID, payload: { kind: 'architecture-doc-proposal', action: 'register', path: 'docs/architecture/RUNTIME.md' } },
      { id: 11, eventType: 'L3_APPROVED', agentDid: ARCH_DID, payload: { sourceLedgerEntryId: 10 } },
      { id: 12, eventType: 'PROPOSAL', agentDid: ARCH_DID, payload: { kind: 'architecture-doc-proposal', action: 'register', path: 'docs/architecture/STORAGE.md' } },
    ];
    const h = await start(root, ledger(entries));
    const res = await h.request({ path: '/api/v1/architecture/index' });
    assert.equal(res.status, 200);
    const links = res.body.authority.links.find((l: { id: string }) => l.id === 'runtime');
    assert.deepEqual(links.related.map((x: { id: string; status: string }) => [x.id, x.status]), [['storage', 'proposed']]);
    assert.deepEqual(links.contract.map((x: { kind: string; state: string }) => [x.kind, x.state]),
      [['path', 'present'], ['pattern', 'not-matched'], ['path', 'not-listed']]);
    assert.deepEqual(links.verification.map((x: { state: string }) => x.state), ['not-on-disk']);
    const d = res.body.authority.decisions;
    assert.equal(d.state, 'ok');
    assert.deepEqual(d.byRow.runtime.map((x: { proposalEntryId: number; outcome: string; decisionEntryId: number | null }) =>
      [x.proposalEntryId, x.outcome, x.decisionEntryId]), [[10, 'approved', 11]]);
    assert.deepEqual(d.byRow.storage.map((x: { outcome: string }) => x.outcome), ['undecided']);
  });

  test('GET: a ledger without getEntriesByAgent gives unavailable; past the cap, truncated after one read', async () => {
    const root = repo();
    const h1 = await start(root, ledger([], false));
    assert.equal((await h1.request({ path: '/api/v1/architecture/index' })).body.authority.decisions.state, 'unavailable');
    await h1.stop();
    harness = null;
    const many: Entry[] = Array.from({ length: 2001 }, (_, i) => ({ id: i + 1, eventType: 'PROPOSAL', agentDid: ARCH_DID,
      payload: { kind: 'architecture-doc-proposal', action: 'register', path: `p${i}` } }));
    const l = ledger(many);
    const h2 = await start(root, l);
    const d = (await h2.request({ path: '/api/v1/architecture/index' })).body.authority.decisions;
    assert.deepEqual(d, { state: 'truncated', cap: 2000 });
    assert.deepEqual(l.calls, [[ARCH_DID, 2001]]);
  });

  test('open: a present contract document opens; missing, pattern, outside, unnamed and ignored paths are refused', async () => {
    const root = repo();
    const opened: string[] = [];
    const h = await start(root, ledger([]), opened);
    const ok = await h.request({ method: 'POST', path: '/api/actions/architecture-index/open', body: { path: 'src/runtime/engine.ts' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual(opened, [path.join(root, 'src', 'runtime', 'engine.ts')]);
    for (const p of ['src/test/missing.test.ts', 'src/**/*.ts', '../outside.ts', 'src/unnamed.ts', 'src/ignored.ts']) {
      const r = await h.request({ method: 'POST', path: '/api/actions/architecture-index/open', body: { path: p } });
      assert.equal(r.status, 400, p);
    }
    assert.equal(opened.length, 1);
  });

  test('open runs the Console request guard: a foreign Origin is 403, text/plain is 415, nothing opens', async () => {
    const root = repo();
    const opened: string[] = [];
    const h = await start(root, ledger([]), opened);
    const origin = await h.request({ method: 'POST', path: '/api/actions/architecture-index/open', body: { path: 'src/runtime/engine.ts' },
      headers: { origin: 'http://evil.example' } });
    assert.equal(origin.status, 403);
    const plain = await h.request({ method: 'POST', path: '/api/actions/architecture-index/open', rawBody: '{}', headers: { 'content-type': 'text/plain' } });
    assert.equal(plain.status, 415);
    assert.equal(opened.length, 0);
  });
});

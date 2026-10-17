// #531 LD4/LD7: managed architecture index routes against real temp git repositories.
//
// GET snapshot; bootstrap reuse (409 {reuse}), declined (409 {confirmation}), approved
// create, the exclusive-create race (409 {exists:'appeared'}), ledger evidence when the
// ledger is available and ledger:'unavailable' when it is not; propose (register and
// supersede) queues one L3 item linked to its PROPOSAL entry and writes no file, and with
// no ledger answers 503 and queues nothing; open checks the path against the snapshot;
// every route refuses a non-loopback caller and carries a rate limit.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { setupArchitectureIndexRoutes, type ArchitectureIndexRouteDeps } from '../../roadmap/routes/ArchitectureIndexRoute';
import { discoverArchitectureIndex } from '../../governance/architecture/ArchitectureIndexDiscovery';
import { projectResolution } from '../../qorelogic/ledger/AuditResolutionProjector';
import type { LedgerEntry } from '../../shared/types';
import type { OperatorActionRequest, OperatorConfirmation } from '../../extension/operatorConfirmation';
import { RouteHarness, makeApp, invokeRemote } from '../extension/helpers/routeTestHarness';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require('../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };

const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';
const SEP = '|---|---|---|---|---|---|---|---|---|---|---|';
const SELF = ['architecture-navigation', 'architecture navigation', '[Architecture Index](ARCHITECTURE_INDEX.md)', 'canonical',
  'manual', '-', '-', '-', 'unknown', 'unknown', 'manual'];
const RUNTIME = ['runtime', 'runtime', '[Runtime](architecture/RUNTIME.md)', 'canonical', 'manual', '-', '-', '-', 'unknown',
  'unknown', 'manual'];
const RUNTIME_V2 = ['runtime-v2', 'runtime v2', '[Runtime v2](architecture/RUNTIME_V2.md)', 'proposed', 'manual', '-', '-', '-',
  'unknown', 'unknown', 'manual'];

function indexText(rows: string[][]): string {
  return ['# Architecture Index', '', '## Registry', '', HEADER, SEP, ...rows.map((r) => `| ${r.join(' | ')} |`), '',
    '## Normative scope', '', '```architecture-normative', 'docs/architecture/**/*.md', 'docs/ARCHITECTURE*.md', '```', '',
    '## Legacy', '', '```architecture-legacy', 'docs/archive/**', '```', ''].join('\n');
}

const made: string[] = [];

function git(root: string, ...args: string[]): void {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
}

function write(root: string, rel: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

function repo(files: Record<string, string>, { commit = true } = {}): string {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-arch-route-')));
  made.push(root);
  git(root, 'init', '-q');
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  if (commit) {
    git(root, 'add', '-A');
    git(root, '-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false',
      '-c', 'core.hooksPath=', 'commit', '-q', '--allow-empty', '-m', 'fixture');
  }
  return root;
}

interface FakeLedger {
  entries: Array<Record<string, unknown> & { id: number }>;
  isAvailable(): boolean;
  appendEntry(r: Record<string, unknown>): Promise<{ id: number; entryHash: string }>;
}

function fakeLedger(mode: 'available' | 'disabled' | 'stub' = 'available'): FakeLedger {
  const entries: FakeLedger['entries'] = [];
  return {
    entries,
    isAvailable: () => mode !== 'disabled',
    appendEntry: async (r) => {
      if (mode === 'stub') return { id: 0, entryHash: 'STUB_DISABLED' };
      const e = { ...r, id: 100 + entries.length };
      entries.push(e);
      return { id: e.id, entryHash: `hash-${e.id}` };
    },
  };
}

function confirmer(result: OperatorConfirmation = 'approved', onShow?: () => void): {
  confirm: (r: OperatorActionRequest) => Promise<OperatorConfirmation>; shown: OperatorActionRequest[];
} {
  const shown: OperatorActionRequest[] = [];
  return { shown, confirm: async (r) => { shown.push(r); onShow?.(); return result; } };
}

interface Setup {
  harness: RouteHarness;
  ledger: FakeLedger | null;
  queued: Array<Record<string, unknown>>;
  opened: string[];
  shown: OperatorActionRequest[];
}

const sha = (buf: Buffer | string): string => createHash('sha256').update(buf).digest('hex');

suite('#531 ArchitectureIndexRoute', () => {
  let harness: RouteHarness | null = null;
  teardown(async () => { if (harness) await harness.stop(); harness = null; });
  suiteTeardown(() => { for (const d of made) removeTempTree(d); });

  async function start(root: string, over: Partial<ArchitectureIndexRouteDeps> & {
    ledger?: FakeLedger | null; confirmResult?: OperatorConfirmation; onConfirm?: () => void;
  } = {}): Promise<Setup> {
    const app = makeApp();
    const ledger = over.ledger === undefined ? fakeLedger() : over.ledger;
    const queued: Array<Record<string, unknown>> = [];
    const opened: string[] = [];
    const c = confirmer(over.confirmResult ?? 'approved', over.onConfirm);
    const deps: ArchitectureIndexRouteDeps = {
      rejectIfRemote: () => false,
      workspaceRoot: root,
      getIndexPathSetting: () => undefined,
      getLedgerManager: () => ledger,
      queueL3Approval: async (r) => { queued.push(r as unknown as Record<string, unknown>); return `l3-${queued.length}`; },
      openFileInEditor: async (abs) => { opened.push(abs); },
      confirmOperatorAction: c.confirm,
      ...over,
    };
    setupArchitectureIndexRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    return { harness, ledger, queued, opened, shown: c.shown };
  }

  test('GET returns the snapshot and the ledger state, read-only', async () => {
    const root = repo({ 'docs/architecture/RUNTIME.md': '# Runtime\n' });
    const s = await start(root, { ledger: null });
    const res = await s.harness.request({ path: '/api/v1/architecture/index' });
    assert.equal(res.status, 200);
    assert.equal(res.body.state, 'absent');
    assert.equal(res.body.ledger, 'unavailable');
    assert.deepEqual(res.body.candidates.map((c: { path: string }) => c.path), ['docs/architecture/RUNTIME.md']);
    assert.equal(fs.existsSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md')), false);
    await s.harness.stop();
    const s2 = await start(root);
    assert.equal((await s2.harness.request({ path: '/api/v1/architecture/index' })).body.ledger, 'available');
  });

  test('bootstrap with an existing index answers 409 {reuse} and writes nothing, without a dialog', async () => {
    const text = indexText([SELF, RUNTIME]);
    const root = repo({ 'docs/ARCHITECTURE_INDEX.md': text, 'docs/architecture/RUNTIME.md': '# R\n' });
    const s = await start(root);
    const res = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/bootstrap', body: { mode: 'create' } });
    assert.equal(res.status, 409);
    assert.deepEqual([res.body.reuse, res.body.confirmation, res.body.exists], ['docs/ARCHITECTURE_INDEX.md', undefined, undefined]);
    assert.equal(fs.readFileSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md'), 'utf8'), text);
    assert.equal(s.shown.length, 0);
    assert.equal(s.ledger!.entries.length, 0);
  });

  test('bootstrap declined in VS Code answers 409 {confirmation} and writes nothing', async () => {
    const root = repo({ 'docs/architecture/RUNTIME.md': '# R\n' });
    const s = await start(root, { confirmResult: 'declined' });
    const res = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/bootstrap', body: { mode: 'create' } });
    assert.equal(res.status, 409);
    assert.equal(res.body.confirmation, 'declined');
    assert.equal(res.body.reuse, undefined);
    assert.equal(s.shown.length, 1);
    assert.equal(s.shown[0].title, 'Create the architecture index?');
    assert.match(s.shown[0].detail, /docs\/architecture\/RUNTIME\.md/);
    assert.match(s.shown[0].detail, /over loopback/);
    assert.equal(fs.existsSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md')), false);
    assert.equal(s.ledger!.entries.length, 0);
  });

  test('bootstrap approved writes the skeleton, which validates as present, and ledgers sourceSha and docSha256', async () => {
    const root = repo({ 'docs/architecture/RUNTIME.md': '# R\n', 'ARCHITECTURE.md': '# Top\n' });
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const s = await start(root);
    const res = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/bootstrap', body: { mode: 'create' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const bytes = fs.readFileSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md'));
    assert.equal(res.body.status, 'created');
    assert.equal(res.body.docSha256, sha(bytes));
    assert.equal(res.body.sourceSha, head);
    assert.equal(res.body.rows, 3);
    assert.deepEqual(res.body.ledger, { entryId: 100 });
    const [entry] = s.ledger!.entries;
    assert.equal(s.ledger!.entries.length, 1);
    assert.equal(entry.eventType, 'PROPOSAL');
    assert.equal(entry.agentDid, 'did:failsafe:agent:architecture-index');
    assert.equal(entry.agentTrustAtAction, 0);
    assert.deepEqual(entry.payload, { kind: 'architecture-index-bootstrap', path: 'docs/ARCHITECTURE_INDEX.md', sourceSha: head, docSha256: sha(bytes) });
    const snap = discoverArchitectureIndex({ workspaceRoot: root });
    assert.equal(snap.state, 'present', JSON.stringify(snap.problems));
    assert.deepEqual(snap.problems, []);
    assert.deepEqual(snap.rows.map((r) => [r.docPath, r.status]), [
      ['docs/ARCHITECTURE_INDEX.md', 'canonical'], ['ARCHITECTURE.md', 'proposed'], ['docs/architecture/RUNTIME.md', 'proposed']]);
    assert.match(bytes.toString('utf8'), /\[ARCHITECTURE\.md\]\(\.\.\/ARCHITECTURE\.md\)/, 'root-level candidate links relative to docs/');
  });

  test('a file created between the check and the write is never overwritten: 409 {exists:"appeared"}', async () => {
    const root = repo({ 'docs/architecture/RUNTIME.md': '# R\n' });
    const target = path.join(root, 'docs', 'ARCHITECTURE_INDEX.md');
    const s = await start(root, { onConfirm: () => fs.writeFileSync(target, 'written by someone else\n') });
    const res = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/bootstrap', body: { mode: 'create' } });
    assert.equal(res.status, 409);
    assert.equal(res.body.exists, 'appeared');
    assert.equal(res.body.reuse, undefined);
    assert.equal(res.body.confirmation, undefined);
    assert.equal(fs.readFileSync(target, 'utf8'), 'written by someone else\n');
    assert.equal(s.ledger!.entries.length, 0);
  });

  test('ledger unavailable (none, disabled, stub): the index is still written and the result says so', async () => {
    for (const ledger of [null, fakeLedger('disabled'), fakeLedger('stub')]) {
      const root = repo({ 'docs/architecture/RUNTIME.md': '# R\n' });
      const s = await start(root, { ledger });
      const res = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/bootstrap', body: { mode: 'create' } });
      assert.equal(res.status, 200);
      assert.equal(res.body.ledger, 'unavailable');
      assert.ok(fs.existsSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md')));
      await s.harness.stop();
      harness = null;
    }
  });

  test('an unborn repository records sourceSha null with reason unborn', async () => {
    const root = repo({ 'docs/architecture/RUNTIME.md': '# R\n' }, { commit: false });
    const s = await start(root);
    const res = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/bootstrap', body: { mode: 'create' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.sourceSha, null);
    assert.equal(res.body.sourceShaReason, 'unborn');
    assert.deepEqual(s.ledger!.entries[0].payload, {
      kind: 'architecture-index-bootstrap', path: 'docs/ARCHITECTURE_INDEX.md', sourceSha: null, sourceShaReason: 'unborn',
      docSha256: res.body.docSha256,
    });
  });

  test('bootstrap refusals are typed: not a repository, a bad index path, a bad mode', async () => {
    const plain = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-arch-plain-')));
    made.push(plain);
    const prev = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = path.dirname(plain);
    try {
      const s = await start(plain);
      const res = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/bootstrap', body: { mode: 'create' } });
      assert.equal(res.status, 422);
      assert.equal(res.body.refused, 'not-a-repo');
      assert.equal(s.shown.length, 0);
    } finally {
      if (prev === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = prev;
    }
    await harness!.stop();
    const root = repo({});
    const s2 = await start(root, { getIndexPathSetting: () => '../escape.md' });
    const bad = await s2.harness.request({ method: 'POST', path: '/api/actions/architecture-index/bootstrap', body: { mode: 'create' } });
    assert.equal(bad.status, 422);
    assert.equal(bad.body.refused, 'bad-index-path');
    const mode = await s2.harness.request({ method: 'POST', path: '/api/actions/architecture-index/bootstrap', body: { mode: 'replace' } });
    assert.equal(mode.status, 400);
  });

  test('propose register: a PROPOSAL entry with server-side evidence, then one L3 item linked by id; no file written', async () => {
    const root = repo({ 'docs/ARCHITECTURE_INDEX.md': indexText([SELF, RUNTIME]), 'docs/architecture/RUNTIME.md': '# R\n' });
    write(root, 'docs/architecture/RUNTIME_COPY.md', '# a duplicate an agent wrote\n');
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const before = fs.readFileSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md'), 'utf8');
    const s = await start(root);
    const res = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/propose', body: {
      path: 'docs/architecture/RUNTIME_COPY.md', action: 'register',
      sourceSha: 'f'.repeat(40), docSha256: '0'.repeat(64), suggestions: ['evil.md'],
    } });
    assert.equal(res.status, 202, JSON.stringify(res.body));
    assert.equal(res.body.approvalId, 'l3-1');
    assert.equal(res.body.ledgerEntryId, 100);
    const [entry] = s.ledger!.entries;
    const payload = {
      kind: 'architecture-doc-proposal', path: 'docs/architecture/RUNTIME_COPY.md', action: 'register', supersededBy: null,
      sourceSha: head, docSha256: sha(fs.readFileSync(path.join(root, 'docs', 'architecture', 'RUNTIME_COPY.md'))),
      suggestions: ['docs/architecture/RUNTIME.md', 'docs/ARCHITECTURE_INDEX.md'],
    };
    assert.deepEqual(entry.payload, payload, 'evidence is computed server-side; body values are ignored');
    assert.equal(entry.eventType, 'PROPOSAL');
    assert.equal(s.queued.length, 1);
    const item = s.queued[0];
    assert.equal(item.kind, 'architecture-doc-proposal');
    assert.equal(item.filePath, 'docs/architecture/RUNTIME_COPY.md');
    assert.equal(item.agentDid, 'did:failsafe:agent:architecture-index');
    assert.equal(item.sourceLedgerEntryId, 100);
    assert.deepEqual(item.meta, { ...payload, proposalEntryId: 100 });
    assert.equal(fs.readFileSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md'), 'utf8'), before, 'no file written');
  });

  test('propose supersede names a registered successor; a bad successor or an unknown path is refused', async () => {
    const root = repo({ 'docs/ARCHITECTURE_INDEX.md': indexText([SELF, RUNTIME, RUNTIME_V2]),
      'docs/architecture/RUNTIME.md': '# R\n', 'docs/architecture/RUNTIME_V2.md': '# R2\n' });
    const s = await start(root);
    const ok = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/propose',
      body: { path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'runtime-v2' } });
    assert.equal(ok.status, 202, JSON.stringify(ok.body));
    assert.equal(s.queued[0].kind, 'architecture-doc-supersede');
    assert.equal((s.ledger!.entries[0].payload as Record<string, unknown>).supersededBy, 'runtime-v2');
    const badSucc = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/propose',
      body: { path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'no-such-row' } });
    assert.equal(badSucc.status, 400);
    const self = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/propose',
      body: { path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'runtime' } });
    assert.equal(self.status, 400, 'a document cannot supersede itself');
    for (const p of ['docs/architecture/NOPE.md', '../outside.md', 'docs/architecture/RUNTIME.md']) {
      const r = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/propose', body: { path: p, action: 'register' } });
      assert.equal(r.status, 400, `${p} must not be proposable for registration`);
    }
    assert.equal(s.queued.length, 1);
    assert.equal(s.ledger!.entries.length, 1);
  });

  test('propose with the ledger unavailable answers 503 {ledger:"unavailable"} and queues nothing', async () => {
    for (const ledger of [null, fakeLedger('disabled'), fakeLedger('stub')]) {
      const root = repo({ 'docs/ARCHITECTURE_INDEX.md': indexText([SELF, RUNTIME]), 'docs/architecture/RUNTIME.md': '# R\n' });
      write(root, 'docs/architecture/RUNTIME_COPY.md', '# copy\n');
      const s = await start(root, { ledger });
      const res = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/propose',
        body: { path: 'docs/architecture/RUNTIME_COPY.md', action: 'register' } });
      assert.equal(res.status, 503);
      assert.equal(res.body.ledger, 'unavailable');
      assert.equal(s.queued.length, 0, 'an L3 item without a ledger could never be decided');
      await s.harness.stop();
      harness = null;
    }
  });

  test('a PROPOSAL-sourced L3 decision is not projected as an audit resolution', () => {
    const at = (id: number, eventType: string, payload: Record<string, unknown> = {}): LedgerEntry => ({
      id, timestamp: 't', eventType, agentDid: 'did:failsafe:agent:architecture-index', agentTrustAtAction: 0,
      gdprTrigger: false, payload, entryHash: `h${id}`, prevHash: `h${id - 1}`, signature: 's',
    } as unknown as LedgerEntry);
    const entries = [at(100, 'PROPOSAL', { kind: 'architecture-doc-proposal' }), at(101, 'L3_QUEUED', { sourceLedgerEntryId: 100 }),
      at(102, 'L3_APPROVED', { sourceLedgerEntryId: 100 })];
    assert.deepEqual(projectResolution(entries), []);
  });

  test('open: a snapshot path opens through the injected opener; anything else is refused; unwired is 503', async () => {
    const root = repo({ 'docs/ARCHITECTURE_INDEX.md': indexText([SELF, RUNTIME]), 'docs/architecture/RUNTIME.md': '# R\n' });
    write(root, 'docs/architecture/RUNTIME_COPY.md', '# copy\n');
    const s = await start(root);
    const ok = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/open', body: { path: 'docs/architecture/RUNTIME.md' } });
    assert.equal(ok.status, 200);
    assert.deepEqual(s.opened, [path.join(root, 'docs', 'architecture', 'RUNTIME.md')]);
    for (const p of ['src/other.md', '../x.md', 'C:/Windows/win.ini']) {
      const r = await s.harness.request({ method: 'POST', path: '/api/actions/architecture-index/open', body: { path: p } });
      assert.equal(r.status, 400, p);
    }
    assert.equal(s.opened.length, 1);
    await s.harness.stop();
    const s2 = await start(root, { openFileInEditor: async () => { throw new Error('openFileInEditor not wired'); } });
    const unwired = await s2.harness.request({ method: 'POST', path: '/api/actions/architecture-index/open', body: { path: 'docs/architecture/RUNTIME.md' } });
    assert.equal(unwired.status, 503);
  });

  test('every route refuses a non-loopback caller', async () => {
    const app = makeApp();
    let queued = 0;
    setupArchitectureIndexRoutes(app, {
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
      workspaceRoot: repo({}), getLedgerManager: () => fakeLedger(), openFileInEditor: async () => undefined,
      queueL3Approval: async () => { queued += 1; return 'x'; }, confirmOperatorAction: async () => 'approved',
    });
    for (const [method, p] of [['GET', '/api/v1/architecture/index'], ['POST', '/api/actions/architecture-index/bootstrap'],
      ['POST', '/api/actions/architecture-index/propose'], ['POST', '/api/actions/architecture-index/open']]) {
      const captured = await invokeRemote(app, method, p);
      assert.equal(captured.statusCode, 403, `${method} ${p}`);
    }
    assert.equal(queued, 0);
  });

  test('the GET route is rate limited (CodeQL js/missing-rate-limiting)', async function () {
    this.timeout(60000);
    const root = repo({});
    const s = await start(root);
    const statuses: number[] = [];
    for (let i = 0; i < 61; i += 1) statuses.push((await s.harness.request({ path: '/api/v1/architecture/index' })).status);
    assert.equal(statuses.filter((x) => x === 200).length, 60);
    assert.equal(statuses[60], 429);
  });

  test('each POST route has its own rate limit: bootstrap 5, propose 10, open 30 per minute', async function () {
    this.timeout(60000);
    const s = await start(repo({}));
    const hit = async (p: string, n: number): Promise<number[]> => {
      const out: number[] = [];
      for (let i = 0; i < n; i += 1) out.push((await s.harness.request({ method: 'POST', path: p, body: {} })).status);
      return out;
    };
    const boot = await hit('/api/actions/architecture-index/bootstrap', 6);
    assert.deepEqual([boot.slice(0, 5).every((x) => x === 400), boot[5]], [true, 429]);
    const prop = await hit('/api/actions/architecture-index/propose', 11);
    assert.deepEqual([prop.slice(0, 10).every((x) => x === 400), prop[10]], [true, 429], 'not starved by bootstrap');
    const open = await hit('/api/actions/architecture-index/open', 31);
    assert.deepEqual([open.slice(0, 30).every((x) => x === 400), open[30]], [true, 429]);
  });
});

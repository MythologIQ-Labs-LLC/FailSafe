// #531 slice 2 (plan-531b LD5-LD8, LD10): architecture authority through the propose route, on
// real temp git repositories.
//
// Competing canonical authority (index and pending), domain intake (hidden characters and the ASCII
// authority charset), the non-ASCII and ambiguous-index refusals, the `proposed` rule, the bound
// supersession confirmation (declined, busy, unwired, expired, cancelled, approved), freshness under
// the lock (state, index, document, HEAD), the Console request guard, and evidence on a real ledger.
// Every refusal row asserts that nothing was recorded, queued or shown.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { setupArchitectureIndexRoutes, type ArchitectureIndexRouteDeps } from '../../roadmap/routes/ArchitectureIndexRoute';
import type { OperatorActionRequest, OperatorConfirmation } from '../../extension/operatorConfirmation';
import { RouteHarness, makeApp } from '../extension/helpers/routeTestHarness';
import { makeEnv, openLedger, type Env } from '../qorelogic/ledgerTestKit';
import type { LedgerManager } from '../../qorelogic/ledger/LedgerManager';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require('../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };

const ARCH_DID = 'did:failsafe:agent:architecture-index';
const SUPERSEDE_TITLE = 'Propose this architecture supersession?';
const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';
const SEP = '|---|---|---|---|---|---|---|---|---|---|---|';
const PROPOSE = '/api/actions/architecture-index/propose';
const INDEX = 'docs/ARCHITECTURE_INDEX.md';
const NOTES = 'docs/architecture/RUNTIME_NOTES.md';

const row = (id: string, domain: string, link: string, status: string, supersedes = '-'): string =>
  `| ${id} | ${domain} | ${link} | ${status} | manual | ${supersedes} | - | - | unknown | unknown | manual |`;
const SELF = row('architecture-navigation', 'architecture navigation', '[Architecture Index](ARCHITECTURE_INDEX.md)', 'canonical');
const RUNTIME = row('runtime', 'runtime', '[Runtime](architecture/RUNTIME.md)', 'canonical');
const STORAGE = row('storage', 'storage', '[Storage](architecture/STORAGE.md)', 'canonical');
const RUNTIME_V2 = row('runtime-v2', 'runtime v2', '[Runtime v2](architecture/RUNTIME_V2.md)', 'proposed');

function indexText(rows: string[]): string {
  return ['# Architecture Index', '', '## Registry', '', HEADER, SEP, ...rows, '',
    '## Normative scope', '', '```architecture-normative', 'docs/architecture/**/*.md', 'docs/ARCHITECTURE*.md', '```', '',
    '## Legacy', '', '```architecture-legacy', 'docs/archive/**', '```', ''].join('\n');
}
const lineOf = (text: string, needle: string): number => text.split('\n').findIndex((l) => l.includes(needle)) + 1;
const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const made: string[] = [];

function git(root: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return String(r.stdout).trim();
}
const commit = (root: string, msg = 'fixture'): void => {
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=', 'commit', '-q', '--allow-empty', '-m', msg);
};
function write(root: string, rel: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

/** A committed repository with `rows` in the index, every linked document present, and NOTES untracked. */
function repo(rows: string[] = [SELF, RUNTIME, STORAGE, RUNTIME_V2], extra: Record<string, string> = {}): string {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-arch-auth-')));
  made.push(root);
  git(root, 'init', '-q');
  write(root, INDEX, indexText(rows));
  for (const r of rows) {
    const m = /\]\(([^)]+)\)/.exec(r);
    if (m && m[1] !== 'ARCHITECTURE_INDEX.md') write(root, path.posix.join('docs', m[1]), `# ${m[1]}\n`);
  }
  for (const [rel, text] of Object.entries(extra)) write(root, rel, text);
  commit(root);
  write(root, NOTES, '# Runtime notes an agent wrote\n');
  return root;
}

interface Entry { id: number; eventType: string; agentDid?: string; payload: Record<string, unknown> }
interface FakeLedger {
  entries: Entry[];
  isAvailable(): boolean;
  appendEntry(r: Record<string, unknown>): Promise<{ id: number; entryHash: string }>;
  getEntriesByType(t: string, limit: number): Promise<Entry[]>;
  getEntryById(id: number): Promise<Entry | null>;
}
/** `appendDelayMs` holds each append open, so two requests overlap inside the locked section. */
function fakeLedger(appendDelayMs = 0): FakeLedger {
  const entries: Entry[] = [];
  return {
    entries,
    isAvailable: () => true,
    appendEntry: async (r) => {
      if (appendDelayMs) await new Promise((res) => setTimeout(res, appendDelayMs));
      const e = { ...(r as unknown as Entry), id: 100 + entries.length };
      entries.push(e);
      return { id: e.id, entryHash: `h${e.id}` };
    },
    getEntriesByType: async (t, limit) => {
      const m = entries.filter((e) => e.eventType === t).sort((a, b) => b.id - a.id);
      return limit < 0 ? m : m.slice(0, limit);
    },
    getEntryById: async (id) => entries.find((e) => e.id === id) ?? null,
  };
}

interface QueueItem { id: string; state: string; kind?: string; meta?: Record<string, unknown>; sentinelSummary: string; filePath: string; sourceLedgerEntryId?: number }
interface Setup {
  harness: RouteHarness;
  ledger: FakeLedger | LedgerManager | null;
  queue: QueueItem[];
  shown: OperatorActionRequest[];
  state: { answer: OperatorConfirmation; reader: (() => QueueItem[]) | null; queueThrows: boolean };
  proposals(): number;
}

suite('#531 slice 2 architecture authority route', () => {
  let harness: RouteHarness | null = null;
  let env: Env | null = null;
  let realLedger: LedgerManager | null = null;
  teardown(async () => {
    if (harness) await harness.stop();
    harness = null;
    realLedger?.close();
    realLedger = null;
    env?.cleanup();
    env = null;
  });
  suiteTeardown(() => { for (const d of made) removeTempTree(d); });

  async function start(root: string, o: {
    ledger?: FakeLedger | LedgerManager | null; onShow?: (r: OperatorActionRequest) => void | Promise<void>;
    confirm?: ((r: OperatorActionRequest) => Promise<OperatorConfirmation>) | null; deadlineMs?: number;
  } = {}): Promise<Setup> {
    const app = makeApp();
    const ledger = o.ledger === undefined ? fakeLedger() : o.ledger;
    const queue: QueueItem[] = [];
    const shown: OperatorActionRequest[] = [];
    const state: Setup['state'] = { answer: 'approved', reader: null, queueThrows: false };
    const confirm = o.confirm === null ? undefined : o.confirm ?? (async (r: OperatorActionRequest) => {
      shown.push(r);
      await o.onShow?.(r);
      return state.answer;
    });
    const deps = {
      rejectIfRemote: () => false,
      workspaceRoot: root,
      getIndexPathSetting: () => undefined,
      getLedgerManager: () => ledger,
      queueL3Approval: async (r: Record<string, unknown>) => {
        if (state.queueThrows) { state.queueThrows = false; throw new Error('queue write failed inside the lock'); }
        const id = `l3-${queue.length + 1}`;
        queue.push({ ...(r as unknown as QueueItem), id, state: 'QUEUED' });
        return id;
      },
      getL3Queue: () => (state.reader ? state.reader() : queue.map((q) => ({ ...q }))),
      openFileInEditor: async () => undefined,
      confirmOperatorAction: confirm,
      confirmationDeadlineMs: o.deadlineMs,
    } as unknown as ArchitectureIndexRouteDeps;
    setupArchitectureIndexRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    const proposals = (): number => {
      const l = ledger as FakeLedger | null;
      return l && Array.isArray(l.entries) ? l.entries.filter((e) => e.eventType === 'PROPOSAL').length : -1;
    };
    return { harness, ledger, queue, shown, state, proposals };
  }

  const post = (s: Setup, body: Record<string, unknown>, headers?: Record<string, string>) =>
    s.harness.request({ method: 'POST', path: PROPOSE, body, headers });
  const register = (s: Setup, domain: string, status: string, extra: Record<string, unknown> = {}) =>
    post(s, { path: NOTES, action: 'register', domain, status, ...extra });
  const nothing = (s: Setup, label: string): void => {
    assert.equal(s.proposals(), 0, `${label}: no PROPOSAL entry`);
    assert.equal(s.queue.length, 0, `${label}: nothing queued`);
    assert.equal(s.shown.length, 0, `${label}: no dialog`);
  };

  /** Simulate processL3Decision: the item leaves the queue and an L3_APPROVED entry links its PROPOSAL. */
  function approve(s: Setup, approvalId: string): void {
    const i = s.queue.findIndex((q) => q.id === approvalId);
    const [item] = s.queue.splice(i, 1);
    (s.ledger as FakeLedger).entries.push({ id: 100 + (s.ledger as FakeLedger).entries.length, eventType: 'L3_APPROVED', agentDid: ARCH_DID,
      payload: { sourceLedgerEntryId: item.sourceLedgerEntryId } });
  }

  test('GET returns authority findings with lines, hashes and HEAD', async () => {
    const rows = [SELF, RUNTIME, row('runtime-b', 'Runtime', '[B](architecture/B.md)', 'canonical')];
    const root = repo(rows);
    const s = await start(root);
    const res = await s.harness.request({ path: '/api/v1/architecture/index' });
    assert.equal(res.status, 200);
    const { authority } = res.body;
    assert.equal(authority.provenance.sourceSha, git(root, 'rev-parse', 'HEAD'));
    assert.equal(authority.provenance.indexSha256, sha(fs.readFileSync(path.join(root, INDEX))));
    const conflict = authority.findings.find((f: { kind: string }) => f.kind === 'conflicting-canonical');
    const text = indexText(rows);
    assert.deepEqual(conflict.rows.map((r: { id: string; line: number }) => [r.id, r.line]),
      [['runtime', lineOf(text, '| runtime |')], ['runtime-b', lineOf(text, '| runtime-b |')]]);
    assert.ok(authority.findings.some((f: { kind: string; path?: string }) => f.kind === 'unregistered-normative' && f.path === NOTES));
  });

  test('competing canonical: 409 canonical-exists for a key or case variant; supersedes must name every canonical row', async () => {
    const s = await start(repo());
    for (const domain of ['runtime', 'Runtime']) {
      const res = await register(s, domain, 'canonical');
      assert.equal(res.status, 409, `${domain}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.conflict, 'canonical-exists');
      assert.deepEqual(res.body.existing.map((r: { id: string }) => r.id), ['runtime']);
      assert.deepEqual(res.body.alternatives, ['use-existing', 'register-descriptive', 'supersede']);
    }
    nothing(s, 'canonical-exists');
    await s.harness.stop();
    harness = null;
    const s2 = await start(repo([SELF, RUNTIME, row('runtime-b', 'runtime', '[B](architecture/B.md)', 'canonical')]));
    const some = await register(s2, 'runtime', 'canonical', { supersedes: ['runtime'] });
    assert.equal(some.status, 409, 'every-of, not some-of');
    assert.deepEqual(some.body.missing, ['runtime-b']);
    nothing(s2, 'every-of');
  });

  test('B1 intake: hidden, format, spacing, NFD and look-alike characters in a new domain are 400 with nothing recorded', async () => {
    const root = repo();
    const s = await start(root);
    const bad: Array<[string, string]> = [
      ['U+200B', 'sched\u200Buler'], ['U+00A0', 'sched\u00A0uler'], ['internal U+FEFF', 'sched\uFEFFuler'],
      ['U+00AD', 'sched\u00ADuler'], ['double space', 'sched  uler'], ['NFD', 'cafe\u0301'],
      ['Cyrillic U+0435', 'runtim\u0435'], ['U+3164', 'sched\u3164uler'], ['leading space', ' scheduler'],
      ['trailing space', 'scheduler '], ['empty', ''], ['pipe', 'a|b'], ['newline', 'a\nb'], ['U+202E', 'a\u202Eb'],
      ['121 characters', 'x'.repeat(121)],
    ];
    // The propose limiter allows 10 a minute, so each batch gets a fresh app on the same repository.
    let current = s;
    let sent = 0;
    for (const status of ['canonical', 'descriptive']) {
      for (const [label, domain] of bad) {
        if (sent === 9) {
          nothing(current, 'B1');
          await current.harness.stop();
          harness = null;
          current = await start(root);
          sent = 0;
        }
        const res = await register(current, domain, status);
        sent += 1;
        assert.equal(res.status, 400, `${status} ${label}: ${JSON.stringify(res.body)}`);
        assert.ok(res.body.error, label);
      }
    }
    nothing(current, 'B1');
  });

  test('byte-exact reuse: non-ASCII registered domains are allowed only for proposed, descriptive or historical', async () => {
    const rows = [SELF, RUNTIME, row('cafe', 'caf\u00E9', '[Cafe](architecture/CAFE.md)', 'descriptive'),
      row('cyr', 'runtim\u0435', '[Cyr](architecture/CYR.md)', 'descriptive'), row('hf', 'run\u3164time', '[HF](architecture/HF.md)', 'descriptive')];
    const s = await start(repo(rows));
    for (const domain of ['runtim\u0435', 'run\u3164time', 'caf\u00E9']) {
      const res = await register(s, domain, 'canonical');
      assert.equal(res.status, 400, `byte-equal canonical ${JSON.stringify(domain)}: ${JSON.stringify(res.body)}`);
    }
    const caseDiff = await register(s, 'Caf\u00E9', 'descriptive');
    assert.equal(caseDiff.status, 400, 'not byte-equal and not ASCII');
    nothing(s, 'byte-exact refusals');
    const ok = await register(s, 'caf\u00E9', 'descriptive');
    assert.equal(ok.status, 202, JSON.stringify(ok.body));
    const summary = String(s.queue[0].sentinelSummary);
    assert.ok(summary.startsWith('Architecture authority:'), summary);
    assert.ok(summary.includes('caf[U+00E9]') && summary.indexOf('caf[U+00E9]') < summary.indexOf(NOTES), summary);
  });

  test('supersede action: a superseded or successor row with a non-ASCII domain is 400 with nothing recorded', async () => {
    const s = await start(repo([SELF, RUNTIME, STORAGE, row('cyr', 'runtim\u0435', '[Cyr](architecture/CYR.md)', 'canonical')]));
    const res = await post(s, { path: 'docs/architecture/CYR.md', action: 'supersede', supersededBy: 'storage' });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    nothing(s, 'superseded row');
    await s.harness.stop();
    harness = null;
    // Successor charset (lead fold 1): canonical ASCII A, proposed look-alike B; supersede A by B.
    const s2 = await start(repo([SELF, RUNTIME, row('b', 'runtim\u0435', '[B](architecture/B.md)', 'proposed')]));
    const res2 = await post(s2, { path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'b' });
    assert.equal(res2.status, 400, JSON.stringify(res2.body));
    nothing(s2, 'successor row');
  });

  test('a canonical row with a non-ASCII domain blocks canonical registrations and supersessions (both exits listed); descriptive is 202', async () => {
    const rows = [SELF, RUNTIME, STORAGE, row('cyr', 'runtim\u0435', '[Cyr](architecture/CYR.md)', 'canonical')];
    const s = await start(repo(rows));
    const get = await s.harness.request({ path: '/api/v1/architecture/index' });
    const finding = get.body.authority.findings.find((f: { kind: string }) => f.kind === 'domain-non-ascii');
    assert.deepEqual(finding.codePoints, ['U+0435']);
    for (const body of [{ path: NOTES, action: 'register', domain: 'scheduler', status: 'canonical' },
      { path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'storage' }]) {
      const res = await post(s, body);
      assert.equal(res.status, 409, JSON.stringify(res.body));
      assert.equal(res.body.conflict, 'ambiguous-authority');
      assert.equal(res.body.reason, 'non-ascii-domain');
      assert.deepEqual(res.body.rows.map((r: { id: string; line: number }) => [r.id, r.line]), [['cyr', lineOf(indexText(rows), '| cyr |')]]);
      assert.deepEqual(res.body.exits, ['rename-domain-to-ascii', 'change-status-from-canonical']);
    }
    nothing(s, 'wedge');
    const desc = await register(s, 'scheduler', 'descriptive');
    assert.equal(desc.status, 202, JSON.stringify(desc.body));
  });

  test('an ambiguous index: a bad-status row in the domain, or a duplicate id in a supersession, is 409 ambiguous-authority', async () => {
    const s = await start(repo([SELF, RUNTIME, row('runtime-old', 'runtime', '[Old](architecture/OLD.md)', 'Canonical')]));
    const bad = await register(s, 'runtime', 'canonical', { supersedes: ['runtime'] });
    assert.equal(bad.status, 409, JSON.stringify(bad.body));
    assert.deepEqual([bad.body.conflict, bad.body.reason], ['ambiguous-authority', 'bad-status']);
    nothing(s, 'bad-status');
    await s.harness.stop();
    harness = null;
    const s2 = await start(repo([SELF, RUNTIME, row('runtime', 'runtime', '[Dup](architecture/DUP.md)', 'descriptive')]));
    const dup = await register(s2, 'runtime', 'canonical', { supersedes: ['runtime'] });
    assert.equal(dup.status, 409, JSON.stringify(dup.body));
    assert.deepEqual([dup.body.conflict, dup.body.reason], ['ambiguous-authority', 'duplicate-id']);
    nothing(s2, 'duplicate-id');
  });

  test('status and supersedes validation; proposed neither blocks nor is blocked; a distinct domain on an overlapping path is 202', async () => {
    const s = await start(repo());
    const cases: Array<[string, Record<string, unknown>]> = [
      ['status superseded', { domain: 'scheduler', status: 'superseded' }],
      ['status Canonical', { domain: 'scheduler', status: 'Canonical' }],
      ['unknown id', { domain: 'runtime', status: 'canonical', supersedes: ['ghost'] }],
      ['non-canonical id', { domain: 'runtime', status: 'canonical', supersedes: ['runtime', 'runtime-v2'] }],
      ['no canonical in domain', { domain: 'scheduler', status: 'canonical', supersedes: ['runtime'] }],
      ['descriptive with supersedes', { domain: 'runtime', status: 'descriptive', supersedes: ['runtime'] }],
      ['proposed with supersedes', { domain: 'runtime', status: 'proposed', supersedes: ['runtime'] }],
    ];
    for (const [label, extra] of cases) {
      const res = await post(s, { path: NOTES, action: 'register', ...extra });
      assert.equal(res.status, 400, `${label}: ${JSON.stringify(res.body)}`);
    }
    nothing(s, 'validation');
    const proposed = await register(s, 'runtime', 'proposed');
    assert.equal(proposed.status, 202, `proposed into a canonical domain: ${JSON.stringify(proposed.body)}`);
    const desc = await post(s, { path: 'docs/architecture/RUNTIME_V2.md', action: 'register', domain: 'x', status: 'descriptive' });
    assert.equal(desc.status, 400, 'a registered document is not a candidate');
    await s.harness.stop();
    harness = null;
    const s2 = await start(repo());
    const d = await register(s2, 'runtime', 'descriptive');
    assert.equal(d.status, 202);
    const payload = (s2.ledger as FakeLedger).entries[0].payload;
    assert.deepEqual((payload.existingAuthority as Array<{ id: string }>).map((r) => r.id), ['runtime']);
    await s2.harness.stop();
    harness = null;
    const s3 = await start(repo());
    const distinct = await register(s3, 'runtime notes', 'canonical');
    assert.equal(distinct.status, 202, 'string overlap is not proof of the same domain');
  });

  test('B2 pending authority: sequential and concurrent registrations, approval not applied, applied, removed again', async () => {
    const root = repo();
    write(root, 'docs/architecture/SCHED_A.md', '# a\n');
    write(root, 'docs/architecture/SCHED_B.md', '# b\n');
    const s = await start(root);
    const first = await post(s, { path: 'docs/architecture/SCHED_A.md', action: 'register', domain: 'scheduler', status: 'canonical' });
    assert.equal(first.status, 202, JSON.stringify(first.body));
    const second = await post(s, { path: 'docs/architecture/SCHED_B.md', action: 'register', domain: 'Scheduler', status: 'canonical' });
    assert.equal(second.status, 409, JSON.stringify(second.body));
    assert.equal(second.body.conflict, 'pending-authority');
    assert.deepEqual(second.body.pending, ['l3-1']);
    assert.equal(s.queue.length, 1);
    approve(s, 'l3-1');
    const third = await post(s, { path: 'docs/architecture/SCHED_B.md', action: 'register', domain: 'scheduler', status: 'canonical' });
    assert.equal(third.status, 409);
    assert.deepEqual(third.body.approvedNotInIndex.map((x: { entryId: number }) => x.entryId), [first.body.ledgerEntryId]);
    assert.match(third.body.error, /Add a row for docs\/architecture\/SCHED_A\.md to the index by hand/);
    // Applied: the operator edits the index; the normal canonical-exists path applies.
    const applied = [SELF, RUNTIME, STORAGE, RUNTIME_V2, row('sched-a', 'scheduler', '[A](architecture/SCHED_A.md)', 'canonical')];
    fs.writeFileSync(path.join(root, INDEX), indexText(applied));
    const fourth = await post(s, { path: 'docs/architecture/SCHED_B.md', action: 'register', domain: 'scheduler', status: 'canonical' });
    assert.equal(fourth.status, 409);
    assert.equal(fourth.body.conflict, 'canonical-exists');
    // Removed again by hand (lead fold 5): the approval blocks again.
    fs.writeFileSync(path.join(root, INDEX), indexText([SELF, RUNTIME, STORAGE, RUNTIME_V2]));
    const fifth = await post(s, { path: 'docs/architecture/SCHED_B.md', action: 'register', domain: 'scheduler', status: 'canonical' });
    assert.equal(fifth.status, 409);
    assert.equal(fifth.body.conflict, 'pending-authority');
    assert.match(fifth.body.error, /Add a row for docs\/architecture\/SCHED_A\.md to the index by hand/);
    assert.equal(s.queue.length, 0);
  });

  test('B2: two concurrent canonical registrations for a fresh domain queue exactly one', async () => {
    const root = repo();
    write(root, 'docs/architecture/SCHED_A.md', '# a\n');
    write(root, 'docs/architecture/SCHED_B.md', '# b\n');
    // A slow append keeps the first request inside the locked section while the second re-checks:
    // without the lock both would pass the re-check and both would be queued.
    const s = await start(root, { ledger: fakeLedger(300) });
    const results = await Promise.all(['SCHED_A', 'SCHED_B'].map((n) =>
      post(s, { path: `docs/architecture/${n}.md`, action: 'register', domain: 'scheduler', status: 'canonical' })));
    assert.deepEqual(results.map((r) => r.status).sort(), [202, 409]);
    assert.equal(s.queue.length, 1);
    assert.equal(s.proposals(), 1);
  });

  test('B2: queue states, a pending proposed item, two supersessions of one row, an approved supersession whose row is gone', async () => {
    const root = repo();
    const s = await start(root);
    s.queue.push({ id: 'x-rejected', state: 'REJECTED', kind: 'architecture-doc-proposal', sentinelSummary: '', filePath: 'a',
      meta: { action: 'register', status: 'canonical', domain: 'scheduler', path: 'docs/architecture/X.md', supersedes: [] } });
    s.queue.push({ id: 'x-proposed', state: 'QUEUED', kind: 'architecture-doc-proposal', sentinelSummary: '', filePath: 'b',
      meta: { action: 'register', status: 'proposed', domain: 'scheduler', path: 'docs/architecture/Y.md', supersedes: [] } });
    const ok = await register(s, 'scheduler', 'canonical');
    assert.equal(ok.status, 202, `rejected and proposed items do not block: ${JSON.stringify(ok.body)}`);
    s.queue.splice(0, s.queue.length, { id: 'x-approved', state: 'APPROVED', kind: 'architecture-doc-proposal', sentinelSummary: '', filePath: 'c',
      meta: { action: 'register', status: 'canonical', domain: 'storage two', path: 'docs/architecture/Z.md', supersedes: [] } });
    write(root, 'docs/architecture/S2.md', '# s2\n');
    const blocked = await post(s, { path: 'docs/architecture/S2.md', action: 'register', domain: 'storage two', status: 'canonical' });
    assert.equal(blocked.status, 409, 'an APPROVED state still in the queue blocks');
    assert.deepEqual(blocked.body.pending, ['x-approved']);
    s.queue.splice(0, s.queue.length);
    const sup1 = await post(s, { path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'storage' });
    assert.equal(sup1.status, 202, JSON.stringify(sup1.body));
    const sup2 = await post(s, { path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'runtime-v2' });
    assert.equal(sup2.status, 409);
    assert.equal(sup2.body.conflict, 'pending-authority');
    const sup3 = await register(s, 'runtime', 'canonical', { supersedes: ['runtime'] });
    assert.equal(sup3.status, 409, 'a register naming the same row is blocked too');
    approve(s, s.queue[0].id);
    fs.writeFileSync(path.join(root, INDEX), indexText([SELF, STORAGE, RUNTIME_V2]));
    const after = await post(s, { path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'runtime-v2' });
    assert.equal(after.status, 202, `the superseded row is gone: reflected: ${JSON.stringify(after.body)}`);
  });

  test('B2: no queue reader or a throwing reader is 503 pending unknown; the lock is released after a throw inside it', async () => {
    const root = repo();
    const s = await start(root);
    s.state.reader = () => { throw new Error('queue unreadable'); };
    const thrown = await register(s, 'scheduler', 'canonical');
    assert.equal(thrown.status, 503);
    assert.equal(thrown.body.pending, 'unknown');
    // Lead fold 2: the reader succeeds before the lock and throws inside it.
    let calls = 0;
    s.state.reader = () => { calls += 1; if (calls === 2) throw new Error('inside the lock'); return []; };
    const inside = await register(s, 'scheduler', 'canonical');
    assert.equal(inside.status, 503, JSON.stringify(inside.body));
    assert.equal(calls, 2, 'the second read is the one under the lock');
    s.state.reader = null;
    const next = await register(s, 'scheduler', 'canonical');
    assert.equal(next.status, 202, `the lock was released: ${JSON.stringify(next.body)}`);
    // pendingCheck catches reader errors, so the throw that must escape the locked section is the
    // queue write (after the PROPOSAL append, B258). Without the `finally` release the next request hangs.
    write(root, 'docs/architecture/SCHED_C.md', '# c\n');
    write(root, 'docs/architecture/SCHED_D.md', '# d\n');
    s.state.queueThrows = true;
    const failed = await post(s, { path: 'docs/architecture/SCHED_C.md', action: 'register', domain: 'other', status: 'descriptive' });
    assert.equal(failed.status, 500, JSON.stringify(failed.body));
    const after = await post(s, { path: 'docs/architecture/SCHED_D.md', action: 'register', domain: 'other', status: 'descriptive' });
    assert.equal(after.status, 202, `the lock was released after a throw escaped it: ${JSON.stringify(after.body)}`);
    await s.harness.stop();
    harness = null;
    const app = makeApp();
    setupArchitectureIndexRoutes(app, {
      rejectIfRemote: () => false, workspaceRoot: root, getLedgerManager: () => fakeLedger(),
      queueL3Approval: async () => 'x', openFileInEditor: async () => undefined, confirmOperatorAction: async () => 'approved',
    } as unknown as ArchitectureIndexRouteDeps);
    harness = new RouteHarness(app);
    await harness.start();
    const noReader = await harness.request({ method: 'POST', path: PROPOSE, body: { path: NOTES, action: 'register', domain: 'scheduler', status: 'canonical' } });
    assert.equal(noReader.status, 503);
    assert.equal(noReader.body.pending, 'unknown');
  });

  test('supersession confirmation: declined, busy, unwired, expired and cancelled record nothing', async () => {
    const body = { path: NOTES, action: 'register', domain: 'runtime', status: 'canonical', supersedes: ['runtime'] };
    for (const [answer, status] of [['declined', 409], ['busy', 429]] as Array<[OperatorConfirmation, number]>) {
      const s = await start(repo());
      s.state.answer = answer;
      const res = await post(s, body);
      assert.equal(res.status, status, `${answer}: ${JSON.stringify(res.body)}`);
      assert.equal(s.shown.length, 1);
      assert.equal(s.proposals(), 0);
      assert.equal(s.queue.length, 0);
      await s.harness.stop();
      harness = null;
    }
    const unwired = await start(repo(), { confirm: null });
    const u = await post(unwired, body);
    assert.equal(u.status, 503);
    assert.equal(unwired.proposals(), 0);
    await unwired.harness.stop();
    harness = null;
    const shownExp: OperatorActionRequest[] = [];
    const expired = await start(repo(), { deadlineMs: 30, confirm: async (r) => { shownExp.push(r); await delay(150); return 'approved'; } });
    const e = await post(expired, body);
    assert.equal(e.status, 410, JSON.stringify(e.body));
    await delay(200);
    assert.equal(expired.proposals(), 0);
    assert.equal(expired.queue.length, 0);
    await expired.harness.stop();
    harness = null;
    let approveLater: (v: OperatorConfirmation) => void = () => undefined;
    let markShown: () => void = () => undefined;
    const shownP = new Promise<void>((r) => { markShown = r; });
    const cancelled = await start(repo(), { confirm: () => { markShown(); return new Promise((res) => { approveLater = res; }); } });
    const port = (cancelled.harness as unknown as { port: number }).port;
    const payload = JSON.stringify(body);
    const client = http.request({ host: '127.0.0.1', port, path: PROPOSE, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) } });
    client.on('error', () => undefined);
    client.write(payload);
    client.end();
    await Promise.race([shownP, delay(3000)]);
    client.destroy();
    await delay(100);
    approveLater('approved');
    await delay(200);
    assert.equal(cancelled.proposals(), 0);
    assert.equal(cancelled.queue.length, 0);
  });

  test('approved supersession: one dialog with the full path, and exactly what was shown is recorded', async () => {
    const long = `docs/architecture/${'L'.repeat(183)}.md`;
    const root = repo();
    write(root, long, '# long\n');
    const text = indexText([SELF, RUNTIME, STORAGE, RUNTIME_V2]);
    const s = await start(root);
    const res = await post(s, { path: long, action: 'register', domain: 'runtime', status: 'canonical', supersedes: ['runtime'],
      sourceSha: 'f'.repeat(40), docSha256: '0'.repeat(64) });
    assert.equal(res.status, 202, JSON.stringify(res.body));
    assert.equal(s.shown.length, 1);
    const dialog = s.shown[0];
    assert.equal(dialog.title, SUPERSEDE_TITLE);
    const head = git(root, 'rev-parse', 'HEAD');
    const runtimeSha = sha(fs.readFileSync(path.join(root, 'docs', 'architecture', 'RUNTIME.md')));
    for (const v of ['Domain (as requested): runtime', 'Status (as requested): canonical', long, head, runtimeSha,
      `line ${lineOf(text, '| runtime |')}`]) {
      assert.ok(dialog.detail.includes(v), `dialog shows ${v.slice(0, 40)}`);
    }
    const opId = /op_[0-9a-f-]{36}/.exec(dialog.detail)?.[0];
    assert.ok(opId, 'operation id shown');
    const entry = (s.ledger as FakeLedger).entries[0];
    assert.equal(entry.eventType, 'PROPOSAL');
    const p = entry.payload;
    assert.equal(p.operationId, opId);
    assert.equal((p.authentication as { method: string }).method, 'vscode-modal-confirmation');
    assert.equal(p.sourceSha, head);
    assert.equal(p.indexSha256, sha(fs.readFileSync(path.join(root, INDEX))));
    assert.equal(p.path, long);
    assert.equal(p.docSha256, sha('# long\n'));
    assert.deepEqual(p.supersedes, ['runtime']);
    assert.deepEqual((p.existingAuthority as Array<{ id: string; docSha256: string; line: number }>).map((r) => [r.id, r.docSha256, r.line]),
      [['runtime', runtimeSha, lineOf(text, '| runtime |')]]);
    assert.equal(p.kind, 'architecture-doc-supersede');
    assert.equal(s.queue.length, 1);
    assert.equal(s.queue[0].kind, 'architecture-doc-supersede');
    assert.equal(s.queue[0].sourceLedgerEntryId, entry.id);
    assert.ok(String(s.queue[0].sentinelSummary).startsWith('Architecture authority: canonical for "runtime", superseding runtime.'),
      s.queue[0].sentinelSummary);
  });

  test('freshness under the lock: a change of state, index, document or HEAD during the dialog records nothing', async () => {
    const body = { path: NOTES, action: 'register', domain: 'runtime', status: 'canonical', supersedes: ['runtime'] };
    const changes: Array<[string, (root: string) => void]> = [
      ['index', (root) => fs.appendFileSync(path.join(root, INDEX), '\n')],
      ['document', (root) => fs.appendFileSync(path.join(root, 'docs', 'architecture', 'RUNTIME.md'), 'edit\n')],
      ['head', (root) => commit(root, 'moved on')],
      ['state', (root) => fs.writeFileSync(path.join(root, INDEX), '# Architecture Index\n\nno registry\n')],
    ];
    for (const [stale, change] of changes) {
      const root = repo();
      const s = await start(root, { onShow: () => change(root) });
      const res = await post(s, body);
      assert.equal(res.status, 409, `${stale}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.stale, stale);
      assert.equal(s.proposals(), 0);
      assert.equal(s.queue.length, 0);
      await s.harness.stop();
      harness = null;
    }
  });

  test('the Console request guard runs on propose: a foreign Origin is 403 and text/plain is 415, nothing run', async () => {
    const s = await start(repo());
    const origin = await post(s, { path: NOTES, action: 'register', domain: 'x', status: 'descriptive' }, { origin: 'http://evil.example' });
    assert.equal(origin.status, 403);
    assert.equal(origin.body.guard, 'origin');
    const plain = await s.harness.request({ method: 'POST', path: PROPOSE, rawBody: '{}', headers: { 'content-type': 'text/plain' } });
    assert.equal(plain.status, 415);
    nothing(s, 'guard');
  });

  // review531 B1: a row with the wrong cell count never reaches the parsed rows, so it could hide a canonical row.
  test('review B1: a registry row with the wrong cell count blocks canonical registrations and supersessions (409 bad-row)', async () => {
    const twelve = '| auth | auth | [A](architecture/A.md) | canonical | team|x | - | - | - | unknown | unknown | manual |';
    const rows = [SELF, RUNTIME, STORAGE, twelve];
    const s = await start(repo(rows));
    for (const body of [{ path: NOTES, action: 'register', domain: 'auth', status: 'canonical' },
      { path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'storage' }]) {
      const res = await post(s, body);
      assert.equal(res.status, 409, JSON.stringify(res.body));
      assert.deepEqual([res.body.conflict, res.body.reason], ['ambiguous-authority', 'bad-row']);
      assert.deepEqual(res.body.lines, [lineOf(indexText(rows), '| auth | auth |')]);
      assert.deepEqual(res.body.exits, ['fix-row']);
    }
    nothing(s, 'bad-row');
    const desc = await register(s, 'auth', 'descriptive');
    assert.equal(desc.status, 202, 'a descriptive registration is not authority');
  });

  // review531 B2: a canonical domain with hidden characters already in the index passes the ASCII charset.
  test('review B2: a canonical domain with hidden characters blocks canonical work and the supersede intake', async () => {
    const rows = [SELF, RUNTIME, STORAGE, row('ac', 'auth  core', '[AC](architecture/AC.md)', 'canonical')];
    const s = await start(repo(rows));
    const reg = await register(s, 'auth core', 'canonical');
    assert.equal(reg.status, 409, JSON.stringify(reg.body));
    assert.deepEqual([reg.body.conflict, reg.body.reason], ['ambiguous-authority', 'hidden-character-domain']);
    assert.deepEqual(reg.body.rows.map((r: { id: string; line: number }) => [r.id, r.line]), [['ac', lineOf(indexText(rows), '| ac |')]]);
    assert.deepEqual(reg.body.exits, ['rename-domain-to-ascii', 'change-status-from-canonical']);
    const sup = await post(s, { path: 'docs/architecture/AC.md', action: 'supersede', supersededBy: 'storage' });
    assert.equal(sup.status, 400, JSON.stringify(sup.body));
    assert.match(sup.body.error, /two or more spaces/);
    nothing(s, 'hidden-character domain');
  });

  test('review N1: a document over 2 MiB is refused up front, not left permanently stale', async () => {
    const root = repo();
    write(root, 'docs/architecture/BIG.md', `# big\n${'x'.repeat(2 * 1024 * 1024 + 10)}\n`);
    const s = await start(root);
    const big = await post(s, { path: 'docs/architecture/BIG.md', action: 'register', domain: 'big', status: 'descriptive' });
    assert.equal(big.status, 400, JSON.stringify(big.body).slice(0, 300));
    assert.match(big.body.error, /too large to hash for freshness/);
    fs.writeFileSync(path.join(root, 'docs', 'architecture', 'RUNTIME.md'), `# r\n${'y'.repeat(2 * 1024 * 1024 + 10)}\n`);
    const replaced = await register(s, 'runtime', 'canonical', { supersedes: ['runtime'] });
    assert.equal(replaced.status, 400, JSON.stringify(replaced.body).slice(0, 300));
    assert.match(replaced.body.error, /too large to hash for freshness/);
    nothing(s, 'too large');
  });

  test('review N2/N3: an approved supersession not yet in the index names the ids that must stop being canonical; its summary names the domain', async () => {
    const root = repo();
    const s = await start(root);
    const sup = await post(s, { path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'storage' });
    assert.equal(sup.status, 202, JSON.stringify(sup.body));
    assert.ok(String(s.queue[0].sentinelSummary).startsWith('Architecture authority: supersede runtime ("runtime") with storage.'),
      s.queue[0].sentinelSummary);
    approve(s, s.queue[0].id);
    const again = await register(s, 'runtime', 'canonical', { supersedes: ['runtime'] });
    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.equal(again.body.conflict, 'pending-authority');
    assert.deepEqual(again.body.approvedNotInIndex.map((x: { stillCanonical: string[] }) => x.stillCanonical), [['runtime']]);
    assert.match(again.body.error, /change runtime from canonical in the index by hand/);
  });

  test('review N6: a supersession naming a row id with hidden characters is refused', async () => {
    const rows = [SELF, STORAGE, row('run\u200Btime', 'runtime', '[R](architecture/RUNTIME.md)', 'canonical')];
    const s = await start(repo(rows));
    const reg = await register(s, 'runtime', 'canonical', { supersedes: ['run\u200Btime'] });
    assert.equal(reg.status, 400, JSON.stringify(reg.body));
    assert.match(reg.body.error, /U\+200B/);
    const sup = await post(s, { path: 'docs/architecture/STORAGE.md', action: 'supersede', supersededBy: 'run\u200Btime' });
    assert.equal(sup.status, 400, JSON.stringify(sup.body));
    assert.match(sup.body.error, /U\+200B/);
    nothing(s, 'hidden id');
  });

  // review531b R1: rows the parser used to skip silently, so a canonical row vanished from authority checks.
  const registry = (body: string[]): string => ['# Architecture Index', '', '## Registry', '', ...body, '',
    '## Normative scope', '', '```architecture-normative', 'docs/architecture/**/*.md', 'docs/ARCHITECTURE*.md', '```', '',
    '## Legacy', '', '```architecture-legacy', 'docs/archive/**', '```', ''].join('\n');
  const withIndex = (text: string): string => {
    const root = repo([SELF, RUNTIME, STORAGE]);
    fs.writeFileSync(path.join(root, INDEX), text);
    return root;
  };

  test('review R1: a broken delimiter makes the index invalid, so a second canonical registration is refused', async () => {
    const variants: Array<[string, string[]]> = [
      ['delimiter without a leading pipe', [HEADER, SEP.slice(1), SELF, RUNTIME, STORAGE]],
      ['no delimiter row', [HEADER, SELF, RUNTIME, STORAGE]],
      ['a data row between the header and the delimiter', [HEADER, RUNTIME, SEP, SELF, STORAGE]],
      ['a blank line between the header and the delimiter', [HEADER, '', SEP, SELF, RUNTIME, STORAGE]],
    ];
    for (const [label, body] of variants) {
      const s = await start(withIndex(registry(body)));
      const res = await register(s, 'runtime', 'canonical');
      assert.equal(res.status, 409, `${label}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.state, 'invalid', `${label}: the index is invalid, not silently short a row`);
      nothing(s, label);
      await s.harness.stop();
      harness = null;
    }
  });

  test('review R1: a data row without a leading pipe is an unreadable row (409 bad-row with its line)', async () => {
    const pipeless = RUNTIME.slice(1);
    const text = registry([HEADER, SEP, SELF, pipeless, STORAGE]);
    const s = await start(withIndex(text));
    const res = await register(s, 'runtime', 'canonical');
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.deepEqual([res.body.conflict, res.body.reason], ['ambiguous-authority', 'bad-row']);
    assert.deepEqual(res.body.lines, [lineOf(text, pipeless)]);
    nothing(s, 'pipe-less row');
    const desc = await register(s, 'runtime', 'descriptive');
    assert.equal(desc.status, 202, 'descriptive registrations stay allowed while a bad row exists');
  });

  test('review R1/7: a fenced example inside the Registry section is not a registry row', async () => {
    const example = row('example', 'scheduler', '[Example](architecture/EXAMPLE.md)', 'canonical');
    const text = registry([HEADER, SEP, SELF, RUNTIME, STORAGE, '', 'For example:', '', '```markdown', HEADER, SEP, example, '```']);
    const s = await start(withIndex(text));
    const get = await s.harness.request({ path: '/api/v1/architecture/index' });
    assert.ok(!get.body.rows.some((r: { id: string }) => r.id === 'example'), 'the fenced row is not parsed');
    const res = await register(s, 'scheduler', 'canonical');
    assert.equal(res.status, 202, `the fenced example claims no authority: ${JSON.stringify(res.body)}`);
  });

  test('review fold 2: a supersession is refused while a third canonical row has a hidden-character domain', async () => {
    const s = await start(repo([SELF, RUNTIME, STORAGE, row('ac', 'auth  core', '[AC](architecture/AC.md)', 'canonical')]));
    const res = await post(s, { path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'storage' });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.deepEqual([res.body.conflict, res.body.reason], ['ambiguous-authority', 'hidden-character-domain']);
    nothing(s, 'third canonical row');
  });

  test('review fold 4: a Cyrillic row id reaches people as [U+XXXX] (refusal text, L3 summary, dialog)', async () => {
    const cyr = 'r\u0443ntime';
    const s = await start(repo([SELF, STORAGE, row(cyr, 'runtime', '[R](architecture/RUNTIME.md)', 'canonical')]));
    const exists = await register(s, 'runtime', 'canonical');
    assert.equal(exists.status, 409, JSON.stringify(exists.body));
    assert.match(exists.body.error, /r\[U\+0443\]ntime at line/);
    const sup = await register(s, 'runtime', 'canonical', { supersedes: [cyr] });
    assert.equal(sup.status, 202, JSON.stringify(sup.body));
    assert.match(s.shown[0].detail, /Replaces: r\[U\+0443\]ntime /);
    assert.match(String(s.queue[0].sentinelSummary), /superseding r\[U\+0443\]ntime\./);
  });

  test('review fold 6: a canonical row with an empty domain has its own refusal', async () => {
    const s = await start(repo([SELF, RUNTIME, row('blank', '-', '[B](architecture/BLANK.md)', 'canonical')]));
    const res = await register(s, 'scheduler', 'canonical');
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.deepEqual([res.body.conflict, res.body.reason], ['ambiguous-authority', 'empty-domain']);
    assert.match(res.body.error, /no domain/);
    assert.doesNotMatch(res.body.error, /characters outside/);
    nothing(s, 'empty domain');
  });

  test('real ledger: the PROPOSAL carries HEAD; an architecture L3_APPROVED blocks even behind 1200 later approvals', async function () {
    this.timeout(180000);
    env = makeEnv();
    realLedger = await openLedger(env);
    const root = repo();
    const s = await start(root, { ledger: realLedger });
    const res = await register(s, 'scheduler', 'canonical');
    assert.equal(res.status, 202, JSON.stringify(res.body));
    const entry = await realLedger.getEntryById(res.body.ledgerEntryId);
    assert.equal(entry?.eventType, 'PROPOSAL');
    assert.equal(entry?.payload.sourceSha, git(root, 'rev-parse', 'HEAD'));
    s.queue.splice(0, s.queue.length);
    // Lead fold 3: the architecture approval is appended FIRST, so newest-first order puts it last.
    await realLedger.appendEntry({ eventType: 'L3_APPROVED', agentDid: ARCH_DID, agentTrustAtAction: 0,
      payload: { sourceLedgerEntryId: res.body.ledgerEntryId } } as never);
    for (let i = 0; i < 1200; i += 1) {
      await realLedger.appendEntry({ eventType: 'L3_APPROVED', agentDid: 'did:test:other', agentTrustAtAction: 0,
        payload: { sourceLedgerEntryId: 1 } } as never);
    }
    write(root, 'docs/architecture/SCHED_B.md', '# b\n');
    const blocked = await post(s, { path: 'docs/architecture/SCHED_B.md', action: 'register', domain: 'scheduler', status: 'canonical' });
    assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
    assert.deepEqual(blocked.body.approvedNotInIndex.map((x: { entryId: number }) => x.entryId), [res.body.ledgerEntryId]);
  });
});

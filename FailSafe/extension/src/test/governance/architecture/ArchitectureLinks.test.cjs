/**
 * B311/B312 (plan-b311-b312 LD3-LD5, LD11): registry links, decision links and affected decisions.
 *
 * Review text and code-point-safe caps (core); affected decisions (pure matching and the bounded
 * describe path: no git, no per-file I/O, a time budget); registry links on real temp git
 * repositories; decision links over a fake ledger.
 *
 * Runs standalone after `npm run compile`: node --test src/test/governance/architecture/ArchitectureLinks.test.cjs
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const extRoot = path.join(__dirname, '..', '..', '..', '..');
const outDir = path.join(extRoot, 'out');
const core = require(path.join(extRoot, 'scripts', 'lib', 'architecture-index-core.cjs'));
const wrapper = require(path.join(outDir, 'governance', 'architecture', 'architectureIndexCore.js'));
const discovery = require(path.join(outDir, 'governance', 'architecture', 'ArchitectureIndexDiscovery.js'));
const authority = require(path.join(outDir, 'governance', 'architecture', 'architectureAuthority.js'));
const affected = require(path.join(outDir, 'governance', 'architecture', 'affectedArchitecture.js'));
const proposal = require(path.join(outDir, 'governance', 'architecture', 'ArchitectureIndexProposal.js'));
const { removeTempTree } = require('../../shared/removeTempTree.cjs');

const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';
const SEP = '|---|---|---|---|---|---|---|---|---|---|---|';
const INDEX = 'docs/ARCHITECTURE_INDEX.md';
const ARCH_DID = 'did:failsafe:agent:architecture-index';
const made = [];
const junctions = [];
test.after(() => {
  for (const j of junctions) { try { fs.unlinkSync(j); } catch { /* gone */ } }
  for (const d of made) removeTempTree(d);
});

function tmp() {
  const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-arch-links-')));
  made.push(d);
  return d;
}

function git(root, ...args) {
  const r = childProcess.spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
}

function write(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

/** A registry row; `o` sets supersedes, related, governance_ref, contract and verification. */
function row(id, domain, link, status, o = {}) {
  return `| ${id} | ${domain} | ${link} | ${status} | manual | ${o.supersedes ?? '-'} | ${o.related ?? '-'} | ${o.gov ?? '-'} | ` +
    `${o.contract ?? 'unknown'} | ${o.verification ?? 'unknown'} | manual |`;
}

function indexText(rows) {
  return ['# Architecture Index', '', '## Registry', '', HEADER, SEP, ...rows, '',
    '## Normative scope', '', '```architecture-normative', 'docs/architecture/**/*.md', 'docs/ARCHITECTURE*.md', '```', '',
    '## Legacy', '', '```architecture-legacy', 'docs/archive/**', '```', ''].join('\n');
}

const SELF = row('architecture-navigation', 'architecture navigation', '[Architecture Index](ARCHITECTURE_INDEX.md)', 'canonical');
const AFFECT_ROWS = [
  SELF,
  row('runtime', 'runtime', '[R](architecture/RUNTIME.md)', 'canonical', { contract: '`src/runtime/engine.ts`', verification: '`src/test/runtime.test.ts`' }),
  row('storage', 'storage', '[S](architecture/STORAGE.md)', 'proposed', { contract: '`src/storage/db.ts`' }),
  row('overview', 'overview', '[O](architecture/OVERVIEW.md)', 'descriptive', { contract: '`src/runtime/engine.ts`' }),
  row('old', 'old runtime', '[Old](architecture/OLD.md)', 'superseded', { contract: '`src/runtime/engine.ts`' }),
  row('hist', 'history', '[H](architecture/HIST.md)', 'historical', { contract: '`src/runtime/engine.ts`' }),
  row('globby', 'globs', '[G](architecture/GLOB.md)', 'canonical', { contract: '`src/**/*.ts`' }),
  row('gone', 'gone', '[Gone](architecture/GONE.md)', 'canonical', { contract: '`src/deleted.ts`' }),
];

// ---------------------------------------------------------------- review text

test('reviewText renders hidden code points as [U+XXXX] and leaves other text alone', () => {
  assert.equal(core.reviewText('docs/\u202Eevil.md'), 'docs/[U+202E]evil.md');
  assert.equal(core.reviewText('a\tb\u00A0c\u200Bd'), 'a[U+0009]b[U+00A0]c[U+200B]d');
  assert.equal(core.reviewText('caf\u00E9 notes and \u0440\u0443\u0441'), 'caf\u00E9 notes and \u0440\u0443\u0441', 'documentation text is not ASCII-restricted');
});

test('caps are applied after rendering and are code-point safe (no split token, no lone surrogate)', () => {
  const rlo = core.reviewText('\u202E'.repeat(100) + 'docs/x.md', 240);
  assert.ok(Array.from(rlo).length <= 240, rlo.length);
  assert.ok(rlo.endsWith('...'));
  assert.ok(/^(?:\[U\+202E\])+\.\.\.$/.test(rlo), `only whole tokens before the ellipsis: ${rlo.slice(-20)}`);
  const astral = core.reviewText('a'.repeat(236) + '\u{1F600}\u{1F600}\u{1F600}', 240);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(astral), 'no lone high surrogate');
  assert.equal(core.capReview('[U+202E]'.repeat(40), 30), '[U+202E][U+202E][U+202E]...');
});

// ---------------------------------------------------------------- affected decisions (pure)

test('affectedArchitecture: canonical and proposed rows by document, contract or verification; never descriptive, superseded or historical', () => {
  const root = tmp();
  const { rows } = wrapper.parseRegistryText(indexText(AFFECT_ROWS), INDEX);
  const inputs = ['src/runtime/engine.ts', 'docs/architecture/STORAGE.md', 'src/test/runtime.test.ts', 'src/runtime/engine2.ts',
    'src/runtime', 'src/deleted.ts', path.join(root, 'src', 'storage', 'db.ts'), '..\\outside.ts', 'src\\runtime\\engine.ts',
    './src/storage/db.ts', path.join(os.tmpdir(), 'elsewhere', 'src', 'runtime', 'engine.ts'), 'src/**/*.ts'];
  const result = affected.affectedArchitecture(rows, inputs, root, 'docs');
  const by = Object.fromEntries(result.map((r) => [r.input, r.rows.map((x) => `${x.id}:${x.via}`)]));
  assert.deepEqual(by['src/runtime/engine.ts'], ['runtime:contract']);
  assert.deepEqual(by['docs/architecture/STORAGE.md'], ['storage:document']);
  assert.deepEqual(by['src/test/runtime.test.ts'], ['runtime:verification']);
  assert.deepEqual(by['src/runtime/engine2.ts'], [], 'a sibling file does not match');
  assert.deepEqual(by['src/runtime'], [], 'a folder does not match');
  assert.deepEqual(by['src/**/*.ts'], [], 'a pattern cell is never a match, even for its own text');
  assert.deepEqual(by['src/deleted.ts'], ['gone:contract'], 'a deleted contract file still names its row');
  assert.deepEqual(by[path.join(root, 'src', 'storage', 'db.ts')], ['storage:contract'], 'an absolute path inside the workspace');
  assert.deepEqual(by['src\\runtime\\engine.ts'], ['runtime:contract'], 'backslashes');
  assert.deepEqual(by['./src/storage/db.ts'], ['storage:contract'], 'relative with ./');
  assert.equal(by['..\\outside.ts'], undefined, 'an escaping path is dropped');
  assert.equal(by[path.join(os.tmpdir(), 'elsewhere', 'src', 'runtime', 'engine.ts')], undefined, 'an absolute path outside is dropped');
  const win = affected.affectedArchitecture(rows, ['SRC/Runtime/Engine.ts'], root, 'docs')[0].rows.map((x) => x.id);
  assert.deepEqual(win, process.platform === 'win32' ? ['runtime'] : [], 'case follows isInside');
});

// ---------------------------------------------------------------- describe (bounded path)

function workspace(rows, extra = {}) {
  const root = tmp();
  write(root, INDEX, indexText(rows));
  for (const [rel, text] of Object.entries(extra)) write(root, rel, text);
  return root;
}

test('describe: lines for matched files, review text, caps and "and N more"', async () => {
  const longName = `src/${'L'.repeat(300)}.ts`;
  const rows = [...AFFECT_ROWS,
    row('rlo', 'rlo', '[RLO](architecture/RLO.md)', 'canonical', { contract: '[evil](../src/%E2%80%AEevil.ts)' }),
    row('r\u0443ntime', 'cyr', '[C](architecture/CYR.md)', 'canonical', { contract: '`src/cyr.ts`' }),
    row('long', 'long', '[L](architecture/LONG.md)', 'canonical', { contract: `\`${longName}\`` })];
  const root = workspace(rows);
  const d = await affected.describeAffectedArchitecture({ workspaceRoot: root }, ['src/runtime/engine.ts', 'src/\u202Eevil.ts', 'src/cyr.ts', longName]);
  assert.equal(d.state, 'ok');
  assert.equal(d.lines[0], 'src/runtime/engine.ts: runtime (canonical, "runtime") docs/architecture/RUNTIME.md, via contract');
  assert.ok(d.lines.some((l) => l.startsWith('src/[U+202E]evil.ts: rlo ')), d.lines.join('\n'));
  assert.ok(!d.lines.join('').includes('\u202E'), 'no raw RLO');
  assert.ok(d.lines.some((l) => l.includes('r[U+0443]ntime (canonical')));
  const capped = d.lines.find((l) => l.startsWith('src/LLL'));
  assert.ok(capped && Array.from(capped).length <= 240 && capped.endsWith('...'), capped);
  assert.deepEqual(d.byPath['src/runtime/engine.ts'], [d.lines[0]]);
  const few = await affected.describeAffectedArchitecture({ workspaceRoot: root },
    ['src/runtime/engine.ts', 'src/test/runtime.test.ts', 'src/storage/db.ts', 'src/deleted.ts'], { maxLines: 2 });
  assert.deepEqual(few.lines.slice(2), ['and 2 more']);
  assert.equal(few.lines.length, 3);
});

test('describe: index states - absent (early, no read), not a file, too large, outside, invalid, bad path', async () => {
  const empty = tmp();
  const opened = [];
  const savedOpen = fs.promises.open;
  fs.promises.open = async (...a) => { opened.push(a[0]); return savedOpen(...a); };
  try {
    const absent = await affected.describeAffectedArchitecture({ workspaceRoot: empty }, ['src/a.ts']);
    assert.deepEqual([absent.state, absent.lines], ['absent', []]);
    assert.equal(opened.length, 0, 'an absent index is never opened');
  } finally { fs.promises.open = savedOpen; }

  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'docs', 'ARCHITECTURE_INDEX.md'), { recursive: true });
  assert.deepEqual((await affected.describeAffectedArchitecture({ workspaceRoot: dir }, ['x'])).lines, ['Architecture authority not checked (not-a-file).']);

  const big = tmp();
  write(big, INDEX, 'x'.repeat(2 * 1024 * 1024 + 1));
  assert.deepEqual((await affected.describeAffectedArchitecture({ workspaceRoot: big }, ['x'])).lines, ['Architecture authority not checked (too-large).']);

  const outside = tmp();
  const target = tmp();
  write(target, 'ARCHITECTURE_INDEX.md', indexText(AFFECT_ROWS));
  fs.symlinkSync(target, path.join(outside, 'docs'), 'junction');
  junctions.push(path.join(outside, 'docs'));
  assert.deepEqual((await affected.describeAffectedArchitecture({ workspaceRoot: outside }, ['x'])).lines, ['Architecture authority not checked (outside-workspace).']);

  const invalid = workspace([]);
  fs.writeFileSync(path.join(invalid, INDEX), '# Architecture Index\n\nno registry\n');
  assert.deepEqual((await affected.describeAffectedArchitecture({ workspaceRoot: invalid }, ['x'])).lines, ['Architecture authority not checked (invalid).']);

  const badPath = await affected.describeAffectedArchitecture({ workspaceRoot: empty, indexPathSetting: '../escape.md' }, ['x']);
  assert.deepEqual(badPath.lines, ['Architecture authority not checked (bad-index-path).']);
  assert.deepEqual((await affected.describeAffectedArchitecture({ workspaceRoot: null }, ['x'])).lines, []);
});

test('describe: a read that never settles gives "not checked (timeout)" within the budget', async () => {
  const root = workspace(AFFECT_ROWS);
  const started = Date.now();
  const d = await affected.describeAffectedArchitecture({ workspaceRoot: root }, ['src/runtime/engine.ts'],
    { budgetMs: 200, readIndex: () => new Promise(() => undefined) });
  assert.ok(Date.now() - started < 450, `${Date.now() - started} ms`);
  assert.deepEqual([d.state, d.lines], ['timeout', ['Architecture authority not checked (timeout).']]);
});

test('describe: bounded I/O - no git, no sync fs, no child process; the event loop stays responsive (5,000 rows, a pathological cell)', async () => {
  const rows = [SELF];
  for (let i = 0; i < 5000; i += 1) {
    rows.push(row(`r${i}`, `domain ${i}`, `[D${i}](architecture/D${i}.md)`, 'canonical', { contract: `\`src/m${i}/index.ts\`` }));
  }
  rows.push(row('patho', 'patho', '[P](architecture/P.md)', 'canonical', { contract: '['.repeat(60000) }));
  const root = workspace(rows);
  let stubCalls = 0;
  const stubFiles = Array.from({ length: 50000 }, (_, i) => `src/f${i}.ts`).join('\0');
  const stubGit = () => { stubCalls += 1; return { kind: 'ok', stdout: stubFiles }; };
  const counts = new Map();
  const restore = [];
  const wrap = (obj, name, label) => {
    const orig = obj[name];
    if (typeof orig !== 'function') return;
    obj[name] = function (...a) { counts.set(label, (counts.get(label) ?? 0) + 1); return orig.apply(this, a); };
    for (const k of Object.keys(orig)) obj[name][k] = orig[k];
    restore.push(() => { obj[name] = orig; });
  };
  for (const name of Object.keys(fs)) if (name.endsWith('Sync')) wrap(fs, name, `fs.${name}`);
  wrap(fs.realpathSync, 'native', 'fs.realpathSync.native');
  for (const name of Object.keys(childProcess)) wrap(childProcess, name, `child_process.${name}`);
  let maxGap = 0;
  let last = Date.now();
  const timer = setInterval(() => { const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 10);
  let d;
  try {
    last = Date.now();
    d = await affected.describeAffectedArchitecture({ workspaceRoot: root, git: stubGit }, ['src/m4999/index.ts', 'src/none.ts']);
    await new Promise((r) => setTimeout(r, 30));
  } finally {
    clearInterval(timer);
    for (const r of restore.reverse()) r();
  }
  assert.equal(stubCalls, 0, 'the git runner is never called');
  assert.deepEqual([...counts.entries()].filter(([, n]) => n > 0), [], 'no sync fs and no child process during describe');
  assert.ok(maxGap < 100, `event loop lag ${maxGap} ms`);
  assert.ok(d.lines.some((l) => l.startsWith('src/m4999/index.ts: r4999 ')), d.lines.join('\n'));
  assert.ok(d.lines.includes('1 registry cell(s) over 4 KiB not checked (cell too long).'), d.lines.join('\n'));
});

// ---------------------------------------------------------------- registry links (GET)

function repo(rows, files, { ignore = '' } = {}) {
  const root = tmp();
  git(root, 'init', '-q');
  write(root, INDEX, indexText(rows));
  if (ignore) write(root, '.gitignore', ignore);
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=', 'commit', '-q', '--allow-empty', '-m', 'fixture');
  return root;
}

const LINK_ROWS = [
  SELF,
  row('runtime', 'runtime', '[R](architecture/RUNTIME.md)', 'canonical', {
    related: 'storage, ghost, cafe', supersedes: 'old',
    gov: '#769, [#530](https://github.com/o/r/issues/530), `plan-x.md`, #999',
    contract: '`src/runtime/engine.ts`, `../outside.ts`', verification: '`src/test/missing.test.ts`',
  }),
  row('storage', 'storage', '[S](architecture/STORAGE.md)', 'proposed', { contract: '`src/**/*.ts`' }),
  row('old', 'old runtime', '[Old](architecture/OLD.md)', 'superseded'),
  row('cafe', 'caf\u00E9 notes', '[C](architecture/CAFE.md)', 'descriptive', { contract: '`src/runtime/engine.ts`' }),
  row('long', 'long', '[L](architecture/LONG.md)', 'canonical', { contract: '['.repeat(5000) }),
];
const LINK_FILES = {
  'docs/architecture/RUNTIME.md': 'r', 'docs/architecture/STORAGE.md': 's', 'docs/architecture/OLD.md': 'o',
  'docs/architecture/CAFE.md': 'c', 'docs/architecture/LONG.md': 'l', 'src/runtime/engine.ts': 'e', 'plan-x.md': 'p',
  'docs/META_LEDGER.md': '# Ledger\n\n### Entry #769: SEAL\n\ntext #530 and #999 in prose\n',
};

test('registryLinks: rows with id and status, paths with states, patterns, bare #NNN only, URLs not checked, long cells', () => {
  const root = repo(LINK_ROWS, LINK_FILES, { ignore: 'plan-x.md\n' });
  const snap = discovery.discoverArchitectureIndex({ workspaceRoot: root });
  const net = [];
  const restore = [];
  for (const mod of [require('http'), require('https')]) {
    for (const name of ['request', 'get']) {
      const orig = mod[name];
      mod[name] = (...a) => { net.push(name); return orig(...a); };
      restore.push(() => { mod[name] = orig; });
    }
  }
  let list;
  try { list = authority.registryLinks(snap, { workspaceRoot: root }); } finally { for (const r of restore) r(); }
  assert.equal(net.length, 0, 'a URL is never fetched');
  const links = Object.fromEntries(list.map((l) => [l.id, l]));
  const r = links.runtime;
  assert.deepEqual([links.storage.related, links.storage.supersedes, links.storage.verification, links.storage.governanceRef],
    [[], [], [], []], '"-" and "unknown" give no link');
  assert.deepEqual(r.related.map((x) => [x.id, x.state, x.status]),
    [['storage', 'registered', 'proposed'], ['ghost', 'unregistered', null], ['cafe', 'registered', 'descriptive']]);
  assert.equal(r.related[2].domain, 'caf\u00E9 notes', 'a descriptive non-ASCII domain is shown as written (links view)');
  assert.deepEqual(r.supersedes.map((x) => [x.id, x.status]), [['old', 'superseded']]);
  assert.deepEqual(r.contract.map((x) => [x.kind, x.path ?? x.value, x.state]),
    [['path', 'src/runtime/engine.ts', 'present'], ['path', '../outside.ts', 'unsafe']]);
  assert.deepEqual(r.verification.map((x) => [x.path, x.state]), [['src/test/missing.test.ts', 'not-on-disk']]);
  const gov = r.governanceRef.map((x) => [x.kind, x.entry ?? x.path ?? x.label, x.state]);
  assert.deepEqual(gov, [['qor-ledger', 769, 'heading-found'], ['url', '#530', 'not-checked'], ['path', 'plan-x.md', 'not-listed'],
    ['qor-ledger', 999, 'heading-missing']], 'cell order; the #530 link label is never read as a ledger entry');
  assert.deepEqual(links.storage.contract.map((x) => [x.kind, x.value, x.state]), [['pattern', 'src/**/*.ts', 'not-matched']]);
  assert.equal(links.long.contract, 'too-long');
});

test('registryLinks: the ARCHITECTURE_INDEX.md:36 cell yields ledger ref 769 only', () => {
  const cell = '#769, [#530](https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/530)';
  assert.deepEqual(authority.ledgerRefs(cell), [769]);
});

test('registryLinks: no Qor ledger, an over-8-MiB ledger; link state is stat-only and memoised', () => {
  const noLedger = { ...LINK_FILES };
  delete noLedger['docs/META_LEDGER.md'];
  const a = repo(LINK_ROWS, noLedger);
  const la = authority.registryLinks(discovery.discoverArchitectureIndex({ workspaceRoot: a }), { workspaceRoot: a });
  assert.ok(la.find((l) => l.id === 'runtime').governanceRef.filter((x) => x.kind === 'qor-ledger').every((x) => x.state === 'no-ledger'));
  const b = repo(LINK_ROWS, { ...LINK_FILES, 'docs/META_LEDGER.md': '#'.repeat(8 * 1024 * 1024 + 1) });
  const lb = authority.registryLinks(discovery.discoverArchitectureIndex({ workspaceRoot: b }), { workspaceRoot: b });
  assert.ok(lb.find((l) => l.id === 'runtime').governanceRef.filter((x) => x.kind === 'qor-ledger').every((x) => x.state === 'too-large'));
  const snap = discovery.discoverArchitectureIndex({ workspaceRoot: a });
  const engine = path.join(a, 'src', 'runtime', 'engine.ts');
  const stats = [];
  const reads = [];
  const saved = { stat: fs.statSync, read: fs.readFileSync };
  fs.statSync = function (p, ...rest) { stats.push(String(p)); return saved.stat.call(this, p, ...rest); };
  fs.readFileSync = function (p, ...rest) { reads.push(String(p)); return saved.read.call(this, p, ...rest); };
  try { authority.registryLinks(snap, { workspaceRoot: a }); } finally { fs.statSync = saved.stat; fs.readFileSync = saved.read; }
  assert.equal(stats.filter((p) => path.resolve(p) === engine).length, 1, 'two rows name engine.ts; it is stat once');
  assert.equal(reads.filter((p) => path.resolve(p) === engine).length, 0, 'link state never reads or hashes a document');
});

// ---------------------------------------------------------------- decision links

function ledgerOf(entries, extra = {}) {
  const calls = [];
  return {
    calls,
    isAvailable: () => true,
    // Answers every agent's entries: decisionLinks' own agentDid check is what drops another agent's.
    getEntriesByAgent: async (did, limit) => { calls.push([did, limit]); return [...entries].sort((x, y) => y.id - x.id).slice(0, limit); },
    ...extra,
  };
}
const P = (id, payload, agentDid = ARCH_DID) => ({ id, eventType: 'PROPOSAL', agentDid, payload });
const D = (id, eventType, source) => ({ id, eventType, agentDid: ARCH_DID, payload: { sourceLedgerEntryId: source } });
const ROWS = [{ id: 'runtime', docPath: 'docs/architecture/RUNTIME.md' }, { id: 'old', docPath: 'docs/architecture/OLD.md' },
  { id: 'storage', docPath: 'docs/architecture/STORAGE.md' }];

test('decisionLinks: roles, outcomes (highest decision id wins), agent filter, id order', async () => {
  const entries = [
    P(10, { kind: 'architecture-doc-proposal', action: 'register', path: 'docs/architecture/RUNTIME.md' }),
    D(11, 'L3_APPROVED', 10), D(12, 'L3_REJECTED', 10),
    P(13, { kind: 'architecture-doc-supersede', action: 'supersede', path: 'docs/architecture/OLD.md', supersededRowId: 'old', supersededBy: 'runtime', supersedes: ['old'] }),
    D(14, 'L3_APPROVED', 13),
    P(15, { kind: 'architecture-doc-proposal', action: 'register', path: 'docs/architecture/STORAGE.md' }),
    P(16, { kind: 'architecture-doc-proposal', action: 'register', path: 'docs/architecture/RUNTIME.md' }, 'did:other'),
    P(17, { kind: 'architecture-index-bootstrap', path: 'docs/ARCHITECTURE_INDEX.md' }),
  ];
  const d = await proposal.decisionLinks(ROWS, ledgerOf(entries));
  assert.equal(d.state, 'ok');
  const view = (id) => d.byRow[id].map((x) => [x.proposalEntryId, x.role, x.outcome, x.decisionEntryId]);
  assert.deepEqual(view('runtime'), [[10, 'registers', 'rejected', 12], [13, 'successor', 'approved', 14]]);
  assert.deepEqual(view('old'), [[13, 'supersedes', 'approved', 14]]);
  assert.deepEqual(view('storage'), [[15, 'registers', 'undecided', null]]);
});

test('decisionLinks: one bounded read; past the cap it is truncated; no reader or a throwing read is unavailable', async () => {
  const many = Array.from({ length: 6 }, (_, i) => P(100 + i, { kind: 'architecture-doc-proposal', action: 'register', path: `x${i}` }));
  const l = ledgerOf(many);
  assert.deepEqual(await proposal.decisionLinks(ROWS, l, { cap: 5 }), { state: 'truncated', cap: 5 });
  assert.deepEqual(l.calls, [[ARCH_DID, 6]]);
  assert.deepEqual(await proposal.decisionLinks(ROWS, { isAvailable: () => true }), { state: 'unavailable' });
  assert.deepEqual(await proposal.decisionLinks(ROWS, ledgerOf([], { getEntriesByAgent: async () => { throw new Error('db'); } })), { state: 'unavailable' });
  assert.deepEqual(await proposal.decisionLinks(ROWS, ledgerOf(many, { isAvailable: () => false })), { state: 'unavailable' });
  assert.deepEqual(await proposal.decisionLinks(ROWS, null), { state: 'unavailable' });
});

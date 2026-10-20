/**
 * #531 slice 2 (plan-531b LD2/LD4/LD5/LD6/LD10): architecture authority against real temp git
 * repositories.
 *
 * Core rows (row lines, structured problem fields, domain intake, hidden characters, review
 * rendering) call `scripts/lib/architecture-index-core.cjs` directly. Assessment, proposal
 * planning and pending authority run the compiled modules in out/governance/architecture/.
 * The no-egress row stubs the network entry points and records every git subcommand.
 *
 * Runs standalone after `npm run compile`: node --test src/test/governance/architecture/ArchitectureAuthority.test.cjs
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const extRoot = path.join(__dirname, '..', '..', '..', '..');
const outDir = path.join(extRoot, 'out');
const core = require(path.join(extRoot, 'scripts', 'lib', 'architecture-index-core.cjs'));
const discovery = require(path.join(outDir, 'governance', 'architecture', 'ArchitectureIndexDiscovery.js'));
const authority = require(path.join(outDir, 'governance', 'architecture', 'architectureAuthority.js'));
const proposal = require(path.join(outDir, 'governance', 'architecture', 'ArchitectureIndexProposal.js'));
const { removeTempTree } = require('../../shared/removeTempTree.cjs');

const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';
const SEP = '|---|---|---|---|---|---|---|---|---|---|---|';
const made = [];
test.after(() => { for (const d of made) removeTempTree(d); });

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function git(root, ...args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return String(r.stdout).trim();
}

function write(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

function repo(files = {}, { commit = true } = {}) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-arch-auth-')));
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

/** A registry row: [id, domain, docLink, status, supersedes?]. */
function row(id, domain, link, status, supersedes = '-') {
  return `| ${id} | ${domain} | ${link} | ${status} | manual | ${supersedes} | - | - | unknown | unknown | manual |`;
}

function index(rows, eol = '\n') {
  return ['# Architecture Index', '', '## Registry', '', HEADER, SEP, ...rows, '',
    '## Normative scope', '', '```architecture-normative', 'docs/architecture/**/*.md', 'docs/ARCHITECTURE*.md', '```', '',
    '## Legacy', '', '```architecture-legacy', 'docs/archive/**', '```', ''].join(eol);
}

const SELF = row('architecture-navigation', 'architecture navigation', '[Architecture Index](ARCHITECTURE_INDEX.md)', 'canonical');
const INDEX = 'docs/ARCHITECTURE_INDEX.md';
const assess = (root, extra = {}) => authority.assessArchitectureAuthority(
  discovery.discoverArchitectureIndex({ workspaceRoot: root, ...extra }), { workspaceRoot: root, ...extra });
const kinds = (report) => report.findings.map((f) => f.kind);
const lineOf = (text, needle) => text.split(/\r?\n/).findIndex((l) => l.includes(needle)) + 1;

// ---------------------------------------------------------------- core

test('core: every parsed row carries its 1-based line in the index text', () => {
  const text = index([SELF, row('runtime', 'runtime', '[R](architecture/RUNTIME.md)', 'canonical')]);
  const result = core.parseRegistry(text, { indexPath: INDEX, linkBase: 'docs' });
  assert.deepEqual(result.rows.map((r) => [r.id, r.line]),
    [['architecture-navigation', lineOf(text, '| architecture-navigation |')], ['runtime', lineOf(text, '| runtime |')]]);
  assert.equal(result.rows[1].line, 8);
});

test('core: problems carry structured fields; code and detail are unchanged', () => {
  const text = index([
    SELF,
    row('a', 'runtime', '[A](architecture/A.md)', 'canonical'),
    row('b', 'Runtime', '[B](architecture/B.md)', 'canonical'),
    row('c', 'storage', '[C](architecture/C.md)', 'Canonical'),
    row('d', 'storage', '[D](architecture/D.md)', 'descriptive', 'ghost'),
    row('e', 'old', '[E](architecture/E.md)', 'superseded'),
    row('f', 'loop', '[F](architecture/F.md)', 'historical', 'g'),
    row('g', 'loop', '[G](architecture/G.md)', 'historical', 'f'),
    row('a', 'dup', '[A2](architecture/A2.md)', 'descriptive'),
  ]);
  const tracked = ['docs/ARCHITECTURE_INDEX.md', 'docs/architecture/A.md', 'docs/architecture/B.md', 'docs/architecture/C.md',
    'docs/architecture/D.md', 'docs/architecture/E.md', 'docs/architecture/F.md', 'docs/architecture/G.md', 'docs/architecture/NEW.md'];
  const profiles = require(path.join(extRoot, 'scripts', 'lib', 'architecture-index-profiles.cjs'));
  const { problems } = core.validate({ indexText: text, readmeText: '', governanceText: '', tracked }, profiles.userRepoProfile(INDEX));
  const by = (code) => problems.filter((p) => p.code === code);
  assert.deepEqual(by('conflicting-canonical').map((p) => [p.domain, p.ids]), [['runtime', ['a', 'b']]]);
  assert.deepEqual(by('duplicate-id').map((p) => p.ids), [['a']]);
  assert.deepEqual(by('bad-status').map((p) => p.ids), [['c']]);
  assert.deepEqual(by('dangling-ref').map((p) => [p.ids, p.field, p.ref]), [[['d'], 'supersedes', 'ghost']]);
  assert.deepEqual(by('superseded-without-successor').map((p) => p.ids), [['e']]);
  assert.deepEqual(by('supersede-cycle').map((p) => p.ids), [['f', 'g']]);
  assert.deepEqual(by('missing-path').map((p) => [p.ids, p.field, p.path]), [[['a'], 'doc', 'docs/architecture/A2.md']]);
  assert.deepEqual(by('unregistered-normative').map((p) => [p.path, p.glob]), [['docs/architecture/NEW.md', 'docs/architecture/**/*.md']]);
  for (const p of problems) assert.equal(typeof p.detail, 'string');
});

test('core: domainKey is unchanged (trim + lower-case), for CLI parity', () => {
  assert.equal(core.domainKey('  Runtime '), 'runtime');
  assert.equal(core.domainKey('runtim\u0435'), 'runtim\u0435', 'a look-alike stays a different key');
});

test('core: hiddenCharacterProblem flags each B1 code point and spacing rule', () => {
  for (const [s, want] of [
    ['run\u200Btime', /U\+200B/], ['run\u00A0time', /U\+00A0/], ['run\uFEFFtime', /U\+FEFF/], ['run\u00ADtime', /U\+00AD/],
    ['run\u202Etime', /U\+202E/], ['run\u2028time', /U\+2028/], ['run\ttime', /U\+0009/], ['run  time', /two or more spaces/],
    [' runtime', /leading or trailing/], ['runtime ', /leading or trailing/], ['cafe\u0301', /NFC/],
  ]) assert.match(String(core.hiddenCharacterProblem(s)), want, JSON.stringify(s));
  for (const ok of ['runtime', 'run time', 'caf\u00E9', 'runtim\u0435', 'run\u3164time']) {
    assert.equal(core.hiddenCharacterProblem(ok), null, `${JSON.stringify(ok)} has no hidden character (U+3164 is a letter: the charset rule catches it)`);
  }
});

test('core: domainIntakeProblem - authority needs the ASCII charset even byte-for-byte; others may reuse a registered cell', () => {
  const registered = ['runtim\u0435', 'caf\u00E9', 'run\u3164time', 'runtime'];
  assert.equal(core.domainIntakeProblem('runtime', registered, { authority: true }), null);
  assert.equal(core.domainIntakeProblem('Scheduler v2 (core) / io_&-.', [], { authority: true }), null);
  for (const d of ['runtim\u0435', 'run\u3164time', 'caf\u00E9']) {
    assert.match(String(core.domainIntakeProblem(d, registered, { authority: true })), /A-Z, a-z, 0-9/, `authority ${JSON.stringify(d)}`);
    assert.equal(core.domainIntakeProblem(d, registered, { authority: false }), null, `byte-exact reuse of ${JSON.stringify(d)}`);
  }
  assert.match(String(core.domainIntakeProblem('Caf\u00E9', registered, { authority: false })), /U\+00E9/);
  assert.match(String(core.domainIntakeProblem('run\u3164time2', registered, { authority: false })), /U\+3164/);
  assert.match(String(core.domainIntakeProblem('a|b', [], { authority: false })), /U\+007C/);
  assert.match(String(core.domainIntakeProblem('', [], {})), /empty/);
  assert.match(String(core.domainIntakeProblem('x'.repeat(121), [], {})), /120/);
  assert.match(String(core.domainIntakeProblem('run\u200Btime', ['run\u200Btime'], { authority: false })), /U\+200B/,
    'hidden characters are refused even when byte-equal');
});

test('core: renderDomainForReview iterates by code point (non-BMP is one U+1XXXX label)', () => {
  assert.equal(core.renderDomainForReview('runtime v2'), 'runtime v2');
  assert.equal(core.renderDomainForReview('runtim\u0435'), 'runtim[U+0435]');
  assert.equal(core.renderDomainForReview('run\u3164time'), 'run[U+3164]time');
  assert.equal(core.renderDomainForReview('A\u{1D400}B'), 'A[U+1D400]B');
  assert.deepEqual(core.nonAsciiCodePoints('x\u{1F600}y\u0435\u0435'), ['U+1F600', 'U+0435']);
});

// ---------------------------------------------------------------- assessment

test('assess: index SHA-256 is of the bytes on disk (BOM, CRLF); HEAD is the source SHA', () => {
  const text = '\uFEFF' + index([SELF, row('runtime', 'runtime', '[R](architecture/RUNTIME.md)', 'canonical')], '\r\n');
  const root = repo({ [INDEX]: text, 'docs/architecture/RUNTIME.md': '# R\n' });
  const report = assess(root);
  const bytes = fs.readFileSync(path.join(root, INDEX));
  assert.equal(report.provenance.indexSha256, sha(bytes));
  assert.equal(report.provenance.indexPath, INDEX);
  assert.equal(report.provenance.sourceSha, git(root, 'rev-parse', 'HEAD'));
  assert.deepEqual(report.findings, []);
  const snap = discovery.discoverArchitectureIndex({ workspaceRoot: root });
  assert.equal(snap.rows[1].line, lineOf(text, '| runtime |'));
  assert.equal(snap.rows[1].listed, true);
});

test('assess: an unborn repository has sourceSha null with reason unborn', () => {
  const root = repo({ [INDEX]: index([SELF]) }, { commit: false });
  const report = assess(root);
  assert.equal(report.provenance.sourceSha, null);
  assert.equal(report.provenance.sourceShaReason, 'unborn');
});

test('assess: two and three canonical rows in one domain key are one finding with every row, line and hash', () => {
  const text = index([SELF,
    row('a', 'runtime', '[A](architecture/A.md)', 'canonical'),
    row('b', ' Runtime', '[B](architecture/B.md)', 'canonical'),
    row('c', 'RUNTIME', '[C](architecture/C.md)', 'canonical'),
    row('s', 'storage', '[S](architecture/S.md)', 'canonical')]);
  const root = repo({ [INDEX]: text, 'docs/architecture/A.md': 'a', 'docs/architecture/B.md': 'b', 'docs/architecture/C.md': 'c',
    'docs/architecture/S.md': 's' });
  const report = assess(root);
  const conflicts = report.findings.filter((f) => f.kind === 'conflicting-canonical');
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].domainKey, 'runtime');
  assert.deepEqual(conflicts[0].rows.map((r) => [r.id, r.line, r.docSha256, r.docState]),
    [['a', lineOf(text, '| a |'), sha('a'), 'present'], ['b', lineOf(text, '| b |'), sha('b'), 'present'],
      ['c', lineOf(text, '| c |'), sha('c'), 'present']]);
  const domains = Object.fromEntries(report.domains.map((d) => [d.key, d]));
  assert.deepEqual(domains.runtime.canonical, ['a', 'b', 'c']);
  assert.deepEqual(domains.runtime.cells, ['runtime', 'Runtime', 'RUNTIME']);
});

test('assess: canonical-missing as not-on-disk, not-listed (ignored folder) and no-safe-link', () => {
  const text = index([SELF,
    row('gone', 'gone', '[G](architecture/GONE.md)', 'canonical'),
    row('hidden', 'hidden', '[H](architecture/private/HIDDEN.md)', 'canonical'),
    row('outside', 'outside', '[O](../../OUT.md)', 'canonical'),
    row('fine', 'fine', '[F](architecture/FINE.md)', 'canonical'),
    row('gone-desc', 'gone desc', '[GD](architecture/GONE2.md)', 'descriptive')]);
  const root = repo({ [INDEX]: text, '.gitignore': 'docs/architecture/private/\n', 'docs/architecture/FINE.md': 'f',
    'docs/architecture/private/HIDDEN.md': 'h' });
  const report = assess(root);
  const missing = report.findings.filter((f) => f.kind === 'canonical-missing');
  assert.deepEqual(missing.map((f) => [f.rows[0].id, f.reason]),
    [['gone', 'not-on-disk'], ['hidden', 'not-listed'], ['outside', 'no-safe-link']]);
  assert.equal(missing[1].rows[0].docSha256, sha('h'), 'an ignored document still exists and is hashed');
});

test('assess: dangling supersession reasons unknown-id, no-successor and cycle', () => {
  const text = index([SELF,
    row('d', 'storage', '[D](architecture/D.md)', 'canonical', 'ghost'),
    row('e', 'old', '[E](architecture/E.md)', 'superseded'),
    row('f', 'loop', '[F](architecture/F.md)', 'historical', 'g'),
    row('g', 'loop two', '[G](architecture/G.md)', 'historical', 'f')]);
  const root = repo({ [INDEX]: text, 'docs/architecture/D.md': 'd', 'docs/architecture/E.md': 'e', 'docs/architecture/F.md': 'f',
    'docs/architecture/G.md': 'g' });
  const dangling = assess(root).findings.filter((f) => f.kind === 'dangling-supersession');
  assert.deepEqual(dangling.map((f) => [f.reason, f.rows.map((r) => r.id)]),
    [['cycle', ['f', 'g']], ['no-successor', ['e']], ['unknown-id', ['d']]]);
  assert.equal(dangling[2].ref, 'ghost');
});

test('assess: hidden characters and non-ASCII look-alikes in registry domains are findings with code points', () => {
  const text = index([SELF,
    row('zw', 'run\u200Btime', '[Z](architecture/Z.md)', 'descriptive'),
    row('nfd', 'cafe\u0301', '[N](architecture/N.md)', 'descriptive'),
    row('cyr', 'runtim\u0435', '[C](architecture/C.md)', 'canonical'),
    row('hf', 'run\u3164time', '[H](architecture/H.md)', 'descriptive')]);
  const root = repo({ [INDEX]: text, 'docs/architecture/Z.md': 'z', 'docs/architecture/N.md': 'n', 'docs/architecture/C.md': 'c',
    'docs/architecture/H.md': 'h' });
  const report = assess(root);
  const hidden = report.findings.filter((f) => f.kind === 'domain-hidden-characters');
  assert.deepEqual(hidden.map((f) => [f.rows[0].id, f.detail.includes('U+200B') || f.detail.includes('NFC')]), [['nfd', true], ['zw', true]]);
  const nonAscii = report.findings.filter((f) => f.kind === 'domain-non-ascii');
  // Ordered by domain key as a string: 'cafe\u0301' < 'runtim\u0435' < 'run\u200Btime' < 'run\u3164time'.
  assert.deepEqual(nonAscii.map((f) => [f.rows[0].id, f.codePoints]),
    [['nfd', ['U+0301']], ['cyr', ['U+0435']], ['zw', ['U+200B']], ['hf', ['U+3164']]]);
  const byId = Object.fromEntries(nonAscii.map((f) => [f.rows[0].id, f.codePoints]));
  assert.deepEqual(byId.cyr, ['U+0435']);
  assert.deepEqual(byId.hf, ['U+3164']);
  assert.equal(nonAscii.find((f) => f.rows[0].id === 'cyr').rows[0].line, lineOf(text, '| cyr |'));
});

test('assess: an unregistered document is listed with its glob, hash and advisory suggestions', () => {
  const root = repo({ [INDEX]: index([SELF, row('runtime', 'runtime', '[R](architecture/RUNTIME.md)', 'canonical')]),
    'docs/architecture/RUNTIME.md': 'r' });
  write(root, 'docs/architecture/RUNTIME_COPY.md', 'copy');
  const report = assess(root);
  const un = report.findings.filter((f) => f.kind === 'unregistered-normative');
  assert.equal(un.length, 1);
  assert.equal(un[0].path, 'docs/architecture/RUNTIME_COPY.md');
  assert.equal(un[0].glob, 'docs/architecture/**/*.md');
  assert.equal(un[0].docSha256, sha('copy'));
  assert.deepEqual(un[0].suggestions, ['docs/architecture/RUNTIME.md', 'docs/ARCHITECTURE_INDEX.md']);
});

test('assess: deterministic - two runs are deep-equal apart from checkedAt; kind order is fixed', () => {
  const root = repo({ [INDEX]: index([SELF,
    row('a', 'runtime', '[A](architecture/A.md)', 'canonical'), row('b', 'runtime', '[B](architecture/B.md)', 'canonical'),
    row('gone', 'gone', '[G](architecture/GONE.md)', 'canonical'), row('e', 'old', '[E](architecture/E.md)', 'superseded')]),
  'docs/architecture/A.md': 'a', 'docs/architecture/B.md': 'b', 'docs/architecture/E.md': 'e' });
  write(root, 'docs/architecture/NEW.md', 'n');
  const strip = (r) => ({ ...r, provenance: { ...r.provenance, checkedAt: '' } });
  const one = assess(root);
  assert.deepEqual(strip(assess(root)), strip(one));
  assert.deepEqual(kinds(one), ['conflicting-canonical', 'canonical-missing', 'dangling-supersession', 'unregistered-normative']);
});

test('assess: a path sharing every token with a canonical document but declaring another domain is not a conflict', () => {
  const root = repo({ [INDEX]: index([SELF,
    row('runtime', 'runtime', '[R](architecture/RUNTIME.md)', 'canonical'),
    row('runtime-design', 'scheduler', '[RD](architecture/design/RUNTIME.md)', 'canonical')]),
  'docs/architecture/RUNTIME.md': 'r', 'docs/architecture/design/RUNTIME.md': 'rd' });
  assert.deepEqual(kinds(assess(root)), []);
});

test('assess: absent index yields only unregistered documents; no workspace yields none', () => {
  const root = repo({ 'docs/architecture/RUNTIME.md': 'r' });
  const report = assess(root);
  assert.equal(report.state, 'absent');
  assert.deepEqual(kinds(report), ['unregistered-normative']);
  const none = authority.assessArchitectureAuthority(discovery.discoverArchitectureIndex({ workspaceRoot: null }), { workspaceRoot: null });
  assert.deepEqual(none.findings, []);
  assert.equal(none.state, 'no-workspace');
});

// ---------------------------------------------------------------- proposal planning

test('plan: a candidate path longer than PATH_RECORD_LIMIT (1024) is refused before anything else', () => {
  const long = `docs/architecture/${'x'.repeat(1010)}.md`;
  const snap = { state: 'present', indexPath: INDEX, indexSha256: 'f'.repeat(64), rows: [], problems: [], candidates: [{ path: long, suggestions: [] }],
    normativeGlobs: [], legacyGlobs: [], checkedAt: 't' };
  const out = proposal.planArchitectureProposal(snap, { path: long, action: 'register', domain: 'x', status: 'proposed' },
    { workspaceRoot: os.tmpdir() });
  assert.equal(proposal.PATH_RECORD_LIMIT, 1024);
  assert.equal(out.refuse.status, 400);
  assert.match(out.refuse.body.error, /1024/);
});

// ---------------------------------------------------------------- pending authority (pure)

const ROWS = [
  { id: 'runtime', domain: 'runtime', docPath: 'docs/architecture/RUNTIME.md', status: 'canonical' },
  { id: 'storage', domain: 'storage', docPath: 'docs/architecture/STORAGE.md', status: 'canonical' },
];
const snapOf = (rows) => ({ rows });
const item = (id, meta, state = 'QUEUED', kind = 'architecture-doc-proposal') => ({ id, state, kind, meta });
const canonicalOp = (domain, extra = {}) => ({ action: 'register', status: 'canonical', domain, supersedes: [], path: 'docs/architecture/NEW.md', ...extra });

test('pending: open canonical items for the same domain key block, in any state but REJECTED or EXPIRED', () => {
  const meta = { action: 'register', status: 'canonical', domain: 'Scheduler', path: 'docs/architecture/S1.md', supersedes: [] };
  const run = (queue, op = canonicalOp('scheduler')) => proposal.pendingAuthority(op, { queue, approved: [], snapshot: snapOf(ROWS) });
  assert.deepEqual(run([item('l3-1', meta)]).pending, ['l3-1']);
  assert.deepEqual(run([item('l3-2', meta, 'APPROVED')]).pending, ['l3-2'], 'decided but still in the queue');
  assert.deepEqual(run([item('l3-3', meta, 'UNDER_REVIEW')]).pending, ['l3-3']);
  assert.deepEqual(run([item('l3-4', meta, 'REJECTED'), item('l3-5', meta, 'EXPIRED')]).pending, []);
  assert.deepEqual(run([item('l3-6', meta, 'QUEUED', 'open-design-write')]).pending, [], 'not an architecture kind');
  assert.deepEqual(run([item('l3-7', { ...meta, status: 'proposed' })]).pending, [], 'proposed does not block');
  assert.deepEqual(run([item('l3-8', meta)], { ...canonicalOp('scheduler'), status: 'proposed' }).pending, [], 'proposed is not blocked');
  assert.deepEqual(run([item('l3-9', { ...meta, domain: 'scheduler v2' })]).pending, [], 'a different key');
});

test('pending: supersessions of the same row block each other (by id or by path); slice-1 items match only by path', () => {
  const supersedeAction = { action: 'supersede', path: 'docs/architecture/RUNTIME.md', supersededBy: 'storage', supersededRowId: 'runtime',
    supersedes: ['runtime'], domain: 'runtime', status: null };
  const op = { action: 'register', status: 'canonical', domain: 'runtime', supersedes: ['runtime'], path: 'docs/architecture/R2.md' };
  const run = (queue, o = op) => proposal.pendingAuthority(o, { queue, approved: [], snapshot: snapOf(ROWS) }).pending;
  assert.deepEqual(run([item('l3-1', supersedeAction, 'QUEUED', 'architecture-doc-supersede')]), ['l3-1']);
  const sliceOne = { kind: 'architecture-doc-supersede', path: 'docs/architecture/RUNTIME.md', action: 'supersede', supersededBy: 'storage' };
  assert.deepEqual(run([item('l3-2', sliceOne, 'QUEUED', 'architecture-doc-supersede')]), ['l3-2'], 'slice-1 supersede matches by path');
  const sliceOneRegister = { kind: 'architecture-doc-proposal', path: 'docs/architecture/OTHER.md', action: 'register' };
  assert.deepEqual(run([item('l3-3', sliceOneRegister)], canonicalOp('other')), [], 'slice-1 register has no domain');
});

test('pending: approved and not in the index blocks; reflected does not; an applied row later removed blocks again', () => {
  const payload = { kind: 'architecture-doc-proposal', action: 'register', status: 'canonical', domain: 'scheduler', path: 'docs/architecture/S1.md', supersedes: [] };
  const run = (rows, approved) => proposal.pendingAuthority(canonicalOp('scheduler'), { queue: [], approved, snapshot: snapOf(rows) });
  assert.deepEqual(run(ROWS, [{ entryId: 41, payload }]).approvedNotInIndex,
    [{ entryId: 41, path: 'docs/architecture/S1.md', missingRow: true, stillCanonical: [] }]);
  const applied = [...ROWS, { id: 's1', domain: 'scheduler', docPath: 'docs/architecture/S1.md', status: 'canonical' }];
  assert.deepEqual(run(applied, [{ entryId: 41, payload }]).approvedNotInIndex, [], 'reflected');
  assert.deepEqual(run(ROWS, [{ entryId: 41, payload }]).approvedNotInIndex.map((x) => x.entryId), [41], 'removed again: blocks again');
  const sup = { kind: 'architecture-doc-supersede', action: 'supersede', path: 'docs/architecture/RUNTIME.md', supersededRowId: 'runtime',
    supersedes: ['runtime'], supersededBy: 'storage', domain: 'runtime', status: null };
  const supOp = { action: 'supersede', path: 'docs/architecture/RUNTIME.md', supersedes: ['runtime'], domain: 'runtime', status: null };
  const runSup = (rows) => proposal.pendingAuthority(supOp, { queue: [], approved: [{ entryId: 50, payload: sup }], snapshot: snapOf(rows) }).approvedNotInIndex;
  assert.deepEqual(runSup(ROWS).map((x) => x.entryId), [50], 'the superseded row is still canonical');
  assert.deepEqual(runSup(ROWS.filter((r) => r.id !== 'runtime')), [], 'the superseded row is gone: reflected');
  assert.deepEqual(runSup([{ ...ROWS[0], status: 'superseded' }, ROWS[1]]), [], 'no longer canonical: reflected');
});

// ---------------------------------------------------------------- no egress

test('no egress: assess, plan, pending and record touch no network; git runs only ls-files and rev-parse', async () => {
  const http = require('http');
  const https = require('https');
  const net = require('net');
  const root = repo({ [INDEX]: index([SELF, row('runtime', 'runtime', '[R](architecture/RUNTIME.md)', 'canonical')]),
    'docs/architecture/RUNTIME.md': 'r' });
  write(root, 'docs/architecture/NOTES.md', 'n');
  const calls = { net: 0 };
  const saved = { fetch: globalThis.fetch, hr: http.request, hsr: https.request, nc: net.connect };
  globalThis.fetch = async () => { calls.net += 1; throw new Error('egress'); };
  http.request = () => { calls.net += 1; throw new Error('egress'); };
  https.request = () => { calls.net += 1; throw new Error('egress'); };
  net.connect = () => { calls.net += 1; throw new Error('egress'); };
  const subcommands = [];
  const base = discovery.defaultArchitectureGit;
  const gitRunner = (r, args) => { subcommands.push(args[0]); return base(r, args); };
  try {
    const snap = discovery.discoverArchitectureIndex({ workspaceRoot: root, git: gitRunner });
    authority.assessArchitectureAuthority(snap, { workspaceRoot: root, git: gitRunner });
    const planned = proposal.planArchitectureProposal(snap, { path: 'docs/architecture/NOTES.md', action: 'register', domain: 'notes', status: 'descriptive' },
      { workspaceRoot: root, git: gitRunner });
    assert.ok(planned.op, JSON.stringify(planned.refuse));
    proposal.pendingAuthority(planned.op, { queue: [], approved: [], snapshot: snap });
    const entries = [];
    const queued = [];
    const ledger = { isAvailable: () => true, appendEntry: async (e) => { entries.push(e); return { id: 7, entryHash: 'h' }; } };
    const rec = await proposal.recordArchitectureProposal(planned.op, ledger, async (q) => { queued.push(q); return 'l3-1'; }, {});
    assert.equal(rec.status, 202);
  } finally {
    globalThis.fetch = saved.fetch; http.request = saved.hr; https.request = saved.hsr; net.connect = saved.nc;
  }
  assert.equal(calls.net, 0);
  assert.ok(subcommands.length > 0);
  assert.deepEqual([...new Set(subcommands)].sort(), ['ls-files', 'rev-parse']);
});

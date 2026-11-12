'use strict';
/**
 * B311/B312 (plan-b311-b312 LD3-LD5, LD11): registry links on real temp git repositories and decision
 * links over a fake ledger. Split out of ArchitectureLinks.test.cjs for #651 (Section 4 limits).
 *
 * Runs standalone after `npm run compile`: node --test src/test/governance/architecture/ArchitectureLinks.registry.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  core, discovery, authority, proposal, INDEX, ARCH_DID, registerCleanup, tmp, git, write, row, indexText, SELF,
} = require('./architectureFixtures.cjs');

registerCleanup(test);

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

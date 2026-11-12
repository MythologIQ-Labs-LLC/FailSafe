'use strict';
/**
 * Shared fixtures for the ArchitectureLinks suites (B311/B312, plan-b311-b312 LD3-LD5, LD11): temp
 * workspaces and git repositories, registry rows, the index text, and the compiled modules under test.
 * Split out of ArchitectureLinks.test.cjs for #651 so each suite stays within the Section 4 limits.
 */
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
/** Remove every temp tree and junction this suite made, after its last test. */
function registerCleanup(test) {
  test.after(() => {
    for (const j of junctions) { try { fs.unlinkSync(j); } catch { /* gone */ } }
    for (const d of made) removeTempTree(d);
  });
}

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

function workspace(rows, extra = {}) {
  const root = tmp();
  write(root, INDEX, indexText(rows));
  for (const [rel, text] of Object.entries(extra)) write(root, rel, text);
  return root;
}

module.exports = {
  core, wrapper, discovery, authority, affected, proposal,
  HEADER, SEP, INDEX, ARCH_DID, junctions, registerCleanup, tmp, git, write, row, indexText, SELF, AFFECT_ROWS, workspace,
};

/**
 * #531 LD3: managed architecture index discovery against real temp git repositories.
 *
 * Each row builds a repository with `git init`, writes documents, and runs the compiled
 * discovery (out/governance/architecture/ArchitectureIndexDiscovery.js) with the default
 * trusted-git runner, except the no-git row, which hands it a resolver that throws
 * TrustedGitUnavailable. The not-a-repo row sets GIT_CEILING_DIRECTORIES: on some hosts a
 * parent folder (even C:\) is itself a repository, and git would otherwise find it.
 *
 * Runs standalone after `npm run compile`: node --test src/test/governance/architecture/ArchitectureIndexDiscovery.test.cjs
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const outDir = path.join(__dirname, '..', '..', '..', '..', 'out');
const discovery = require(path.join(outDir, 'governance', 'architecture', 'ArchitectureIndexDiscovery.js'));
const { TrustedGitUnavailable } = require(path.join(outDir, 'shared', 'git', 'trustedGit.js'));
const { removeTempTree } = require('../../shared/removeTempTree.cjs');

const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';
const SEP = '|---|---|---|---|---|---|---|---|---|---|---|';
const made = [];
test.after(() => { for (const d of made) removeTempTree(d); });

function tmp(prefix = 'failsafe-arch-disc-') {
  const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.push(d);
  return d;
}

function git(root, ...args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
}

function write(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

function commitAll(root) {
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=', 'commit', '-q', '-m', 'fixture');
}

function repo(files = {}, { commit = true } = {}) {
  const root = tmp();
  git(root, 'init', '-q');
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  if (commit && Object.keys(files).length) commitAll(root);
  return root;
}

function index(rows, { globs = ['docs/architecture/**/*.md', 'docs/ARCHITECTURE*.md'], legacy = ['docs/archive/**'] } = {}) {
  return ['# Architecture Index', '', '## Registry', '', HEADER, SEP, ...rows.map((r) => `| ${r.join(' | ')} |`), '',
    '## Normative scope', '', '```architecture-normative', ...globs, '```', '',
    '## Legacy', '', '```architecture-legacy', ...legacy, '```', ''].join('\n');
}

const SELF = ['architecture-navigation', 'architecture navigation', '[Architecture Index](ARCHITECTURE_INDEX.md)', 'canonical',
  'manual', '-', '-', '-', 'unknown', 'unknown', 'manual'];
const RUNTIME = ['runtime', 'runtime', '[Runtime](architecture/RUNTIME.md)', 'canonical', 'manual', '-', '-', '-', 'unknown',
  'unknown', 'manual'];

const discover = (root, extra = {}) => discovery.discoverArchitectureIndex({ workspaceRoot: root, ...extra });

test('present: a valid index with every document registered has zero problems and no candidates', () => {
  const root = repo({ 'docs/ARCHITECTURE_INDEX.md': index([SELF, RUNTIME]), 'docs/architecture/RUNTIME.md': '# Runtime\n' });
  const snap = discover(root);
  assert.equal(snap.state, 'present', JSON.stringify(snap.problems));
  assert.equal(snap.indexPath, 'docs/ARCHITECTURE_INDEX.md');
  assert.deepEqual(snap.rows.map((r) => [r.id, r.docPath, r.status]),
    [['architecture-navigation', 'docs/ARCHITECTURE_INDEX.md', 'canonical'], ['runtime', 'docs/architecture/RUNTIME.md', 'canonical']]);
  assert.deepEqual(snap.problems, []);
  assert.deepEqual(snap.candidates, []);
  assert.ok(!Number.isNaN(Date.parse(snap.checkedAt)));
});

test('absent: candidates come from the default globs, legacy excluded, each with suggestions from the others', () => {
  const root = repo({
    'docs/architecture/RUNTIME.md': '# Runtime\n',
    'docs/design/RUNTIME_DESIGN.md': '# Runtime design\n',
    'ARCHITECTURE.md': '# Architecture\n',
    'docs/archive/OLD_ARCHITECTURE.md': '# Old\n',
    'src/notes.md': '# not architecture\n',
  });
  const snap = discover(root);
  assert.equal(snap.state, 'absent');
  assert.deepEqual(snap.candidates.map((c) => c.path), ['ARCHITECTURE.md', 'docs/architecture/RUNTIME.md', 'docs/design/RUNTIME_DESIGN.md']);
  const runtime = snap.candidates.find((c) => c.path === 'docs/architecture/RUNTIME.md');
  // String tokens only: `architecture` is shared with ARCHITECTURE.md, `runtime` with RUNTIME_DESIGN.md (tie -> path order).
  assert.deepEqual(runtime.suggestions, ['ARCHITECTURE.md', 'docs/design/RUNTIME_DESIGN.md'], 'overlap shown before bootstrapping');
  assert.deepEqual(snap.rows, []);
});

test('invalid: an index without the registry header and fenced blocks is invalid and lists its problems', () => {
  const root = repo({ 'docs/ARCHITECTURE_INDEX.md': '# Architecture Index\n\nNothing registered yet.\n', 'docs/architecture/RUNTIME.md': '# R\n' });
  const snap = discover(root);
  assert.equal(snap.state, 'invalid');
  assert.ok(snap.problems.some((p) => p.code === 'missing-section'), JSON.stringify(snap.problems));
  assert.deepEqual(snap.candidates.map((c) => c.path), ['docs/architecture/RUNTIME.md'], 'falls back to the default globs');
});

test('present-with-problems: a registered row whose document is missing', () => {
  const gone = ['gone', 'gone', '[Gone](architecture/GONE.md)', 'proposed', 'manual', '-', '-', '-', 'unknown', 'unknown', 'manual'];
  const root = repo({ 'docs/ARCHITECTURE_INDEX.md': index([SELF, RUNTIME, gone]), 'docs/architecture/RUNTIME.md': '# R\n' });
  const snap = discover(root);
  assert.equal(snap.state, 'present-with-problems');
  assert.deepEqual(snap.problems.map((p) => p.code), ['missing-path']);
});

test('agent-created file: an untracked candidate is visible on the next discovery, with a suggestion; a deleted tracked file is not', () => {
  const root = repo({ 'docs/ARCHITECTURE_INDEX.md': index([SELF, RUNTIME]), 'docs/architecture/RUNTIME.md': '# R\n',
    'docs/architecture/STALE.md': '# tracked then deleted\n' });
  fs.rmSync(path.join(root, 'docs', 'architecture', 'STALE.md'));
  assert.equal(discover(root).state, 'present', 'a deleted tracked file (still listed by ls-files -c) is filtered out');
  write(root, 'docs/architecture/RUNTIME_COPY.md', '# written by an agent, never added\n');
  const snap = discover(root);
  assert.equal(snap.state, 'present-with-problems');
  // The canonical row in the same folder first, then rows sharing tokens (`architecture` with the index itself).
  assert.deepEqual(snap.candidates, [{ path: 'docs/architecture/RUNTIME_COPY.md',
    suggestions: ['docs/architecture/RUNTIME.md', 'docs/ARCHITECTURE_INDEX.md'] }]);
  assert.deepEqual(snap.problems.map((p) => p.code), ['unregistered-normative']);
});

test('ignored folders stay invisible (disclosed in the ADR)', () => {
  const root = repo({ '.gitignore': 'docs/private/\n', 'docs/private/ARCHITECTURE_SECRET.md': '# hidden\n', 'ARCHITECTURE.md': '# A\n' });
  assert.deepEqual(discover(root).candidates.map((c) => c.path), ['ARCHITECTURE.md']);
});

test('present-elsewhere: no index at the setting path, but a default-glob match carries a registry', () => {
  const root = repo({ 'docs/ARCHITECTURE_INDEX.md': index([SELF]) });
  const snap = discover(root, { indexPathSetting: 'docs/architecture/INDEX.md' });
  assert.equal(snap.state, 'present-elsewhere');
  assert.equal(snap.indexPath, 'docs/architecture/INDEX.md');
  assert.equal(snap.elsewherePath, 'docs/ARCHITECTURE_INDEX.md');
});

test('a custom index path outside docs/ is read and its links resolve from its folder', () => {
  const self = ['architecture-navigation', 'architecture navigation', '[Index](INDEX.md)', 'canonical', 'manual', '-', '-', '-',
    'unknown', 'unknown', 'manual'];
  const top = ['top', 'top', '[Top](../ARCHITECTURE.md)', 'proposed', 'manual', '-', '-', '-', 'unknown', 'unknown', 'manual'];
  const root = repo({ 'design/INDEX.md': index([self, top], { globs: ['ARCHITECTURE*.md', 'design/**/*.md'] }), 'ARCHITECTURE.md': '# A\n' });
  const snap = discover(root, { indexPathSetting: 'design\\INDEX.md' });
  assert.equal(snap.indexPath, 'design/INDEX.md', 'backslashes normalised');
  assert.equal(snap.state, 'present', JSON.stringify(snap.problems));
});

test('no git: a resolver that throws TrustedGitUnavailable yields state no-git, never a throw', () => {
  const root = repo({ 'ARCHITECTURE.md': '# A\n' });
  const gitRunner = discovery.makeArchitectureGit(() => { throw new TrustedGitUnavailable([]); });
  const snap = discover(root, { git: gitRunner });
  assert.equal(snap.state, 'no-git');
  assert.deepEqual(snap.candidates, []);
});

test('not a repository: git runs and exits non-zero', () => {
  const root = tmp('failsafe-arch-norepo-');
  write(root, 'ARCHITECTURE.md', '# A\n');
  const prev = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = path.dirname(root);
  try {
    assert.equal(discover(root).state, 'not-a-repo');
  } finally {
    if (prev === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = prev;
  }
});

test('no workspace: a typed state', () => {
  assert.equal(discover(undefined).state, 'no-workspace');
  assert.equal(discover('').state, 'no-workspace');
});

test('an absolute or escaping index path is refused', () => {
  const root = repo({ 'ARCHITECTURE.md': '# A\n' });
  for (const bad of ['../outside/INDEX.md', 'docs/../../INDEX.md', '/etc/INDEX.md', 'C:/INDEX.md', 'C:\\INDEX.md', '..']) {
    const snap = discover(root, { indexPathSetting: bad });
    assert.equal(snap.state, 'bad-index-path', bad);
    assert.deepEqual(snap.candidates, [], bad);
  }
  assert.equal(discovery.normalizeIndexPath(''), 'docs/ARCHITECTURE_INDEX.md', 'empty falls back to the default');
  assert.equal(discovery.normalizeIndexPath('./docs/X.md'), 'docs/X.md');
});

test('an index path that resolves outside the workspace through a link is refused', () => {
  const root = repo({ 'ARCHITECTURE.md': '# A\n' });
  const outside = tmp('failsafe-arch-outside-');
  write(outside, 'ARCHITECTURE_INDEX.md', index([SELF]));
  fs.symlinkSync(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const snap = discover(root, { indexPathSetting: 'linked/ARCHITECTURE_INDEX.md' });
  assert.equal(snap.state, 'bad-index-path');
  fs.unlinkSync(path.join(root, 'linked'));
});

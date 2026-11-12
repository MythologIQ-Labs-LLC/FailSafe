'use strict';
/**
 * B311/B312 (plan-b311-b312 LD3-LD5, LD11): review text and code-point-safe caps (core); affected
 * decisions (pure matching and the bounded describe path: no git, no per-file I/O, a time budget).
 * Registry and decision links are in ArchitectureLinks.registry.test.cjs; the #651 bounded-I/O and
 * event-loop verdict is in ArchitectureLinks.boundedIo.test.cjs.
 *
 * Runs standalone after `npm run compile`: node --test src/test/governance/architecture/ArchitectureLinks.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  core, wrapper, authority, affected, INDEX, junctions, registerCleanup, tmp, write, row, indexText, AFFECT_ROWS, workspace,
} = require('./architectureFixtures.cjs');

registerCleanup(test);

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

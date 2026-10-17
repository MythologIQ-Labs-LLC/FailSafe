/**
 * #476 / #479 (plan-v608-integration LD15): the five refusal texts the GitHub
 * check publisher returns have one source, check-run-errors.ts. The transport,
 * the client and the health mapping import them from there, so the health
 * mapping never imports the transport (the #476 importer pin) and no copy of a
 * text can drift. Reads the .ts sources, not out/.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// src/test/integrations/github-checks -> src
const SRC = path.resolve(__dirname, '..', '..', '..');
const DIR = path.join(SRC, 'integrations', 'github-checks');
const ERRORS = path.join(DIR, 'check-run-errors.ts');

// Exactly as 56291b07 defines them (check-run-transport.ts:23-26, github-checks-client.ts:22).
const EXPECTED = {
  NOT_PUBLISHABLE_ERROR: 'Check run refused: this name and conclusion are not publishable by FailSafe.',
  INVALID_API_BASE_ERROR: 'invalid GitHub API base URL',
  TARGET_HOST_MISMATCH_ERROR: 'check run target host mismatch',
  INVALID_TARGET_REPO_ERROR: 'invalid check run target repo',
  UNCONFIRMED_RESPONSE_ERROR: 'unconfirmed GitHub response',
};

const read = (f) => fs.readFileSync(f, 'utf8');
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function productionTs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (p === path.join(SRC, 'test')) continue;
      productionTs(p, out);
    } else if (e.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

test('check-run-errors.ts exports exactly the five texts, byte for byte', () => {
  assert.ok(fs.existsSync(ERRORS), 'anchor: check-run-errors.ts exists');
  const code = stripComments(read(ERRORS));
  const consts = {};
  for (const m of code.matchAll(/^export const (\w+) = '([^'\\]*)';$/gm)) consts[m[1]] = m[2];
  assert.deepEqual(consts, EXPECTED);
  const exportLines = code.split(/\r?\n/).filter((l) => /^\s*export\b/.test(l));
  assert.equal(exportLines.length, 5, exportLines.join('\n'));
});

test('check-run-errors.ts imports nothing', () => {
  assert.ok(!/\bimport\b|\brequire\s*\(/.test(stripComments(read(ERRORS))));
});

test('the transport, the client and the health mapping import the texts from check-run-errors', () => {
  for (const f of ['check-run-transport.ts', 'github-checks-client.ts', 'github-checks-health.ts']) {
    assert.match(read(path.join(DIR, f)), /from '\.\/check-run-errors';/, f);
  }
});

test('no other production .ts file holds any of the five texts', () => {
  const files = productionTs(SRC);
  assert.ok(files.length > 100, 'the scan saw the production tree');
  assert.ok(files.includes(path.join(DIR, 'check-run-transport.ts')), 'the scan saw the transport');
  const hits = [];
  for (const f of files) {
    if (f === ERRORS) continue;
    const text = read(f);
    for (const [name, value] of Object.entries(EXPECTED)) if (text.includes(value)) hits.push(`${rel(f)}: ${name}`);
  }
  assert.deepEqual(hits, []);
});

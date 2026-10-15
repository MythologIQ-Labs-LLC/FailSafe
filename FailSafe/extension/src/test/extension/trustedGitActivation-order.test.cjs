/**
 * Activation order for the trusted git resolver (plan-v607-final-integration
 * Phase 2, T-o1). The extension ships bundled, so a vscode-test cannot read the
 * resolver's state; the order is pinned on comment-stripped source instead.
 * configureTrustedGitFromVscode is synchronous, so a call that precedes
 * bootstrapCore( in activate() has run before the first git consumer.
 *
 * Runs standalone: node --test src/test/extension/trustedGitActivation-order.test.cjs
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..');

/** Remove // and /* *\/ comments, leaving string and template literals intact. */
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    out += c;
    i += 1;
  }
  return out;
}

const read = (...p) => stripComments(fs.readFileSync(path.join(SRC, ...p), 'utf8'));

test('T-o1: activate() configures the resolver once, before bootstrapCore', () => {
  const main = read('extension', 'main.ts');
  const start = main.indexOf('export async function activate(');
  assert.ok(start >= 0, 'activate() found');
  const body = main.slice(start);
  const calls = [...main.matchAll(/^\s*configureTrustedGitFromVscode\(context\);\s*$/gm)];
  assert.equal(calls.length, 1, 'exactly one statement-form call');
  const configureAt = body.search(/^\s*configureTrustedGitFromVscode\(context\);\s*$/m);
  const bootstrapAt = body.indexOf('bootstrapCore(');
  assert.ok(configureAt >= 0, 'the call is inside activate()');
  assert.ok(bootstrapAt >= 0, 'bootstrapCore( found');
  assert.ok(configureAt < bootstrapAt, 'configure runs before bootstrapCore');
});

test('T-o1: configureTrustedGitFromVscode is synchronous and uses the folder union everywhere', () => {
  const src = read('extension', 'trustedGitActivation.ts');
  const decl = /export\s+(async\s+)?function\s+configureTrustedGitFromVscode\s*\([^)]*\)\s*:\s*([\w<>]+)\s*\{/.exec(src);
  assert.ok(decl, 'declaration found');
  assert.equal(decl[1], undefined, 'not async');
  assert.equal(decl[2], 'void', 'returns void');
  const fn = src.slice(decl.index);
  const handlerAt = fn.indexOf('onDidChangeWorkspaceFolders(');
  assert.ok(handlerAt > 0, 'registers onDidChangeWorkspaceFolders');
  assert.match(fn.slice(0, handlerAt), /workspaceDirsFor\(/, 'the activation call uses workspaceDirsFor');
  assert.match(fn.slice(handlerAt), /workspaceDirsFor\(/, 'the folder-change handler uses workspaceDirsFor');
});

test('T-o1: only trustedGitActivation.ts calls configureTrustedGit in production code', () => {
  const callers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (path.relative(SRC, full) !== 'test') walk(full); continue; }
      if (!/\.(ts|js|cjs|mjs)$/.test(e.name)) continue;
      const text = stripComments(fs.readFileSync(full, 'utf8'));
      if (/(?<!function\s)\bconfigureTrustedGit\s*\(/.test(text)) callers.push(path.relative(SRC, full));
    }
  };
  walk(SRC);
  assert.deepEqual(callers, [path.join('extension', 'trustedGitActivation.ts')]);
});

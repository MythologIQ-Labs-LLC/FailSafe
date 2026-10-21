/**
 * C2 (plan-c2-chokidar, T5): the shipped bundle carries chokidar 4 and none of chokidar 3's glob
 * stack. braces (GHSA advisory) reached production only through chokidar 3 -> anymatch ->
 * picomatch / micromatch -> braces; chokidar 4 has no glob support and no such dependencies.
 *
 * esbuild resolves chokidar 4 through its "import" condition, so the bundle holds the ESM build
 * (`// node_modules/chokidar/esm/handler.js`); out/ runs the CJS build. chokidar 3's layout is
 * lib/nodefs-handler.js and lib/fsevents-handler.js.
 *
 * Reads dist/extension/main.js; run `npm run bundle` first (CI's pretest builds it). A missing
 * bundle fails, it does not skip.
 *
 * Runs standalone: node --test src/test/scripts/bundleDeps.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BUNDLE = path.resolve(__dirname, '..', '..', '..', 'dist', 'extension', 'main.js');

function markers() {
  assert.ok(fs.existsSync(BUNDLE), `no bundle at ${BUNDLE}: run npm run bundle first`);
  const text = fs.readFileSync(BUNDLE, 'utf8');
  const found = new Set();
  for (const m of text.matchAll(/^\/\/ (node_modules\/\S+)$/gm)) found.add(m[1]);
  return [...found];
}

describe('bundled dependencies (C2 T5)', () => {
  it('holds no braces, picomatch, anymatch or micromatch module', () => {
    const stack = markers().filter((m) => /^node_modules\/(braces|picomatch|anymatch|micromatch)\//.test(m));
    assert.deepEqual(stack, [], `${stack.length} glob-stack modules in the bundle`);
  });

  it('holds chokidar 4 (esm/handler.js) and not chokidar 3 (lib/*-handler.js)', () => {
    const chokidar = markers().filter((m) => m.startsWith('node_modules/chokidar/'));
    assert.ok(chokidar.includes('node_modules/chokidar/esm/handler.js'), `chokidar modules: ${chokidar.join(', ')}`);
    const v3 = chokidar.filter((m) => /^node_modules\/chokidar\/lib\/[^/]+-handler\.js$/.test(m));
    assert.deepEqual(v3, []);
  });
});

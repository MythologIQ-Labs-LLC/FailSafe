/**
 * Junction order in the planted-Python suite's cleanup (v6.0.8 integration LD20).
 *
 * The suite links two folders to the real Python install. Its after() must
 * remove every such link before any recursive delete, so the delete can never
 * walk into the host Python. Source check only: this file spawns nothing and
 * runs no suite.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SUITE = path.join(__dirname, 'pythonResolution.adversarial.test.cjs');

/** The text between the braces of the block that starts at `open` (the index of its `{`). */
function block(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error('unbalanced block');
}

test('LD20: the suite unlinks every junction it creates before any recursive delete in after()', () => {
  const src = fs.readFileSync(SUITE, 'utf8');
  const links = [...src.matchAll(/fs\.symlinkSync\([^,]+,\s*([A-Za-z_$][\w$]*)\s*,/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(links)].sort(), ['kVenv', 'pyhome'], 'the junctions are created through the two named paths');
  assert.match(src, /const pyhome = path\.join\(ws, 'pyhome'\);/);
  assert.match(src, /const kVenv = path\.join\(base, 'k-repo', '\.venv'\);/);

  const hooks = [...src.matchAll(/^after\(\(\) => \{/gm)];
  assert.equal(hooks.length, 1, 'one after() hook');
  const body = block(src, hooks[0].index + hooks[0][0].length - 1);
  const firstRm = body.indexOf('rmSync(');
  assert.ok(firstRm >= 0, 'after() deletes the temp folders');
  for (const link of ['pyhome', 'kVenv']) {
    const at = body.indexOf(`unlinkJunction(${link})`);
    assert.ok(at >= 0, `after() unlinks ${link}`);
    assert.ok(at < firstRm, `${link} is unlinked before the first rmSync`);
  }

  const helper = /function unlinkJunction\([^)]*\) \{/.exec(src);
  assert.ok(helper, 'unlinkJunction is defined');
  const helperBody = block(src, helper.index + helper[0].length - 1);
  assert.match(helperBody, /isSymbolicLink\(\)/, 'it refuses anything that is not a link');
  assert.match(helperBody, /fs\.unlinkSync\(/, 'it removes the link itself');
  assert.doesNotMatch(helperBody, /rmSync|rmdirSync/, 'it never deletes recursively');
});

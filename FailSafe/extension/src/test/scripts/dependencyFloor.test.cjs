/**
 * Dependency floors for the v6.0.10 Lane C remediations (plan-c1-dependency-refresh, LD4).
 *
 * A lockfile revert to a vulnerable version fails here:
 *   - @modelcontextprotocol/sdk >= 1.32.0, declared as ^1.32.0 (GHSA-22jm, -46jr, -6prh, -rvq5);
 *   - markdown-it >= 14.3.3 (dev, used by vsce at packaging time);
 *   - sharp >= 0.35.5 with every @img/sharp-<platform> and wasm entry >= 0.35.5 and every
 *     @img/sharp-libvips-* entry >= 1.3.4 (sharp 0.35.5 pins libvips 1.3.4 exactly; the native
 *     fixes live in those binaries, so a floor on sharp alone would pass a lockfile that kept
 *     1.3.2 libvips);
 *   - the sharp set is internally consistent: every @img/* pin inside node_modules/sharp and the
 *     node_modules/@img/* entries is satisfied by the locked version of its target (exact pins
 *     must be equal; range pins such as "@img/colour": "^1.1.0" must be satisfied).
 *
 * Plain version arithmetic, no dependency. Runs standalone: node --test src/test/scripts/dependencyFloor.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// src/test/scripts -> src/test -> src -> extension
const EXT = path.resolve(__dirname, '..', '..', '..');
const LOCK = require(path.join(EXT, 'package-lock.json'));
const PKG = require(path.join(EXT, 'package.json'));
const PACKAGES = LOCK.packages;

const EXACT = /^\d+\.\d+\.\d+$/;

function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v));
  if (!m) throw new Error(`not a version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compare(a, b) {
  const x = parse(a); const y = parse(b);
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** True when `version` satisfies `range` (an exact version or a caret range, the only forms the sharp set uses). */
function satisfies(version, range) {
  if (EXACT.test(range)) return compare(version, range) === 0;
  const m = /^\^(\d+\.\d+\.\d+)$/.exec(range);
  if (!m) throw new Error(`unsupported range form: ${range}`);
  const [maj, min] = parse(m[1]);
  const [vMaj, vMin] = parse(version);
  if (compare(version, m[1]) < 0) return false;
  if (maj > 0) return vMaj === maj;
  if (min > 0) return vMaj === 0 && vMin === min;
  return compare(version, m[1]) === 0;
}

function locked(name) {
  const entry = PACKAGES[`node_modules/${name}`];
  assert.ok(entry, `node_modules/${name} is not in the lockfile`);
  return entry.version;
}

const sharpSet = () => Object.keys(PACKAGES).filter((k) => k === 'node_modules/sharp' || k.startsWith('node_modules/@img/'));

describe('v6.0.10 Lane C dependency floors', () => {
  it('@modelcontextprotocol/sdk >= 1.32.0, declared with a caret floor >= 1.32.0', () => {
    assert.ok(compare(locked('@modelcontextprotocol/sdk'), '1.32.0') >= 0, `locked ${locked('@modelcontextprotocol/sdk')}`);
    const declared = PKG.dependencies['@modelcontextprotocol/sdk'];
    const floor = /^\^(.+)$/.exec(declared);
    assert.ok(floor, `declared range ${declared} is not a caret range`);
    assert.ok(compare(floor[1], '1.32.0') >= 0, `declared floor ${declared}`);
  });

  it('markdown-it >= 14.3.3', () => {
    assert.ok(compare(locked('markdown-it'), '14.3.3') >= 0, `locked ${locked('markdown-it')}`);
  });

  it('sharp and every @img/sharp-<platform> or wasm entry >= 0.35.5', () => {
    assert.ok(compare(locked('sharp'), '0.35.5') >= 0, `sharp locked ${locked('sharp')}`);
    const platform = sharpSet().filter((k) => /^node_modules\/@img\/sharp-(?!libvips-)/.test(k));
    assert.ok(platform.length > 0, 'no @img/sharp-<platform> entries found');
    const low = platform.filter((k) => compare(PACKAGES[k].version, '0.35.5') < 0).map((k) => `${k}@${PACKAGES[k].version}`);
    assert.deepEqual(low, [], `${low.length} of ${platform.length} platform entries below 0.35.5`);
  });

  it('every @img/sharp-libvips-* entry >= 1.3.4', () => {
    const libvips = sharpSet().filter((k) => k.startsWith('node_modules/@img/sharp-libvips-'));
    assert.ok(libvips.length > 0, 'no @img/sharp-libvips-* entries found');
    const low = libvips.filter((k) => compare(PACKAGES[k].version, '1.3.4') < 0).map((k) => `${k}@${PACKAGES[k].version}`);
    assert.deepEqual(low, [], `${low.length} of ${libvips.length} libvips entries below 1.3.4`);
  });

  it('the sharp set is consistent: every @img/* pin is satisfied by its locked target', () => {
    const problems = [];
    let pins = 0;
    for (const key of sharpSet()) {
      const e = PACKAGES[key];
      for (const field of ['dependencies', 'optionalDependencies']) {
        for (const [name, range] of Object.entries(e[field] || {})) {
          if (!name.startsWith('@img/')) continue;
          pins += 1;
          const target = PACKAGES[`node_modules/${name}`];
          if (!target) { problems.push(`${key} ${field} ${name}@${range}: target not locked`); continue; }
          if (!satisfies(target.version, range)) problems.push(`${key} ${field} ${name}@${range}: locked ${target.version}`);
        }
      }
    }
    assert.ok(pins > 0, 'no @img/* pins found in the sharp set');
    assert.deepEqual(problems, [], `${problems.length} of ${pins} pins inconsistent`);
  });
});

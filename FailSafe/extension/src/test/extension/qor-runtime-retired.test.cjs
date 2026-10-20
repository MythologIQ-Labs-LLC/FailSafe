/**
 * B289 — the Qor runtime is retired (contract qor-runtime, Retirement review #538).
 *
 * The client, its three Console routes, the hub entry and the API ticker are removed. The
 * `failsafe.qorelogic.externalRuntime.*` settings stay contributed for one more release with a
 * deprecation message that says they do nothing (their removal is B326). This suite holds both
 * halves: every setting is deprecated, only the plain-text key cleanup still reads one of them,
 * and no product source names the removed runtime surface.
 *
 * Runs standalone: node --test src/test/extension/qor-runtime-retired.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// src/test/extension -> src/test -> src -> extension
const EXT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(EXT, 'src');
const PREFIX = 'failsafe.qorelogic.externalRuntime.';
const MESSAGE = 'No longer used: FailSafe has no external Qor runtime integration. Remove this setting.';
const KEYS = ['apiKey', 'apiKeyEnvVar', 'baseUrl', 'enabled', 'timeoutMs'];

function settings() {
  const pkg = JSON.parse(fs.readFileSync(path.join(EXT, 'package.json'), 'utf8'));
  const blocks = [].concat(pkg.contributes.configuration);
  return Object.assign({}, ...blocks.map((b) => b.properties || {}));
}

/** Product sources: everything under src/ except tests and vendored UI code. */
function productSources(dir = SRC, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(SRC, full).split(path.sep).join('/');
    if (e.isDirectory()) {
      if (rel === 'test' || rel === 'roadmap/ui/vendor') continue;
      productSources(full, out);
    } else if (/\.(ts|js|cjs|mjs|html)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push({ rel, text: fs.readFileSync(full, 'utf8') });
    }
  }
  return out;
}

describe('B289 Qor runtime retired', () => {
  it('every externalRuntime setting is deprecated and says it has no effect', () => {
    const all = settings();
    const keys = Object.keys(all).filter((k) => k.startsWith(PREFIX)).sort();
    assert.deepEqual(keys, KEYS.map((k) => PREFIX + k).sort());
    for (const k of keys) {
      assert.ok(all[k].deprecationMessage, `${k} has no deprecationMessage`);
      assert.match(all[k].description || '', /has no effect/i, `${k}: the description must say it has no effect`);
    }
    for (const k of ['enabled', 'baseUrl', 'apiKeyEnvVar', 'timeoutMs']) {
      assert.equal(all[PREFIX + k].deprecationMessage, MESSAGE, `${PREFIX + k}: deprecation message`);
    }
  });

  it('only the plain-text key cleanup still names an externalRuntime setting', () => {
    const readers = productSources().filter((f) => f.text.includes('externalRuntime')).map((f) => f.rel);
    assert.deepEqual(readers, ['integrations/credentials/credentialRegistry.ts']);
  });

  it('no product source names the retired runtime surface', () => {
    const named = productSources().filter((f) => /qorRuntime|QorRuntime|["']qor-runtime["']/.test(f.text)).map((f) => f.rel);
    assert.deepEqual(named, []);
  });
});

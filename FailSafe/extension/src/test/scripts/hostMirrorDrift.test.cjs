/**
 * FX945 — the host install-map mirror is guarded against UPSTREAM, not against
 * a copy of itself (#233 Scope A).
 *
 * `hostLayouts.ts` states its own invariant in its header: MIN_QOR_LOGIC_VERSION
 * must stay aligned with the qor-logic version whose `HostTarget.install_map`
 * it mirrors. That invariant was violated for 138 releases and nothing noticed,
 * because the only test that looked like a guard —
 * `qor-logic-install-record.test.ts:127` — asserts
 *
 *     assert.deepEqual(names, ['claude', 'codex', 'gemini', 'kilo-code']);
 *
 * which is a literal copy of the local constant. It passes identically whether
 * upstream registers four hosts or sixty. Reachability is not assertion strength.
 *
 * This suite reads the INSTALLED toolkit instead. Assertion 1 fails today if the
 * declaration is removed, because `cursor` and `cline` really are unmirrored.
 *
 * Skips (never silently passes) when the toolkit is not importable or the
 * compiled output is missing/stale — each skip states its reason.
 *
 * Runs standalone: node --test src/test/scripts/hostMirrorDrift.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXT_ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT_FILE = path.join(EXT_ROOT, 'out', 'qorlogic', 'hostLayouts.js');
const SRC_FILE = path.join(EXT_ROOT, 'src', 'qorlogic', 'hostLayouts.ts');
const PY = process.env.QOR_LOGIC_PYTHON || 'python';

/**
 * Upstream's registered hosts and their install maps, normalised to
 * base-relative POSIX paths so the comparison is about SHAPE, not about which
 * directory the probe happened to run in.
 *
 * List-form argv, `shell: false`, and a fixed `-c` script with nothing
 * interpolated into it (SG-Phase47-A) — the audit bound this, and
 * `scripts/qor-skip-emitter.cjs` is the in-repo precedent.
 */
const UPSTREAM_SCRIPT = [
  'import json, os',
  'os.environ["QORLOGIC_PROJECT_DIR"] = "/__probe__"',
  'from qor import hosts',
  'out = {}',
  'for name, factory in hosts._HOSTS.items():',
  '    t = factory("repo")',
  '    base = str(t.base).replace("\\\\", "/")',
  '    m = {}',
  '    for prefix, dst in t.install_map.items():',
  '        m[prefix] = str(dst).replace("\\\\", "/")[len(base) + 1:]',
  '    out[name] = {"base": base.rsplit("/", 1)[-1], "map": m}',
  'print(json.dumps(out))',
].join('\n');

function readUpstreamHosts() {
  const res = spawnSync(PY, ['-c', UPSTREAM_SCRIPT], { encoding: 'utf8', shell: false });
  if (res.error || res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

/** The compiled mirror, or null with a stated reason when it cannot be trusted. */
function readMirror() {
  if (!fs.existsSync(OUT_FILE)) return { reason: `${OUT_FILE} is not built — run npm run compile` };
  if (fs.existsSync(SRC_FILE) && fs.statSync(SRC_FILE).mtimeMs > fs.statSync(OUT_FILE).mtimeMs) {
    return { reason: 'compiled hostLayouts is stale (source is newer) — run npm run compile' };
  }
  const mod = require(OUT_FILE);
  return { layouts: mod.HOST_INSTALL_LAYOUTS, unmirrored: mod.UNMIRRORED_HOSTS };
}

/** Local layout normalised the same way as upstream: base dirname + relative map. */
function normaliseLocal(layout) {
  const base = layout.base;                       // e.g. ".claude"
  const map = {};
  for (const [prefix, dst] of Object.entries(layout.installMap)) {
    map[prefix] = dst.slice(base.length + 1);     // ".claude/skills" -> "skills"
  }
  return { base, map };
}

const UPSTREAM = readUpstreamHosts();
const MIRROR = readMirror();

/**
 * Why the prerequisites are unmet, or null when they are met.
 *
 * Pure and exported so the SKIP path has its own falsifier. The first version
 * of this file did `return t.skip(reason)` from the guard — but `t.skip()`
 * returns undefined, so `if (guard(t)) return;` never returned and every
 * assertion ran on null state. It passed locally, where the toolkit is present
 * and the guard never fires, and crashed in CI, where it does. A skip branch
 * with no test is the same defect this whole suite exists to catch, one level
 * down. These assertions exercise it directly.
 */
function skipReason(mirror, upstream) {
  if (mirror && mirror.reason) return mirror.reason;
  if (upstream === null || upstream === undefined) {
    return 'qor.hosts is not importable — install qor-logic to run the mirror guard';
  }
  return null;
}

/** Returns TRUE when the caller must stop. `t.skip()` alone does not stop it. */
function guard(t) {
  const reason = skipReason(MIRROR, UPSTREAM);
  if (reason === null) return false;
  t.skip(reason);
  return true;
}

describe('FX945 host install-map mirror vs installed qor-logic', () => {
  it('mirrors or explicitly declares every host upstream registers', (t) => {
    if (guard(t)) return;
    const undeclared = Object.keys(UPSTREAM).filter(
      (h) => !(h in MIRROR.layouts) && !(h in MIRROR.unmirrored),
    );
    assert.deepEqual(
      undeclared, [],
      'upstream registers a host this extension neither mirrors nor declares in ' +
      'UNMIRRORED_HOSTS. Mirror it, or declare it with a justification — silence ' +
      'is how cursor and cline went unnoticed for 138 releases.',
    );
  });

  it('matches upstream exactly for every host it does mirror', (t) => {
    if (guard(t)) return;
    for (const [host, layout] of Object.entries(MIRROR.layouts)) {
      const up = UPSTREAM[host];
      assert.ok(up, `${host} is mirrored here but upstream no longer registers it`);
      const local = normaliseLocal(layout);
      assert.equal(
        local.base, up.base,
        `${host} base dir drifted: local ${local.base}, upstream ${up.base}. ` +
        'FX575 was exactly this defect (.kilo vs .kilo-code) and cost a release.',
      );
      assert.deepEqual(
        local.map, up.map,
        `${host} install_map drifted from upstream`,
      );
    }
  });

  it('declares nothing as unmirrored that is in fact mirrored', (t) => {
    if (guard(t)) return;
    // Anti-rot. Without this, a host added to HOST_INSTALL_LAYOUTS later would
    // leave its stale UNMIRRORED_HOSTS entry behind, and assertion 1 would keep
    // passing on a declaration that no longer describes anything true.
    const stale = Object.keys(MIRROR.unmirrored).filter((h) => h in MIRROR.layouts);
    assert.deepEqual(
      stale, [],
      'a host is declared UNMIRRORED but is actually mirrored — remove the stale declaration',
    );
    for (const [host, justification] of Object.entries(MIRROR.unmirrored)) {
      assert.ok(
        typeof justification === 'string' && justification.length >= 50,
        `UNMIRRORED_HOSTS.${host} needs a real justification, not a placeholder`,
      );
    }
  });

  it('skips — rather than crashing — when a prerequisite is absent', () => {
    // THE FALSIFIER FOR THE SKIP PATH. Its absence is precisely why the first
    // version of this file passed locally and failed CI: the guard returned
    // undefined, so the assertions ran against null state and threw.
    assert.equal(
      skipReason({ reason: 'compiled hostLayouts is stale' }, { claude: {} }),
      'compiled hostLayouts is stale',
      'a stale or missing build must be reported as the reason to skip',
    );
    assert.match(
      skipReason({ layouts: {}, unmirrored: {} }, null) || '',
      /not importable/,
      'an absent toolkit must be reported as the reason to skip',
    );
    assert.equal(
      skipReason({ layouts: {}, unmirrored: {} }, { claude: {} }), null,
      'with both prerequisites met the guard must NOT skip — otherwise the ' +
      'whole suite would silently self-disable',
    );
  });
});

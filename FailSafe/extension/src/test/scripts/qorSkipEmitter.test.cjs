/**
 * FX943 — disclosed-skip emission closes only what the repository declared.
 *
 * The falsifier is assertion 2. If an UNDECLARED gate's skip were written closed,
 * every skipping gate would look handled and the declaration would be doing no
 * work at all — a governance surface that reports success while asserting nothing,
 * which is the defect family this whole issue exists to address (ledger #602).
 *
 * Every assertion writes to a temp log, never to docs/PROCESS_SHADOW_GENOME.md.
 *
 * Runs standalone: node --test src/test/scripts/qorSkipEmitter.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { emitSkip, SkipEmitError } = require('../../../scripts/qor-skip-emitter.cjs');

const PY = process.env.QOR_LOGIC_PYTHON || 'python';

/** A temp repo root with an optional permanent_skips declaration, plus a temp log. */
function scaffold(permanentSkips) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-skip-'));
  fs.mkdirSync(path.join(root, '.qorlogic'));
  fs.writeFileSync(
    path.join(root, '.qorlogic', 'config.json'),
    JSON.stringify(permanentSkips ? { permanent_skips: permanentSkips } : {}),
    'utf8'
  );
  return { root, log: path.join(root, 'events.jsonl') };
}

function toolkitAvailable() {
  const { spawnSync } = require('child_process');
  const r = spawnSync(PY, ['-c', 'import qor.scripts.permanent_skips'], { shell: false });
  return !r.error && r.status === 0;
}

const AVAILABLE = toolkitAvailable();
const JUSTIFICATION =
  'This repository is a VS Code extension with no SQL migrations, so the Data-API ' +
  'scan names a property no enforcer will ever satisfy here.';

describe('FX943 disclosed-skip emission', () => {
  it('closes a skip for a DECLARED gate, with a cannot-automate enforcer', (t) => {
    if (!AVAILABLE) return t.skip('qor.scripts.permanent_skips not importable — toolkit absent');
    const { root, log } = scaffold({ data_api_acl_lint: JUSTIFICATION });
    const ev = emitSkip({ gate: 'data_api_acl_lint', skill: 'qor-substantiate', repoRoot: root, logPath: log });
    assert.equal(ev.addressed, true, 'a declared gate must close at emission');
    assert.match(ev.closure_enforcer || '', /^cannot-automate:/);
    assert.ok(fs.readFileSync(log, 'utf8').includes('data_api_acl_lint'), 'event must reach the log');
  });

  it('leaves a skip for an UNDECLARED gate OPEN', (t) => {
    if (!AVAILABLE) return t.skip('qor.scripts.permanent_skips not importable — toolkit absent');
    // THE FALSIFIER. If this ever reports closed, the declaration is doing nothing
    // and every skipping gate silently looks handled.
    const { root, log } = scaffold({ some_other_gate: JUSTIFICATION });
    const ev = emitSkip({ gate: 'data_api_acl_lint', skill: 'qor-substantiate', repoRoot: root, logPath: log });
    assert.equal(ev.addressed, false, 'an undeclared skip is real debt and must stay open');
    assert.equal(ev.closure_enforcer, undefined);
  });

  it('raises on a sub-50-character justification and writes nothing', (t) => {
    if (!AVAILABLE) return t.skip('qor.scripts.permanent_skips not importable — toolkit absent');
    const { root, log } = scaffold({ data_api_acl_lint: 'too short' });
    assert.throws(
      () => emitSkip({ gate: 'data_api_acl_lint', skill: 'qor-substantiate', repoRoot: root, logPath: log }),
      SkipEmitError
    );
    // A partial write would leave an unclosed event reading as genuine debt.
    assert.equal(fs.existsSync(log), false, 'nothing may be written when the declaration is malformed');
  });

  it('refuses an event type permanent_skips cannot close', () => {
    const { root, log } = scaffold({});
    assert.throws(
      () => emitSkip({
        gate: 'x', skill: 'y', eventType: 'gate_override', repoRoot: root, logPath: log,
      }),
      /not closable by permanent_skips/
    );
    assert.equal(fs.existsSync(log), false);
  });
});

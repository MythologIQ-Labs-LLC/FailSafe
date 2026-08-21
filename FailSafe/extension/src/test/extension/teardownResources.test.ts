// #388 F2/F3: the teardown list's CONTENT and ORDER are load-bearing, and were
// previously asserted by nothing that CI executes (the branch's original test
// was a .cjs file, which `.vscode-test.mjs`'s out/test/**/*.test.js glob never
// picks up). `disposeResources` awaits entries sequentially, so position is a
// real contract:
//   - planManager AFTER consoleServer — the console must not serve a request
//     against a disposed planManager.
//   - trustEngine AFTER qorelogicManager, which also disposes it.

import { strict as assert } from 'assert';
import { buildTeardownResources } from '../../extension/teardownResources';

function names(entries: Array<{ name: string }>): string[] {
  return entries.map((e) => e.name);
}

suite('teardown resource list (#388)', () => {
  test('planManager is present and disposed AFTER consoleServer', () => {
    const order = names(buildTeardownResources({}));
    const pm = order.indexOf('planManager');
    const cs = order.indexOf('consoleServer');
    assert.notEqual(pm, -1, 'planManager must be in the teardown list — a context.subscriptions push alone does not fire on activation failure');
    assert.ok(pm > cs, `planManager (${pm}) must come after consoleServer (${cs})`);
  });

  test('trustEngine is present and disposed AFTER qorelogicManager', () => {
    const order = names(buildTeardownResources({}));
    const te = order.indexOf('trustEngine');
    const qm = order.indexOf('qorelogicManager');
    assert.notEqual(te, -1, 'trustEngine must be in the teardown list');
    assert.ok(te > qm, `trustEngine (${te}) must come after qorelogicManager (${qm})`);
  });

  test('each entry disposes the handle it was given', () => {
    const calls: string[] = [];
    const entries = buildTeardownResources({
      consoleServer: { stop: () => { calls.push('consoleServer'); } },
      planManager: { dispose: () => { calls.push('planManager'); } },
      qorelogicManager: { dispose: () => { calls.push('qorelogicManager'); } },
      trustEngine: { dispose: () => { calls.push('trustEngine'); } },
    });
    for (const e of entries) { void e.dispose(); }
    assert.deepEqual(calls, ['consoleServer', 'planManager', 'qorelogicManager', 'trustEngine'],
      'disposers must run in list order and reach the passed objects');
  });

  test('absent handles are a no-op — a partial activation must not throw during teardown', () => {
    const entries = buildTeardownResources({});
    assert.doesNotThrow(() => { for (const e of entries) { void e.dispose(); } });
  });
});

// #388: the trustEngine handle must be published AT CONSTRUCTION, not from
// bootstrapQorLogic's resolved value — TrustEngine is built near the top of
// that function and several throw sites precede its return, so assigning from
// the return value leaves the crash-path window open. This pins the ordering
// contract of the publish callback against the real source, without paying for
// a full bootstrapQorLogic harness.
suite('trustEngine publish-at-construction (#388)', () => {
  test('publishTrustEngine is invoked before any post-construction await in bootstrapQorLogic', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'src', 'extension', 'bootstrapQorLogic.ts'), 'utf-8');
    const construct = src.indexOf('const trustEngine = new TrustEngine(');
    const publish = src.indexOf('publishTrustEngine?.(trustEngine)');
    const policyLoad = src.indexOf('policyEngine.loadPolicies()');
    assert.notEqual(construct, -1, 'TrustEngine construction site must exist');
    assert.notEqual(publish, -1,
      'the handle must be published inside bootstrapQorLogic — assigning from its return value is too late');
    assert.ok(publish > construct, 'publish must come after construction');
    assert.ok(publish < policyLoad,
      'publish must precede the first throwable step after construction (policyEngine.loadPolicies)');
  });
});

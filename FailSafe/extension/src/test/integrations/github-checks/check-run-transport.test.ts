// #476: the Check Run transport refuses every SHIELD-family name except a
// failure (which can only block) unless a verified receipt authorizes it, and
// only the client and the verified publisher may import it.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { postCheckRun, type CheckRunTarget, type TransportPayload } from '../../../integrations/github-checks/check-run-transport';
import { publishCheckRunPayload, type GitHubPostFn } from '../../../integrations/github-checks/github-checks-client';
import type { CheckRunPayload } from '../../../integrations/github-checks/github-checks-map';
import { SRC_ROOT, dynamicReferences, moduleReferences, productionSources, referencesTo, specifierNames } from './source-scan';
import { verifyShieldReceipt, type VerifiedShieldReceipt } from '../../../integrations/shield-receipts/shield-receipt-verifier';
import { NOW, RECEIPT_KEY, SEAL, baseScenario, chainOf, keysOf, sourceOf } from '../shield-receipts/fixtures';

const SHA = 'a'.repeat(40);
const TARGET: CheckRunTarget = { repo: 'acme/x', apiHost: 'api.github.com', baseUrl: 'https://api.github.com' };

function shieldPayload(conclusion: string, headSha = SHA): TransportPayload {
  return {
    name: 'FailSafe SHIELD', head_sha: headSha, status: 'completed', conclusion,
    output: { title: 't', summary: 's' },
  } as unknown as TransportPayload;
}

function counting(): { post: GitHubPostFn; calls: () => number; bodies: string[] } {
  const bodies: string[] = [];
  return {
    post: async (_u, _h, body) => { bodies.push(body); return { status: 201, body: JSON.stringify({ id: 3 }) }; },
    calls: () => bodies.length,
    bodies,
  };
}

suite('check-run-transport SHIELD guard (#476)', () => {
  test('SHIELD success with no authority is refused before the POST', async () => {
    const c = counting();
    const r = await postCheckRun(shieldPayload('success'), TARGET, 't', c.post);
    assert.equal(r.ok, false);
    assert.equal(c.calls(), 0);
  });

  test('SHIELD failure is postable (it can only block)', async () => {
    const c = counting();
    const r = await postCheckRun(shieldPayload('failure'), TARGET, 't', c.post);
    assert.equal(r.ok, true);
    assert.equal(c.calls(), 1);
  });

  for (const conclusion of ['neutral', 'skipped']) {
    test(`SHIELD ${conclusion} is refused (it would pass a required check)`, async () => {
      const c = counting();
      const r = await postCheckRun(shieldPayload(conclusion), TARGET, 't', c.post);
      assert.equal(r.ok, false);
      assert.equal(c.calls(), 0);
    });
  }

  test('a target whose apiHost differs from its baseUrl host is refused', async () => {
    const c = counting();
    const r = await postCheckRun(shieldPayload('failure'), { ...TARGET, apiHost: 'ghe.acme.com' }, 't', c.post);
    assert.equal(r.ok, false);
    assert.equal(c.calls(), 0);
  });
});

suite('check-run-transport wire copy and closed name set (#476 M2)', () => {
  const ADVISORY = 'FailSafe Manual Advisory';
  /** No posted wire body may carry the SHIELD name with anything but failure
   *  (none of these has authority; neutral would pass a required check). */
  const assertNoShieldSuccess = (bodies: string[]): void => {
    for (const b of bodies) {
      const j = JSON.parse(b);
      assert.ok(!(j.name === 'FailSafe SHIELD' && j.conclusion !== 'failure'), `posted ${b}`);
    }
  };

  test('a payload whose toJSON serializes as a SHIELD success posts only the checked fields', async () => {
    const tricky = {
      name: ADVISORY, head_sha: SHA, status: 'completed', conclusion: 'neutral', output: { title: 't', summary: 's' },
      toJSON: () => ({ name: 'FailSafe SHIELD', head_sha: SHA, status: 'completed', conclusion: 'success', output: { title: 't', summary: 's' } }),
    } as unknown as TransportPayload;
    const direct = counting();
    await postCheckRun(tricky, TARGET, 't', direct.post);
    assertNoShieldSuccess(direct.bodies);
    const viaClient = counting();
    await publishCheckRunPayload(tricky as unknown as CheckRunPayload, { remoteUrl: 'https://github.com/acme/x', headSha: SHA }, { enabled: true, token: 't' }, viaClient.post);
    assertNoShieldSuccess(viaClient.bodies);
    for (const b of [...direct.bodies, ...viaClient.bodies]) assert.equal(JSON.parse(b).name, ADVISORY);
  });

  test('getters that change between reads cannot smuggle a SHIELD success', async () => {
    const flipping = (): TransportPayload => {
      let n = 0; let c = 0;
      return {
        get name() { return n++ === 0 ? ADVISORY : 'FailSafe SHIELD'; },
        head_sha: SHA, status: 'completed',
        get conclusion() { return c++ === 0 ? 'neutral' : 'success'; },
        output: { title: 't', summary: 's' },
      } as unknown as TransportPayload;
    };
    const direct = counting();
    await postCheckRun(flipping(), TARGET, 't', direct.post);
    assertNoShieldSuccess(direct.bodies);
    const viaClient = counting();
    await publishCheckRunPayload(flipping() as unknown as CheckRunPayload, { remoteUrl: 'https://github.com/acme/x', headSha: SHA }, { enabled: true, token: 't' }, viaClient.post);
    assertNoShieldSuccess(viaClient.bodies);
  });

  test('a Proxy payload is read once per field and posts only the checked copy', async () => {
    const reads: string[] = [];
    const base = { name: ADVISORY, head_sha: SHA, status: 'completed', conclusion: 'neutral', output: { title: 't', summary: 's' } };
    const proxy = new Proxy(base, { get: (t, k) => { reads.push(String(k)); return (t as Record<string | symbol, unknown>)[k]; } });
    const c = counting();
    await postCheckRun(proxy as unknown as TransportPayload, TARGET, 't', c.post);
    assert.equal(c.calls(), 1);
    assert.deepEqual(JSON.parse(c.bodies[0]), base);
    assert.ok(!reads.includes('toJSON'), 'the live payload is never serialized');
  });

  for (const [label, name, conclusion] of [
    ['a String object name', new String('FailSafe SHIELD'), 'success'],
    ['a Greek Eta homoglyph (SΗIELD)', 'FailSafe SΗIELD', 'success'],
    ['an arbitrary name', 'X', 'success'],
    ['an arbitrary name with failure', 'Totally Not Shield', 'failure'],
    ['a String object conclusion', 'FailSafe: PR Linkage', new String('success')],
    ['an unknown conclusion on PR Linkage', 'FailSafe: PR Linkage', 'skipped'],
  ] as Array<[string, unknown, unknown]>) {
    test(`${label} is refused before the POST`, async () => {
      const c = counting();
      const p = { name, head_sha: SHA, status: 'completed', conclusion, output: { title: 't', summary: 's' } } as unknown as TransportPayload;
      assert.equal((await postCheckRun(p, TARGET, 't', c.post)).ok, false);
      assert.equal(c.calls(), 0);
    });
  }

  test('extra payload fields are never posted', async () => {
    const c = counting();
    const p = {
      name: ADVISORY, head_sha: SHA, status: 'completed', conclusion: 'neutral', details_url: 'https://example.com/d',
      output: { title: 't', summary: 's', annotations: [{ path: 'x' }] }, actions: [{ label: 'merge' }],
    } as unknown as TransportPayload;
    await postCheckRun(p, TARGET, 't', c.post);
    assert.deepEqual(JSON.parse(c.bodies[0]), {
      name: ADVISORY, head_sha: SHA, status: 'completed', conclusion: 'neutral', output: { title: 't', summary: 's' }, details_url: 'https://example.com/d',
    });
  });
});

suite('check-run-transport verified authority (#476)', () => {
  let receipt: VerifiedShieldReceipt;
  const acme: CheckRunTarget = { repo: 'acme/failsafe', apiHost: 'api.github.com', baseUrl: 'https://api.github.com' };

  suiteSetup(async () => {
    const v = await verifyShieldReceipt(sourceOf(baseScenario()), keysOf(RECEIPT_KEY), chainOf('OK'), undefined, 'api.github.com', NOW);
    assert.equal(v.kind, 'verified');
    if (v.kind === 'verified') receipt = v.receipt;
  });

  test('a real receipt for commit A with success on head_sha A -> 1 POST', async () => {
    const c = counting();
    const r = await postCheckRun(shieldPayload('success', SEAL), acme, 't', c.post, receipt);
    assert.equal(r.ok, true);
    assert.equal(c.calls(), 1);
  });

  test('a real receipt for commit A with head_sha B -> 0 POSTs', async () => {
    const c = counting();
    assert.equal((await postCheckRun(shieldPayload('success', SHA), acme, 't', c.post, receipt)).ok, false);
    assert.equal(c.calls(), 0);
  });

  test('a JSON clone of the receipt as authority -> 0 POSTs', async () => {
    const c = counting();
    const clone = JSON.parse(JSON.stringify(receipt));
    assert.equal((await postCheckRun(shieldPayload('success', SEAL), acme, 't', c.post, clone)).ok, false);
    assert.equal(c.calls(), 0);
  });

  test('a real receipt posted to another repo or another API host -> 0 POSTs', async () => {
    const c = counting();
    const otherRepo = { ...acme, repo: 'acme/y' };
    const otherHost = { repo: 'acme/failsafe', apiHost: 'ghe.acme.com', baseUrl: 'https://ghe.acme.com/api/v3' };
    const upper = { ...acme, repo: 'ACME/FailSafe' };
    assert.equal((await postCheckRun(shieldPayload('success', SEAL), otherRepo, 't', c.post, receipt)).ok, false);
    assert.equal((await postCheckRun(shieldPayload('success', SEAL), otherHost, 't', c.post, receipt)).ok, false);
    assert.equal(c.calls(), 0);
    assert.equal((await postCheckRun(shieldPayload('success', SEAL), upper, 't', c.post, receipt)).ok, true, 'repo compare is case-insensitive');
  });
});

suite('check-run-transport importer pin (#476)', () => {
  test('the matcher detects all four reference forms', () => {
    const text = [
      "import { postCheckRun } from './check-run-transport';",
      "export { postCheckRun } from '../github-checks/check-run-transport';",
      "const t = require('./check-run-transport');",
      "const u = await import('./check-run-transport');",
      "import type { CheckRunTarget } from './check-run-transport';",
      'const v = await import(`./check-run-transport`);',
      "const w = require('./check-run-transport.js');",
    ].join('\n');
    const refs = moduleReferences(text).filter((r) => specifierNames(r.specifier).includes('check-run-transport'));
    assert.equal(refs.length, 7);
    assert.deepEqual(refs.map((r) => r.typeOnly), [false, false, false, false, true, false, false]);
  });

  test('the dynamic matcher flags concatenated, template and variable specifiers only', () => {
    const text = "const x = require('a' + b);\nconst y = await import(`./${m}`);\nconst z = require(name);\nconst ok = require('fs');\nconst ok2 = import(`./lit`);\n// prose: import (#98)\n/* require (x) */\nclient.import(rows);";
    assert.deepEqual(dynamicReferences(text), ["require('a' + b)", 'import(`./${m}`)', 'require(name)']);
  });

  test('no production file uses a non-literal require( or import( (concatenation or template evasion)', () => {
    const hits = productionSources().flatMap((f) => dynamicReferences(fs.readFileSync(f, 'utf8'))
      .map((d) => `${path.relative(SRC_ROOT, f).split(path.sep).join('/')}: ${d}`));
    assert.deepEqual(hits, []);
  });

  test('a .js-suffixed specifier still names the module', () => {
    assert.ok(specifierNames('./check-run-transport.js').includes('check-run-transport'));
  });

  test('only github-checks-client.ts and shield-check-publish.ts reference the transport', () => {
    assert.ok(fs.existsSync(path.join(SRC_ROOT, 'integrations', 'github-checks', 'check-run-transport.ts')), 'transport source present');
    assert.ok(productionSources().length > 100, 'scan saw the production tree');
    const files = [...new Set(referencesTo('check-run-transport').map((r) => r.file))].sort();
    const allowed = ['integrations/github-checks/github-checks-client.ts', 'integrations/github-checks/shield-check-publish.ts'];
    assert.deepEqual(files.filter((f) => !allowed.includes(f)), []);
    assert.ok(files.includes('integrations/github-checks/github-checks-client.ts'), 'scan found the known importer');
  });

  test('no production file except the transport names the check-runs endpoint', () => {
    const hits = productionSources()
      .filter((f) => fs.readFileSync(f, 'utf8').includes('check-runs'))
      .map((f) => path.relative(SRC_ROOT, f).split(path.sep).join('/'));
    assert.deepEqual(hits, ['integrations/github-checks/check-run-transport.ts']);
  });
});

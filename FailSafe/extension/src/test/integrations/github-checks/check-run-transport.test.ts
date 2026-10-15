// #476: the Check Run transport refuses every SHIELD-family name except a
// failure (which can only block) unless a verified receipt authorizes it, and
// only the client and the verified publisher may import it.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { postCheckRun, type CheckRunTarget, type TransportPayload } from '../../../integrations/github-checks/check-run-transport';
import type { GitHubPostFn } from '../../../integrations/github-checks/github-checks-client';
import { SRC_ROOT, moduleReferences, productionSources, referencesTo } from './source-scan';

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

suite('check-run-transport importer pin (#476)', () => {
  test('the matcher detects all four reference forms', () => {
    const text = [
      "import { postCheckRun } from './check-run-transport';",
      "export { postCheckRun } from '../github-checks/check-run-transport';",
      "const t = require('./check-run-transport');",
      "const u = await import('./check-run-transport');",
      "import type { CheckRunTarget } from './check-run-transport';",
    ].join('\n');
    const refs = moduleReferences(text).filter((r) => r.specifier.endsWith('check-run-transport'));
    assert.equal(refs.length, 5);
    assert.deepEqual(refs.map((r) => r.typeOnly), [false, false, false, false, true]);
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

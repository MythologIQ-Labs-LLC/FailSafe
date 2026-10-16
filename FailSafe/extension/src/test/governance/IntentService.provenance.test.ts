// #480 T10: CREATED-entry provenance and the external-reference lookup. The
// history chain is plain unkeyed SHA-256: it catches edits that do not
// recompute it, which is all this suite claims.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IntentService } from '../../governance/IntentService';
import { SessionManager } from '../../governance/SessionManager';
import { IntentHistoryLog } from '../../governance/IntentHistoryLog';

const params = (extra: Record<string, unknown> = {}) => ({
  type: 'feature' as const, purpose: 'p', scope: { files: [], modules: [], riskGrade: 'L1' as const },
  metadata: { author: 'user', tags: [], externalRef: 'jira:PROJ-1' }, ...extra,
});

suite('IntentService provenance (#480 T10)', () => {
  let root: string;
  let historyPath: string;
  setup(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-prov-')));
    historyPath = path.join(root, '.failsafe', 'manifest', 'intent_history.jsonl');
  });
  teardown(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));

  const svc = () => new IntentService(root, new SessionManager(root));
  const lines = () => fs.readFileSync(historyPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

  test('without provenance the CREATED entry has no details key, as before', async () => {
    await svc().createIntent(params());
    assert.equal('details' in lines()[0], false);
  });

  test('with provenance the CREATED entry carries it and the lookup finds only matching entries', async () => {
    const s = svc();
    const a = await s.createIntent(params({ provenance: { externalRef: 'jira:PROJ-1', contentSha256: 'a'.repeat(64) } }));
    fs.rmSync(path.join(root, '.failsafe', 'manifest', 'active_intent.json'));
    await s.createIntent(params({ provenance: { externalRef: 'jira:PROJ-2' } }));
    assert.deepEqual(lines()[0].details, { provenance: { externalRef: 'jira:PROJ-1', contentSha256: 'a'.repeat(64) } });
    const found = await s.findCreatedByExternalRef('jira:PROJ-1');
    assert.equal(found.integrity, 'valid');
    const entries = (found as { entries: Array<{ intentId: string }> }).entries;
    assert.deepEqual(entries.map((e) => e.intentId), [a.id]);
  });

  test('an edit to the provenance that does not recompute the chain is detected and the lookup reports invalid', async () => {
    const s = svc();
    await s.createIntent(params({ provenance: { externalRef: 'jira:PROJ-1', url: 'https://acme.atlassian.net/browse/PROJ-1' } }));
    const entry = lines()[0];
    entry.details.provenance.url = 'https://evil.example/';
    fs.writeFileSync(historyPath, JSON.stringify(entry) + '\n');
    assert.equal((await new IntentHistoryLog(path.dirname(historyPath)).verifyChainIntegrity()).valid, false);
    assert.deepEqual(await s.findCreatedByExternalRef('jira:PROJ-1'), { integrity: 'invalid' });
  });

  test('a torn last history line makes the lookup report invalid without throwing', async () => {
    const s = svc();
    await s.createIntent(params({ provenance: { externalRef: 'jira:PROJ-1' } }));
    fs.appendFileSync(historyPath, '{"intentId":"half');
    assert.deepEqual(await s.findCreatedByExternalRef('jira:PROJ-1'), { integrity: 'invalid' });
  });
});

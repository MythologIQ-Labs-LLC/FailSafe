// #532 (plan-532c LD5/LD10): the intent decision, replayed read-only from the hash-chained
// intent history. PASS ("approved for implementation") or VETO sets it; a later status change to
// anything else clears it; replay stops at the seal; another intent's entries never count. The
// chain is plain unkeyed SHA-256 and the actor is free text, so a writer that recomputes the chain
// can append a decision under any actor: the decision is a record, not proof of who wrote it.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IntentService, replayIntentDecision } from '../../governance/IntentService';
import { SessionManager } from '../../governance/SessionManager';
import { IntentHistoryLog } from '../../governance/IntentHistoryLog';
import type { IntentHistoryEntry } from '../../governance/types/IntentTypes';

const params = () => ({
  type: 'feature' as const, purpose: 'Deliver PROJ-1', scope: { files: [], modules: [], riskGrade: 'L1' as const },
  metadata: { author: 'user', tags: [], externalRef: 'jira:PROJ-1' },
  provenance: { externalRef: 'jira:PROJ-1', contentSha256: 'c'.repeat(64) },
});

suite('IntentService intent decision (#532 plan-532c LD5)', () => {
  let root: string;
  let manifest: string;
  setup(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-decisions-')));
    manifest = path.join(root, '.failsafe', 'manifest');
  });
  teardown(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));

  const svc = () => new IntentService(root, new SessionManager(root));
  const history = () => new IntentHistoryLog(manifest);
  const historyFile = () => path.join(manifest, 'intent_history.jsonl');
  const lines = (): IntentHistoryEntry[] => fs.readFileSync(historyFile(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  async function decisionOf(s: IntentService, id: string) {
    const lookup = await s.getIntentRecord(id);
    assert.equal(lookup.integrity, 'valid');
    return (lookup as { record: { decision: unknown } }).record.decision as
      { status: string; actor: string; timestamp: string; entryHash: string | null } | null;
  }

  test('PASS sets the decision with actor, time and entry hash; VETO replaces it', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    assert.equal(await decisionOf(s, intent.id), null, 'no decision before a status change');
    await s.updateStatus('PASS', 'judge');
    const pass = await decisionOf(s, intent.id);
    const passEntry = lines()[1];
    assert.deepEqual(pass, { status: 'PASS', actor: 'judge', timestamp: passEntry.timestamp, entryHash: passEntry.entryHash });
    await s.updateStatus('VETO', 'auditor');
    assert.equal((await decisionOf(s, intent.id))?.status, 'VETO');
    assert.equal((await decisionOf(s, intent.id))?.actor, 'auditor');
  });

  test('a later status change other than PASS or VETO supersedes the decision', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    await s.updateStatus('PASS', 'judge');
    await s.updateStatus('PULSE', 'user');
    assert.equal(await decisionOf(s, intent.id), null);
    await s.updateStatus('VETO', 'judge');
    await s.updateStatus('PULSE', 'user');
    assert.equal(await decisionOf(s, intent.id), null);
  });

  test("another intent's PASS is never this intent's decision", () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    const entries: IntentHistoryEntry[] = [
      { intentId: a, timestamp: 't1', event: 'CREATED', newStatus: 'PULSE', actor: 'user' },
      { intentId: b, timestamp: 't2', event: 'STATUS_CHANGED', previousStatus: 'PULSE', newStatus: 'PASS', actor: 'judge', entryHash: 'x' },
    ];
    assert.equal(replayIntentDecision(entries, a), null);
    assert.equal(replayIntentDecision(entries, b)?.status, 'PASS');
  });

  test('a decision appended after the seal is ignored by the replay', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    await s.updateStatus('PASS', 'judge');
    await s.sealIntent('user');
    await history().appendEntry({
      intentId: intent.id, timestamp: new Date().toISOString(), event: 'STATUS_CHANGED', previousStatus: 'SEALED', newStatus: 'VETO', actor: 'agent',
    });
    assert.deepEqual(await history().verifyChainIntegrity(), { valid: true });
    const decision = await decisionOf(s, intent.id);
    assert.equal(decision?.status, 'PASS', 'the archived intent keeps the decision it was sealed with');
    assert.equal(decision?.actor, 'judge');
  });

  test('an edited STATUS_CHANGED line reads invalid', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    await s.updateStatus('VETO', 'judge');
    const raw = fs.readFileSync(historyFile(), 'utf8').replace('"newStatus":"VETO"', '"newStatus":"PASS"');
    fs.writeFileSync(historyFile(), raw);
    assert.deepEqual(await s.getIntentRecord(intent.id), { integrity: 'invalid' });
  });

  test('forgeable: a PASS appended with a recomputed chain under another actor reads valid', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    await history().appendEntry({
      intentId: intent.id, timestamp: new Date().toISOString(), event: 'STATUS_CHANGED', previousStatus: 'PULSE', newStatus: 'PASS',
      actor: 'someone-else',
    });
    assert.deepEqual(await history().verifyChainIntegrity(), { valid: true });
    assert.equal((await decisionOf(s, intent.id))?.actor, 'someone-else',
      'the chain cannot tell who wrote an entry; the view says so (DECISION_PROVENANCE_NOTE)');
  });
});

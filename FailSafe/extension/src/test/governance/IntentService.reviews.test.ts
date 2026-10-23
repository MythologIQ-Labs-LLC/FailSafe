// #532 B320 (plan-b320 LD5): the REVIEWED mirror in the intent history.
//
// recordReview appends a REVIEWED entry through the hash-chained history for the active, unsealed
// intent only, with strict details; the record replays the mirrors in history order and stops at
// the seal. Refused: no active intent, a non-active intent, a sealed intent, details the schema
// rejects, and any write while the chain is broken. An edited line makes the history invalid.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IntentService, replayIntentReviews } from '../../governance/IntentService';
import { SessionManager } from '../../governance/SessionManager';
import { IntentHistoryLog } from '../../governance/IntentHistoryLog';
import type { IntentHistoryEntry, IntentReviewDetails } from '../../governance/types/IntentTypes';

const params = () => ({
  type: 'feature' as const, purpose: 'Deliver PROJ-1', scope: { files: [], modules: [], riskGrade: 'L1' as const },
  metadata: { author: 'user', tags: [], externalRef: 'jira:PROJ-1' },
});
const details = (over: Partial<IntentReviewDetails> = {}): IntentReviewDetails => ({
  reviewId: '22222222-2222-4222-8222-222222222222', verdict: 'VETO',
  evaluates: { commitSha: 'a'.repeat(40), tree: 'b'.repeat(40), branch: 'main', edgeEntryHash: 'c'.repeat(64) },
  covers: [{ commitSha: 'a'.repeat(40), edgeEntryHash: 'c'.repeat(64) }], evidenceDigest: 'd'.repeat(64), supersedes: [],
  ledgerEntryId: 5, ledgerEntryHash: 'e'.repeat(64), operationId: 'op_test', ...over,
});

suite('IntentService delivery review mirrors (plan-b320 LD5)', () => {
  let root: string;
  let manifest: string;
  setup(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-reviews-')));
    manifest = path.join(root, '.failsafe', 'manifest');
  });
  teardown(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));

  const svc = () => new IntentService(root, new SessionManager(root));
  const historyFile = () => path.join(manifest, 'intent_history.jsonl');
  const lines = (): IntentHistoryEntry[] => fs.readFileSync(historyFile(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

  test('recordReview appends a REVIEWED entry, the chain verifies, and the record replays it', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    assert.deepEqual(await s.recordReview({ intentId: intent.id, actor: 'user', details: details() }), { ok: true });
    const last = lines().pop()!;
    assert.equal(last.event, 'REVIEWED');
    assert.equal((last.details as { ledgerEntryId: number }).ledgerEntryId, 5);
    assert.deepEqual(await new IntentHistoryLog(manifest).verifyChainIntegrity(), { valid: true });
    const rec = await s.getIntentRecord(intent.id);
    assert.equal(rec.integrity, 'valid');
    const reviews = (rec as { record: { reviews: Array<{ details: unknown; position: number; entryHash: string | null }> } }).record.reviews;
    assert.equal(reviews.length, 1);
    assert.equal((reviews[0].details as { reviewId: string }).reviewId, details().reviewId);
    assert.equal(reviews[0].position, 1);
    assert.equal(reviews[0].entryHash, last.entryHash);
  });

  test('refused with no active intent, for a non-active id, for a sealed intent and for details the schema rejects; nothing is appended', async () => {
    const s = svc();
    assert.deepEqual(await s.recordReview({ intentId: '00000000-0000-4000-8000-000000000000', actor: 'user', details: details() }),
      { ok: false, reason: 'no-active-intent' });
    const intent = await s.createIntent(params());
    assert.deepEqual(await s.recordReview({ intentId: '00000000-0000-4000-8000-000000000000', actor: 'user', details: details() }),
      { ok: false, reason: 'not-active' });
    const before = lines().length;
    for (const bad of [
      { ...details(), verdict: 'MAYBE' }, { ...details(), extra: 1 }, { ...details(), ledgerEntryId: 0 },
      { ...details(), evaluates: { ...details().evaluates, commitSha: 'HEAD' } },
    ]) {
      assert.deepEqual(await s.recordReview({ intentId: intent.id, actor: 'user', details: bad as unknown as IntentReviewDetails }), { ok: false, reason: 'invalid' });
    }
    assert.equal(lines().length, before);
    await s.updateStatus('PASS', 'user');
    await s.sealIntent('user');
    assert.deepEqual(await s.recordReview({ intentId: intent.id, actor: 'user', details: details() }), { ok: false, reason: 'no-active-intent' });
  });

  test('a broken chain refuses the write and the record reads invalid', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    await s.recordReview({ intentId: intent.id, actor: 'user', details: details() });
    const text = fs.readFileSync(historyFile(), 'utf8').replace('"verdict":"VETO"', '"verdict":"PASS"');
    fs.writeFileSync(historyFile(), text);
    assert.deepEqual(await s.recordReview({ intentId: intent.id, actor: 'user', details: details() }), { ok: false, reason: 'integrity' });
    assert.deepEqual(await s.getIntentRecord(intent.id), { integrity: 'invalid' });
  });

  test('replay keeps history order, filters by intent and stops at the seal', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const other = '33333333-3333-4333-8333-333333333333';
    const e = (intentId: string, event: IntentHistoryEntry['event'], d?: Record<string, unknown>): IntentHistoryEntry =>
      ({ intentId, timestamp: 't', event, actor: 'user', ...(d ? { details: d } : {}), entryHash: `${event}-${intentId.slice(0, 2)}` });
    const entries = [
      e(id, 'CREATED'), e(id, 'REVIEWED', { n: 1 }), e(other, 'REVIEWED', { n: 9 }), e(id, 'REVIEWED', { n: 2 }), e(id, 'SEALED'), e(id, 'REVIEWED', { n: 3 }),
    ];
    const out = replayIntentReviews(entries, id);
    assert.deepEqual(out.map((r) => [(r.details as { n: number }).n, r.position]), [[1, 1], [2, 3]]);
  });


  test('B344 (red-first): a mirror carrying reworks is accepted; over 20 entries or a malformed entry is refused and nothing is appended', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    const rework = (over: Record<string, unknown> = {}) => ({
      vetoEntryId: 3, vetoEntryHash: 'f'.repeat(64), vetoCommit: 'b'.repeat(40), reworkCommit: 'a'.repeat(40), relation: 'amended',
      evidence: { vetoParent: '9'.repeat(40), reworkParent: '9'.repeat(40), vetoDiffId: '1'.repeat(64), reworkDiffId: '2'.repeat(64),
        vetoPathCount: 1, reworkPathCount: 1, shared: [{ path: 'a.ts', vetoStatus: 'M', reworkStatus: 'M' }], onlyInVeto: [], onlyInRework: [] },
      ...over,
    });
    const withReworks = (reworks: unknown) => ({ ...details({ verdict: 'PASS' }), reworks }) as unknown as IntentReviewDetails;
    assert.deepEqual(await s.recordReview({ intentId: intent.id, actor: 'user', details: withReworks([rework()]) }), { ok: true });
    const rec = await s.getIntentRecord(intent.id);
    const reviews = (rec as { record: { reviews: Array<{ details: { reworks?: unknown[] } }> } }).record.reviews;
    assert.deepEqual(reviews[0].details.reworks, [rework()]);
    const before = lines().length;
    for (const bad of [
      Array.from({ length: 21 }, (_, i) => rework({ vetoEntryId: i + 1 })), [],
      [rework({ relation: 'squashed' })], [rework({ reworkCommit: 'HEAD' })], [{ ...rework(), extra: 1 }],
      [rework({ evidence: { ...rework().evidence as object, shared: [{ path: 'a.ts', vetoStatus: 'R', reworkStatus: 'M' }] } })],
    ]) {
      assert.deepEqual(await s.recordReview({ intentId: intent.id, actor: 'user', details: withReworks(bad) }), { ok: false, reason: 'invalid' }, JSON.stringify(bad).slice(0, 80));
    }
    assert.equal(lines().length, before);
  });
});

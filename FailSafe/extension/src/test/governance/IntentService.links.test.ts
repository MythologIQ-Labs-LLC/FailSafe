// #532 part B (plan-532b LD2/LD10): delivery edges in the intent history.
//
// linkEdge / unlinkEdge append LINKED / UNLINKED entries through the hash-chained
// history; edges are a replay (LINKED minus a later UNLINKED, as a set, stopping at the
// intent's seal). Refused: no active intent, a sealed or non-active intent, a duplicate
// link, an unlink of an absent edge, and any write while the chain is already broken.
// The chain is plain unkeyed SHA-256: it detects edits that do not recompute it.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IntentService, replayIntentEdges } from '../../governance/IntentService';
import { SessionManager } from '../../governance/SessionManager';
import { IntentHistoryLog } from '../../governance/IntentHistoryLog';
import type { IntentHistoryEntry } from '../../governance/types/IntentTypes';

const SHA = 'a'.repeat(40);
const params = () => ({
  type: 'feature' as const, purpose: 'Deliver PROJ-1', scope: { files: [], modules: [], riskGrade: 'L1' as const },
  metadata: { author: 'user', tags: [], externalRef: 'jira:PROJ-1' },
  provenance: { externalRef: 'jira:PROJ-1', contentSha256: 'c'.repeat(64) },
});
const link = (intentId: string, edge: 'implements' | 'committed-under' = 'implements', target = 'runtime') => ({
  intentId, edge, target, actor: 'user', provenance: { docPath: 'docs/architecture/RUNTIME.md', docSha256: 'd'.repeat(64) },
});

suite('IntentService delivery edges (#532 LD2)', () => {
  let root: string;
  let manifest: string;
  setup(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-links-')));
    manifest = path.join(root, '.failsafe', 'manifest');
  });
  teardown(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));

  const svc = () => new IntentService(root, new SessionManager(root));
  const history = () => new IntentHistoryLog(manifest);
  const lines = (): IntentHistoryEntry[] => fs.readFileSync(path.join(manifest, 'intent_history.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));

  test('link then unlink append LINKED and UNLINKED entries, the chain still verifies, and the replay follows them', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    assert.deepEqual(await s.linkEdge(link(intent.id)), { ok: true });
    assert.deepEqual(await s.linkEdge(link(intent.id, 'committed-under', SHA)), { ok: true });
    const created = lines()[0];
    const linked = lines()[1];
    assert.equal(linked.event, 'LINKED');
    assert.equal((linked.details as { edge: string }).edge, 'implements');
    assert.equal((linked.details as { provenance: Record<string, unknown> }).provenance.intentSourceHash, created.entryHash,
      'the CREATED entry hash is the intent endpoint source hash');
    let edges = await s.getEdges(intent.id);
    assert.equal(edges.integrity, 'valid');
    assert.deepEqual((edges as { edges: Array<{ edge: string; target: string }> }).edges.map((e) => [e.edge, e.target]),
      [['implements', 'runtime'], ['committed-under', SHA]]);
    assert.deepEqual(await s.unlinkEdge({ intentId: intent.id, edge: 'implements', target: 'runtime', actor: 'user' }), { ok: true });
    assert.equal(lines()[3].event, 'UNLINKED');
    edges = await s.getEdges(intent.id);
    assert.deepEqual((edges as { edges: Array<{ edge: string; target: string }> }).edges.map((e) => [e.edge, e.target]),
      [['committed-under', SHA]]);
    assert.deepEqual(await history().verifyChainIntegrity(), { valid: true });
  });

  test('refused with no active intent, for a non-active intent id, and on a SEALED intent; nothing is appended', async () => {
    const s = svc();
    assert.deepEqual(await s.linkEdge(link('00000000-0000-4000-8000-000000000000')), { ok: false, reason: 'no-active-intent' });
    const intent = await s.createIntent(params());
    assert.deepEqual(await s.linkEdge(link('00000000-0000-4000-8000-000000000000')), { ok: false, reason: 'not-active' });
    // A sealed active intent: status SEALED in the store (sealIntent archives and clears it).
    const activePath = path.join(manifest, 'active_intent.json');
    const raw = JSON.parse(fs.readFileSync(activePath, 'utf8'));
    fs.writeFileSync(activePath, JSON.stringify({ ...raw, status: 'SEALED' }));
    const before = lines().length;
    assert.deepEqual(await s.linkEdge(link(intent.id)), { ok: false, reason: 'sealed' });
    assert.equal(lines().length, before);
  });

  test('a duplicate link and an unlink of an absent edge are refused', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    assert.deepEqual(await s.linkEdge(link(intent.id)), { ok: true });
    assert.deepEqual(await s.linkEdge(link(intent.id)), { ok: false, reason: 'duplicate' });
    assert.deepEqual(await s.unlinkEdge({ intentId: intent.id, edge: 'committed-under', target: SHA, actor: 'user' }),
      { ok: false, reason: 'absent' });
    assert.equal(lines().filter((l) => l.event === 'LINKED').length, 1);
  });

  test('an edited LINKED line reads invalid, and links and unlinks are refused while the chain is broken', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    await s.linkEdge(link(intent.id));
    const all = lines();
    (all[1].details as { target: string }).target = 'other-row';
    fs.writeFileSync(path.join(manifest, 'intent_history.jsonl'), all.map((l) => JSON.stringify(l)).join('\n') + '\n');
    assert.deepEqual(await s.getEdges(intent.id), { integrity: 'invalid' });
    assert.deepEqual(await s.getIntentRecord(intent.id), { integrity: 'invalid' });
    assert.deepEqual(await s.listIntents(), { integrity: 'invalid' });
    const before = lines().length;
    assert.deepEqual(await s.linkEdge(link(intent.id, 'committed-under', SHA)), { ok: false, reason: 'integrity' });
    assert.deepEqual(await s.unlinkEdge({ intentId: intent.id, edge: 'implements', target: 'other-row', actor: 'user' }),
      { ok: false, reason: 'integrity' });
    assert.equal(lines().length, before, 'nothing appended to a broken chain');
  });

  test('a LINKED entry after the intent is SEALED is ignored by the replay', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    await s.linkEdge(link(intent.id));
    await s.updateStatus('PASS', 'user');
    await s.sealIntent('user');
    // A writer that recomputes the chain appends a LINKED entry after the seal.
    await history().appendEntry({
      intentId: intent.id, timestamp: new Date().toISOString(), event: 'LINKED', actor: 'agent',
      details: { edge: 'committed-under', target: SHA, provenance: {} },
    });
    assert.deepEqual(await history().verifyChainIntegrity(), { valid: true });
    const record = await s.getIntentRecord(intent.id);
    assert.equal(record.integrity, 'valid');
    const r = (record as { record: { sealed: boolean; active: boolean; edges: Array<{ target: string }> } }).record;
    assert.equal(r.sealed, true);
    assert.equal(r.active, false);
    assert.deepEqual(r.edges.map((e) => e.target), ['runtime']);
  });

  test('concurrent duplicate LINKED entries collapse to one edge (edges are a set)', async () => {
    const s = svc();
    const intent = await s.createIntent(params());
    const entry = {
      intentId: intent.id, timestamp: new Date().toISOString(), event: 'LINKED' as const, actor: 'user',
      details: { edge: 'implements', target: 'runtime', provenance: {} },
    };
    await history().appendEntry(entry);
    await history().appendEntry(entry);
    const edges = replayIntentEdges(lines(), intent.id);
    assert.deepEqual(edges.map((e) => [e.edge, e.target]), [['implements', 'runtime']]);
    // One UNLINKED removes the edge even though two LINKED entries name it.
    assert.deepEqual(await s.unlinkEdge({ intentId: intent.id, edge: 'implements', target: 'runtime', actor: 'user' }), { ok: true });
    assert.deepEqual(replayIntentEdges(lines(), intent.id), []);
  });

  test('listIntents lists the active intent and archived sealed intents from CREATED entries', async () => {
    const s = svc();
    const first = await s.createIntent(params());
    await s.updateStatus('PASS', 'user');
    await s.sealIntent('user');
    const second = await s.createIntent({ ...params(), purpose: 'Deliver PROJ-2' });
    const listing = await s.listIntents();
    assert.equal(listing.integrity, 'valid');
    const intents = (listing as { intents: Array<{ id: string; active: boolean; status: string }> }).intents;
    assert.deepEqual(intents.map((i) => [i.id, i.active, i.status]).sort(),
      [[first.id, false, 'SEALED'], [second.id, true, 'PULSE']].sort());
  });
});

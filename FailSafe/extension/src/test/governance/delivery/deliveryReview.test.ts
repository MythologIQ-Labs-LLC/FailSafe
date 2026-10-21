// #532 B320/B321 (plan-b320-delivery-review LD2/LD6/LD10/LD12): the operator-confirmed delivery
// review against a real temp git repository, a real IntentService and a real SOA ledger
// (ledgerTestKit).
//
// Binding comes from server state; a PASS needs a valid pair (sealed row + matching mirror), a
// covering commit and a current binding. Every VETO, every review record that cannot be validated
// and every ledger continuity break blocks until a later valid PASS names it, and a PASS
// supersedes a VETO only on the same commit or a descendant. Over 200 evidence rows neither hide a
// VETO nor lock out a PASS. Each tamper fails closed first and is then cleared by a PASS that names
// it. Restart rebuilds the same result from disk.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';
import { IntentHistoryLog } from '../../../governance/IntentHistoryLog';
import type { IntentService } from '../../../governance/IntentService';
import type { IntentHistoryEntry } from '../../../governance/types/IntentTypes';
import {
  assessIntentDelivery, prepareDeliveryEdge, writeDeliveryEdge, type DeliveryContext, type DeliveryView,
} from '../../../governance/delivery/deliveryService';
import {
  buildReviewPlan, DELIVERY_REVIEW_DID, LOCAL_OVERSEER_DID, parseReviewRequest, recordDeliveryReview, recordProblem, REVIEW_MAX_AGE_MS,
  walkContinuity, type RecordHooks, type ReviewPlan, type ReviewRequest,
} from '../../../governance/delivery/deliveryReview';
import { makeArchitectureGit, type ArchitectureGit } from '../../../governance/architecture/ArchitectureIndexDiscovery';
import { LedgerManager } from '../../../qorelogic/ledger/LedgerManager';
import { legacyEntryHash, legacyMac, sealV3, type SoaLedgerRow } from '../../../qorelogic/ledger/LedgerSeal';
import { StubSecrets, makeEnv, openLedger, rawRows, type Env } from '../../qorelogic/ledgerTestKit';
import {
  commitAll, deliveryWorkspace, git, importedIntent, intentService, RUNTIME_ROW, type DeliveryWorkspace,
} from './deliveryFixtures';

type Found = Extract<DeliveryView, { found: true }>;
const DAY = 24 * 60 * 60 * 1000;

suite('#532 B320 delivery review (plan-b320 LD12)', () => {
  let ws: DeliveryWorkspace;
  let env: Env;
  let ledger: LedgerManager;
  let service: IntentService;
  let ctx: DeliveryContext;
  let intentId = '';
  let ops = 0;
  const extra: LedgerManager[] = [];

  setup(async () => {
    ws = deliveryWorkspace('failsafe-delivery-review-');
    env = makeEnv();
    ledger = await openLedger(env);
    service = intentService(ws.root);
    ctx = { workspaceRoot: ws.root, intents: service, ledger };
    intentId = (await importedIntent(service)).id;
  });
  teardown(() => {
    for (const l of extra.splice(0)) { try { l.close(); } catch { /* closed */ } }
    try { ledger.close(); } catch { /* closed */ }
    env.cleanup();
    ws.cleanup();
  });

  // ------------------------------------------------------------------ helpers

  async function linkEdge(edge: 'implements' | 'committed-under', target: string, action: 'link' | 'unlink' = 'link'): Promise<void> {
    const prepared = await prepareDeliveryEdge(ctx, action, { intentId, edge, target });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.deepEqual(await writeDeliveryEdge(ctx, prepared as Extract<typeof prepared, { ok: true }>, 'user'), { ok: true });
  }
  async function evidence(n = 1): Promise<void> {
    for (let i = 0; i < n; i++) {
      await ledger.appendEntry({ eventType: 'PROVENANCE_RECORDED', agentDid: 'did:myth:agent:claude', artifactPath: `f${i}.ts`, payload: { intentId, agentType: 'claude', confidence: 'low' } });
    }
  }
  /** Every other step recorded: the document and HEAD linked, one evidence row. */
  async function readyDelivery(): Promise<void> {
    await linkEdge('implements', RUNTIME_ROW);
    await linkEdge('committed-under', ws.head);
    await evidence();
  }
  const request = (verdict: 'PASS' | 'VETO', commitSha: string, note = ''): ReviewRequest => ({ intentId, verdict, commitSha, note });
  async function plan(verdict: 'PASS' | 'VETO', sha: string, c: DeliveryContext = ctx): Promise<ReviewPlan> {
    const built = await buildReviewPlan(c, { ...request(verdict, sha), intentId });
    assert.equal(built.ok, true, JSON.stringify(built));
    return (built as { plan: ReviewPlan }).plan;
  }
  async function record(verdict: 'PASS' | 'VETO', sha: string, opts: { c?: DeliveryContext; hooks?: RecordHooks; note?: string } = {}) {
    const c = opts.c ?? ctx;
    const req = request(verdict, sha, opts.note ?? '');
    const built = await buildReviewPlan(c, req);
    if (!built.ok) return { status: built.status, body: { ok: false, error: built.error } as Record<string, unknown> };
    ops += 1;
    return recordDeliveryReview(c, req, built.plan, { operationId: `op_test-${ops}`, channel: 'console' }, opts.hooks);
  }
  async function recorded(verdict: 'PASS' | 'VETO', sha: string, opts: { c?: DeliveryContext; hooks?: RecordHooks; note?: string } = {}) {
    const out = await record(verdict, sha, opts);
    assert.equal(out.status, 200, JSON.stringify(out.body));
    return out.body as { reviewId: string; ledgerEntryId: number; ledgerEntryHash: string; supersedes: Array<{ kind: string; id: number; hash: string }> };
  }
  async function view(c: DeliveryContext = ctx): Promise<Found> {
    const v = await assessIntentDelivery(c, intentId);
    assert.equal(v.integrity, 'valid', JSON.stringify(v));
    return v as Found;
  }
  const reviewOf = (v: Found) => v.assessment.steps.find((s) => s.key === 'review')!;
  const blockingKinds = (v: Found): string[] => reviewOf(v).records.filter((r) => r.record === 'blocking').map((r) => String(r.kind)).sort();
  const historyPath = (): string => path.join(ws.root, '.failsafe', 'manifest', 'intent_history.jsonl');
  const historyLines = (): IntentHistoryEntry[] => fs.readFileSync(historyPath(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const reviewRows = (l: LedgerManager = ledger): SoaLedgerRow[] => rawRows(l).filter((r) => r.event_type === 'DELIVERY_REVIEWED');
  const secret = (): string => env.secrets.map.get('ledgerSecret')!;
  const db = () => ledger.getDatabase();

  /** Rewrite the intent history and recompute the unkeyed chain (a writer that recomputes it). */
  function rewriteHistory(fn: (entries: IntentHistoryEntry[]) => IntentHistoryEntry[]): void {
    const log = new IntentHistoryLog(path.join(ws.root, '.failsafe', 'manifest'));
    let prev = '0'.repeat(64);
    const out = fn(historyLines()).map((e) => {
      const base = { ...e, previousHash: prev };
      delete (base as { entryHash?: string }).entryHash;
      const entryHash = log.computeEntryHash(base);
      prev = entryHash;
      return { ...base, entryHash };
    });
    fs.writeFileSync(historyPath(), out.map((e) => JSON.stringify(e)).join('\n') + '\n');
  }
  /** Update one row's columns and re-seal it under the live secret (a same-user writer). */
  function resealRow(id: number, set: Partial<SoaLedgerRow>): void {
    const row = { ...(db().prepare('SELECT * FROM soa_ledger WHERE id = ?').get(id) as SoaLedgerRow), ...set };
    const seal = sealV3(row, secret());
    const cols = Object.keys(set);
    db().prepare(`UPDATE soa_ledger SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, entry_hash = @eh, signature = @sig WHERE id = @id`)
      .run({ ...set, eh: seal.entryHash, sig: seal.signature, id });
  }
  /** Append a DELIVERY_REVIEWED row directly (no mirror, no dialog): the payload a writer with the secret could forge. */
  async function forgeRow(verdict: 'PASS' | 'VETO', sha: string, over: { payload?: (p: Record<string, unknown>) => void; overseerDid?: string; agentDid?: string } = {}) {
    const p = await plan(verdict, sha);
    const payload: Record<string, unknown> = {
      reviewId: crypto.randomUUID(), intentId, verdict, binding: p.binding, supersedes: p.supersedes, note: '', operationId: 'op_forged',
      authentication: { method: 'vscode-modal-confirmation', channel: 'console:/api/actions/delivery/review', proves: 'x' },
    };
    over.payload?.(payload);
    return ledger.appendEntry({
      eventType: 'DELIVERY_REVIEWED', agentDid: over.agentDid ?? DELIVERY_REVIEW_DID, overseerDid: over.overseerDid ?? LOCAL_OVERSEER_DID, overseerDecision: verdict,
      verificationMethod: 'operator-delivery-review', verificationResult: verdict, artifactHash: p.binding.evaluates.tree, payload,
    });
  }
  async function reopen(secrets: StubSecrets = env.secrets): Promise<void> {
    ledger.close();
    ledger = await openLedger(env, { secrets });
    ctx = { ...ctx, ledger };
  }
  const branchName = (): string => git(ws.root, 'symbolic-ref', '--short', 'HEAD');

  // ------------------------------------------------------------------ binding

  test('the binding comes from server state; request trees, digests and supersedes are ignored', async () => {
    await readyDelivery();
    const parsed = parseReviewRequest({ intentId, verdict: 'PASS', commitSha: ws.head, note: 'ok', tree: 'f'.repeat(40), evidenceDigest: 'e'.repeat(64), supersedes: [{ kind: 'veto', id: 1, hash: 'x' }] });
    assert.equal(typeof parsed, 'object');
    assert.deepEqual(Object.keys(parsed as object).sort(), ['commitSha', 'intentId', 'note', 'verdict']);
    const p = await plan('PASS', ws.head);
    assert.equal(p.binding.evaluates.tree, git(ws.root, 'rev-parse', `${ws.head}^{tree}`));
    assert.equal(p.binding.evidenceCount, 1);
    assert.match(p.binding.evidenceDigest, /^[0-9a-f]{64}$/);
    assert.deepEqual(p.supersedes, []);
    assert.equal(p.binding.intentCreatedEntryHash, historyLines()[0].entryHash);
    assert.deepEqual(p.binding.covers.map((c) => c.commitSha), [ws.head]);
  });

  test('refusals before any dialog: unlinked commit, tree mismatch, an older commit, a VETO on a non-ancestor', async () => {
    await readyDelivery();
    const unlinked = await buildReviewPlan(ctx, request('PASS', 'a'.repeat(40)));
    assert.equal((unlinked as { status: number }).status, 400);
    // An older commit: B is linked and descends from A (HEAD); a PASS on A does not contain B.
    fs.writeFileSync(path.join(ws.root, 'b.txt'), 'b\n');
    const b = commitAll(ws.root, 'b');
    await linkEdge('committed-under', b);
    const older = await buildReviewPlan(ctx, request('PASS', ws.head));
    assert.equal((older as { status: number }).status, 409);
    assert.match((older as { error: string }).error, new RegExp(b));
    assert.equal((await buildReviewPlan(ctx, request('PASS', b))).ok, true);
    // Tree mismatch: git replace makes B resolve to another tree than the one recorded at link time.
    git(ws.root, 'checkout', '-q', '-b', 'other', ws.head);
    fs.writeFileSync(path.join(ws.root, 'c.txt'), 'c\n');
    const c = commitAll(ws.root, 'c');
    git(ws.root, 'replace', b, c);
    const replaced = await buildReviewPlan(ctx, request('PASS', b));
    assert.equal((replaced as { status: number }).status, 409);
    assert.match((replaced as { error: string }).error, /tree/);
  });

  // ------------------------------------------------------------------ the positive path and currency

  test('positive path: awaiting review, then a PASS makes the delivery evidence complete except the receipt', async () => {
    await readyDelivery();
    let v = await view();
    assert.equal(v.assessment.overall, 'awaiting-review');
    assert.equal(reviewOf(v).status, 'missing');
    assert.equal(v.assessment.completeReachable, true);
    const r = await recorded('PASS', ws.head, { note: 'looks right' });
    assert.equal(reviewRows().length, 1);
    assert.equal(historyLines().filter((e) => e.event === 'REVIEWED').length, 1);
    v = await view();
    assert.equal(reviewOf(v).status, 'passing', reviewOf(v).reason);
    assert.equal(v.assessment.overall, 'evidence-complete-except-receipt');
    assert.equal(v.assessment.steps.find((s) => s.key === 'receipt')!.status, 'unavailable');
    const rec = reviewOf(v).records.find((x) => x.record === 'review')!;
    assert.equal(rec.reviewId, r.reviewId);
    assert.equal(rec.entryId, r.ledgerEntryId);
    assert.equal(rec.reviewerDid, LOCAL_OVERSEER_DID);
    assert.match(String(rec.proves), /does not identify/);
    assert.equal(rec.current, true);
  });

  test('reviewIds are random and unique; the mirror names its row by id and entry hash', async () => {
    await readyDelivery();
    const a = await recorded('PASS', ws.head);
    await evidence();
    const b = await recorded('PASS', ws.head);
    assert.notEqual(a.reviewId, b.reviewId);
    assert.match(a.reviewId, /^[0-9a-f-]{36}$/);
    const mirrors = historyLines().filter((e) => e.event === 'REVIEWED').map((e) => e.details as Record<string, unknown>);
    assert.deepEqual(mirrors.map((m) => [m.ledgerEntryId, m.ledgerEntryHash]), [[a.ledgerEntryId, a.ledgerEntryHash], [b.ledgerEntryId, b.ledgerEntryHash]]);
  });

  test('currency: a new linked commit, an unlink, new evidence and a replaced tree each make the PASS stale', async () => {
    await readyDelivery();
    await recorded('PASS', ws.head);
    assert.equal(reviewOf(await view()).status, 'passing');
    await evidence();
    let v = await view();
    assert.equal(reviewOf(v).status, 'stale');
    assert.match(reviewOf(v).reason, /new governance evidence/);
    assert.equal(v.assessment.overall, 'awaiting-review');
    await recorded('PASS', ws.head);
    fs.writeFileSync(path.join(ws.root, 'b.txt'), 'b\n');
    const b = commitAll(ws.root, 'b');
    await linkEdge('committed-under', b);
    v = await view();
    assert.equal(reviewOf(v).status, 'stale', 'a link made after the review is caught at read time');
    assert.match(reviewOf(v).reason, /linked commits changed/);
    await linkEdge('committed-under', b, 'unlink');
    assert.equal(reviewOf(await view()).status, 'passing', 'the covered set is back to what the PASS covered');
    await linkEdge('committed-under', ws.head, 'unlink');
    assert.equal(reviewOf(await view()).status, 'stale', 'an unlink after the review is caught at read time');
    await linkEdge('committed-under', ws.head);
    v = await view();
    assert.equal(reviewOf(v).status, 'stale', 'a relink is a new edge entry, so the PASS no longer covers it');
    await recorded('PASS', ws.head);
    git(ws.root, 'checkout', '-q', '-b', 'other', ws.head);
    fs.writeFileSync(path.join(ws.root, 'c.txt'), 'c\n');
    git(ws.root, 'replace', ws.head, commitAll(ws.root, 'c'));
    v = await view();
    assert.equal(reviewOf(v).status, 'stale');
    assert.match(reviewOf(v).reason, /different tree/);
    assert.equal(v.assessment.steps.find((s) => s.key === 'code')!.status, 'stale', 'LD8: the code step compares trees too');
  });

  test('expiry from the sealed timestamp: 29 days and exactly 30 days current, 30 days + 1 ms and 31 days stale, future stale', async () => {
    await readyDelivery();
    const r = await recorded('PASS', ws.head);
    const sealedAt = Date.parse(rawRows(ledger).find((x) => x.id === r.ledgerEntryId)!.timestamp);
    const at = async (offset: number) => reviewOf(await view({ ...ctx, now: () => sealedAt + offset })).status;
    assert.equal(await at(29 * DAY), 'passing');
    assert.equal(await at(REVIEW_MAX_AGE_MS), 'passing');
    assert.equal(await at(REVIEW_MAX_AGE_MS + 1), 'stale');
    assert.equal(await at(31 * DAY), 'stale');
    assert.equal(await at(-1), 'stale', 'a review dated in the future is stale');
    assert.match(reviewOf(await view({ ...ctx, now: () => sealedAt + 31 * DAY })).reason, /more than 30 days/);
  });

  // ------------------------------------------------------------------ VETO and supersession ancestry

  test('a VETO blocks; it is not cleared by a status change, by time, or by a PASS that does not name it', async () => {
    await readyDelivery();
    const veto = await recorded('VETO', ws.head, { note: 'missing tests' });
    let v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.match(reviewOf(v).reason, /^Rejected by review: VETO/);
    assert.equal(v.assessment.overall, 'failing');
    await service.updateStatus('PULSE', 'user');
    assert.equal(reviewOf(await view()).status, 'failing', 'a status change does not clear a review VETO');
    assert.equal(reviewOf(await view({ ...ctx, now: () => Date.now() + 90 * DAY })).status, 'failing', 'time does not clear it');
    // A PASS whose supersedes does not name the VETO (a forged row + mirror pair) does not clear it.
    const forged = await forgeRow('PASS', ws.head, { payload: (p) => { p.supersedes = []; } });
    rewriteHistory((es) => [...es, {
      intentId, timestamp: new Date().toISOString(), event: 'REVIEWED', actor: 'user',
      details: (() => { const pl = JSON.parse(String(rawRows(ledger).find((x) => x.id === forged.id)!.payload)); return {
        reviewId: pl.reviewId, verdict: 'PASS', evaluates: pl.binding.evaluates, covers: pl.binding.covers, evidenceDigest: pl.binding.evidenceDigest,
        supersedes: [], ledgerEntryId: forged.id, ledgerEntryHash: forged.entryHash, operationId: pl.operationId }; })(),
    } as IntentHistoryEntry]);
    v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.deepEqual(blockingKinds(v), ['veto']);
    // A PASS that names it clears it.
    const pass = await recorded('PASS', ws.head);
    assert.deepEqual(pass.supersedes.map((s) => [s.kind, s.id]), [['veto', veto.ledgerEntryId]]);
    v = await view();
    assert.equal(reviewOf(v).status, 'passing', reviewOf(v).reason);
    assert.ok(reviewOf(v).records.some((x) => x.record === 'cleared' && x.id === veto.ledgerEntryId));
  });

  test('supersession ancestry: a PASS supersedes a VETO only on the reviewed commit or one of its ancestors', async () => {
    await readyDelivery();
    const a = ws.head;
    const main = branchName();
    await recorded('VETO', a);
    fs.writeFileSync(path.join(ws.root, 'b.txt'), 'b\n');
    const b = commitAll(ws.root, 'b');
    await linkEdge('committed-under', b);
    // Descendant: the dialog names the VETO with its commit as an ancestor of the reviewed commit.
    const p = await plan('PASS', b);
    assert.equal(p.superseded.length, 1);
    assert.equal(p.superseded[0].commitSha, a);
    assert.equal(p.superseded[0].commitTrusted, true);
    const { deliveryReviewRequest } = await import('../../../extension/operatorConfirmation');
    assert.match(deliveryReviewRequest(p, 'op_x', 'console').detail, new RegExp(`on ${a} \\(an ancestor of the reviewed commit\\)`));
    await recorded('PASS', b);
    assert.equal(reviewOf(await view()).status, 'passing');
    // A VETO on B, then a PASS on A (an older commit): refused, the VETO stands.
    await recorded('VETO', b);
    await linkEdge('committed-under', b, 'unlink');
    const older = await record('PASS', a);
    assert.equal(older.status, 409, JSON.stringify(older.body));
    assert.match(String(older.body.error), new RegExp(`VETO in ledger entry #\\d+ is on ${b}`));
    // A sibling C of B (child of A): refused, the VETO stands.
    git(ws.root, 'checkout', '-q', '-b', 'side', a);
    fs.writeFileSync(path.join(ws.root, 'c.txt'), 'c\n');
    const c = commitAll(ws.root, 'c');
    await linkEdge('committed-under', c);
    const sibling = await record('PASS', c);
    assert.equal(sibling.status, 409);
    const before = reviewRows().length;
    assert.equal(reviewOf(await view()).status, 'failing');
    assert.equal(reviewRows().length, before, 'nothing was written');
    git(ws.root, 'checkout', '-q', main);
  });

  test('a VETO on a commit that is rewritten away cannot be superseded (B344): every PASS is refused', async () => {
    await linkEdge('implements', RUNTIME_ROW);
    fs.writeFileSync(path.join(ws.root, 'b.txt'), 'b\n');
    const b = commitAll(ws.root, 'b');
    await linkEdge('committed-under', b);
    await evidence();
    await recorded('VETO', b);
    git(ws.root, '-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=',
      'commit', '-q', '--amend', '-m', 'b amended');
    const amended = git(ws.root, 'rev-parse', 'HEAD');
    await linkEdge('committed-under', b, 'unlink');
    await linkEdge('committed-under', amended);
    git(ws.root, 'reflog', 'expire', '--expire=now', '--all');
    git(ws.root, 'gc', '-q', '--prune=now');
    assert.notEqual(git(ws.root, 'cat-file', '-t', amended), '');
    const out = await record('PASS', amended);
    assert.equal(out.status, 409, JSON.stringify(out.body));
    assert.equal(reviewOf(await view()).status, 'failing');
  });

  test('ancestry is re-checked on every read: a git that now says "not an ancestor" makes the superseded VETO stand again', async () => {
    await readyDelivery();
    await recorded('VETO', ws.head);
    fs.writeFileSync(path.join(ws.root, 'b.txt'), 'b\n');
    const b = commitAll(ws.root, 'b');
    await linkEdge('committed-under', b);
    await recorded('PASS', b);
    assert.equal(reviewOf(await view()).status, 'passing');
    const real = makeArchitectureGit();
    const lying: ArchitectureGit = (root, args) => (args[0] === 'merge-base' ? { kind: 'exit', status: 1, stderr: '' } : real(root, args));
    const v = await view({ ...ctx, git: lying });
    assert.equal(reviewOf(v).status, 'failing');
    assert.deepEqual(blockingKinds(v), ['veto']);
    const broken: ArchitectureGit = (root, args) => (args[0] === 'merge-base' ? { kind: 'exit', status: 128, stderr: 'fatal' } : real(root, args));
    const u = await view({ ...ctx, git: broken });
    assert.equal(reviewOf(u).status, 'unavailable', 'a merge-base exit other than 0 or 1 is unavailable, never "not an ancestor"');
    assert.deepEqual(u.assessment.completeBlockedBy, ['git-unavailable']);
  });

  test('only a trusted (sealed-valid) VETO is held to ancestry; an unverifiable record is "recorded, unverified" and any later PASS naming it clears it', async () => {
    await readyDelivery();
    fs.writeFileSync(path.join(ws.root, 'b.txt'), 'b\n');
    const b = commitAll(ws.root, 'b');
    await linkEdge('committed-under', b);
    const veto = await recorded('VETO', b);
    // Make the VETO unverifiable: its row names an unknown overseer (re-sealed, so the seal holds and the identity check fails).
    resealRow(veto.ledgerEntryId, { overseer_did: 'did:someone:else' });
    await linkEdge('committed-under', b, 'unlink');
    const v = await view();
    const blocking = reviewOf(v).records.filter((x) => x.record === 'blocking');
    assert.ok(blocking.some((x) => x.kind === 'unverifiable-row' && x.commitSha === b && x.commitState === 'recorded, unverified'), JSON.stringify(blocking));
    // A PASS on the older commit A is not held to ancestry against B: B's claim cannot be trusted.
    const p = await plan('PASS', ws.head);
    assert.ok(p.superseded.length >= 1);
    assert.ok(p.superseded.every((s) => !s.commitTrusted), 'no superseded item here is a trusted VETO');
    const { deliveryReviewRequest } = await import('../../../extension/operatorConfirmation');
    assert.match(deliveryReviewRequest(p, 'op_x', 'console').detail, new RegExp(`commit ${b} \\(recorded, unverified\\)`));
    await recorded('PASS', ws.head);
    assert.equal(reviewOf(await view()).status, 'passing');
  });

  // ------------------------------------------------------------------ over 200 rows

  test('over 200 evidence rows: the VETO is still found, a PASS is recordable with evidenceCount 250 and becomes current', async function () {
    this.timeout(60000);
    await linkEdge('implements', RUNTIME_ROW);
    await linkEdge('committed-under', ws.head);
    await evidence(250);
    await recorded('VETO', ws.head);
    let v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.deepEqual(blockingKinds(v), ['veto']);
    const gov = v.assessment.steps.find((s) => s.key === 'governance')!;
    assert.equal(gov.records.length, 200, 'the view lists 200');
    assert.match(gov.reason, /^250 FailSafe ledger entries name this intent/);
    assert.match(gov.reason, /50 more are not/);
    const p = await plan('PASS', ws.head);
    assert.equal(p.binding.evidenceCount, 250);
    await recorded('PASS', ws.head);
    v = await view();
    assert.equal(reviewOf(v).status, 'passing', reviewOf(v).reason);
    assert.equal(v.assessment.overall, 'evidence-complete-except-receipt');
  });

  // ------------------------------------------------------------------ tamper: fail closed, then cleared by a naming PASS

  async function vetoed(): Promise<{ ledgerEntryId: number; ledgerEntryHash: string }> {
    await readyDelivery();
    return recorded('VETO', ws.head);
  }
  async function clearedByPass(): Promise<void> {
    const p = await plan('PASS', ws.head);
    assert.ok(p.supersedes.length > 0, 'the PASS names what blocks');
    await recorded('PASS', ws.head);
    const v = await view();
    assert.equal(reviewOf(v).status, 'passing', reviewOf(v).reason);
  }

  test('(a) a JSON-valid byte flip in a VETO row: its seal fails (blocks every intent), the walk breaks; a naming PASS clears it', async () => {
    const veto = await vetoed();
    db().prepare('UPDATE soa_ledger SET payload = replace(payload, \'"verdict":"VETO"\', \'"verdict":"PASS"\') WHERE id = ?').run(veto.ledgerEntryId);
    assert.ok(String(rawRows(ledger).find((r) => r.id === veto.ledgerEntryId)!.payload).includes('"verdict":"PASS"'));
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.deepEqual(blockingKinds(v), ['bad-seal', 'continuity', 'unverifiable-mirror']);
    // It blocks another intent too: its payload (and its intent id) cannot be trusted.
    await service.updateStatus('PASS', 'user');
    await service.sealIntent('user');
    const otherId = (await importedIntent(service, 'PROJ-9 — other')).id;
    const other = await assessIntentDelivery(ctx, otherId) as Found;
    assert.ok(reviewOf(other).records.some((x) => x.record === 'blocking' && x.kind === 'bad-seal'), 'a bad-seal review row blocks every intent');
  });

  test('(a) a JSON-valid byte flip is cleared by a PASS that names it', async () => {
    const veto = await vetoed();
    db().prepare('UPDATE soa_ledger SET payload = replace(payload, \'"note":""\', \'"note":"x"\') WHERE id = ?').run(veto.ledgerEntryId);
    assert.equal(reviewOf(await view()).status, 'failing');
    await clearedByPass();
  });

  test('(a) a JSON-breaking flip: the tolerant read reports it as a bad-seal item instead of throwing; a naming PASS clears it', async () => {
    const veto = await vetoed();
    db().prepare('UPDATE soa_ledger SET payload = substr(payload, 1, length(payload) - 1) WHERE id = ?').run(veto.ledgerEntryId);
    await assert.rejects(ledger.findEntriesContaining(intentId), 'findEntriesContaining (not used by delivery) throws on a non-JSON payload');
    const sealed = await ledger.getSealedEntriesByType('DELIVERY_REVIEWED');
    assert.equal(sealed.length, 1);
    assert.equal(sealed[0].payload, null);
    assert.equal(sealed[0].seal.code, 'payload-json');
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.ok(blockingKinds(v).includes('bad-seal'));
    await clearedByPass();
  });

  test('(b) the VETO row deleted: its mirror is unverifiable and the walk reports a possible deletion; a naming PASS clears both', async () => {
    const veto = await vetoed();
    await evidence();
    db().prepare('DELETE FROM soa_ledger WHERE id = ?').run(veto.ledgerEntryId);
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.deepEqual(blockingKinds(v), ['continuity', 'unverifiable-mirror']);
    assert.match(String(reviewOf(v).records.find((x) => x.kind === 'continuity')!.label), /possible deletion/);
    await clearedByPass();
  });

  test('(c) a mismatched pair blocks both ways: a VETO row with a PASS mirror, and a PASS row with a VETO mirror', async () => {
    const veto = await vetoed();
    rewriteHistory((es) => es.map((e) => (e.event === 'REVIEWED' ? { ...e, details: { ...e.details, verdict: 'PASS' } } : e)));
    let v = await view();
    assert.equal(reviewOf(v).status, 'failing', 'the VETO row is a sealed-valid VETO outside a valid pair (an orphan VETO)');
    assert.deepEqual(blockingKinds(v), ['veto']);
    assert.match(String(reviewOf(v).records.find((x) => x.kind === 'veto')!.label), /not part of a valid pair/);
    assert.equal(veto.ledgerEntryId > 0, true);
    await clearedByPass();
    // The other way: a PASS row whose mirror says VETO.
    await evidence();
    const pass = await recorded('PASS', ws.head);
    rewriteHistory((es) => es.map((e) => (e.event === 'REVIEWED' && (e.details as { ledgerEntryId?: number }).ledgerEntryId === pass.ledgerEntryId
      ? { ...e, details: { ...e.details, verdict: 'VETO' } } : e)));
    v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.deepEqual(blockingKinds(v), ['unverifiable-mirror']);
    await evidence();
    await clearedByPass();
  });

  test('(d) a regenerated secret: every row is unverifiable and the delivery blocks; a PASS under the new secret naming them clears it', async () => {
    await vetoed();
    await reopen(new StubSecrets());
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.ok(blockingKinds(v).includes('bad-seal'));
    assert.ok(blockingKinds(v).includes('continuity'));
    assert.ok(blockingKinds(v).includes('unverifiable-evidence'), 'evidence rows naming the intent fail their seal too');
    await clearedByPass();
  });

  test('(e) a rotation: the earlier mirrors become "retired by rotation" items that block until a PASS names them', async () => {
    await vetoed();
    await ledger.flushAnchor();
    await ledger.startNewLedger('test');
    await evidence();
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.deepEqual(blockingKinds(v), ['unverifiable-mirror'], 'a verified rotation is not a continuity break');
    assert.match(String(reviewOf(v).records.find((x) => x.record === 'blocking')!.label), /retired by rotation/);
    await clearedByPass();
  });

  test('(e) a rotation after a PASS: the old PASS no longer counts (awaiting review), nothing blocks', async () => {
    await readyDelivery();
    await recorded('PASS', ws.head);
    await ledger.flushAnchor();
    await ledger.startNewLedger('test');
    await evidence();
    const v = await view();
    assert.equal(reviewOf(v).status, 'missing');
    assert.equal(v.assessment.overall, 'awaiting-review');
  });

  test('(f) a mid-range deletion of a non-review row is a continuity break', async () => {
    await readyDelivery();
    await recorded('PASS', ws.head);
    await evidence();
    const middle = rawRows(ledger).filter((r) => r.event_type === 'PROVENANCE_RECORDED').pop()!;
    await recorded('PASS', ws.head);
    db().prepare('DELETE FROM soa_ledger WHERE id = ?').run(middle.id);
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.deepEqual(blockingKinds(v), ['continuity']);
    assert.match(String(reviewOf(v).records.find((x) => x.kind === 'continuity')!.label), new RegExp(`#${middle.id}`));
  });

  test('(g) the head VETO row deleted and the id reused by a new row: the mirror join fails', async () => {
    const veto = await vetoed();
    db().prepare('DELETE FROM soa_ledger WHERE id = ?').run(veto.ledgerEntryId);
    await evidence();
    assert.ok(rawRows(ledger).some((r) => r.id === veto.ledgerEntryId && r.entry_hash !== veto.ledgerEntryHash), 'the id was reused');
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.ok(blockingKinds(v).includes('unverifiable-mirror'));
  });

  test('(h) a rotation whose retired file is gone is a possible deletion, not a rotation', async () => {
    await vetoed();
    await ledger.flushAnchor();
    const { retiredFile } = await ledger.startNewLedger('test');
    fs.rmSync(path.join(path.dirname(env.ledgerPath), retiredFile));
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.ok(blockingKinds(v).includes('continuity'));
    assert.match(String(reviewOf(v).records.find((x) => x.kind === 'continuity')!.label), /no verified rotation/);
  });

  test('(i) a VETO row whose prev_hash is edited and re-sealed under the same secret breaks the link (and its mirror no longer matches)', async () => {
    const veto = await vetoed();
    resealRow(veto.ledgerEntryId, { prev_hash: 'f'.repeat(64) });
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.ok(blockingKinds(v).includes('continuity'));
    assert.ok(blockingKinds(v).includes('unverifiable-mirror'), 'the mirror names the old entry hash: the join is by id and hash');
    assert.ok(blockingKinds(v).includes('veto'), 'the re-sealed row is still a sealed-valid VETO, outside a valid pair');
    assert.match(String(reviewOf(v).records.find((x) => x.kind === 'continuity')!.label), /does not link/);
  });

  test('earlier-PASS variants: a tamper after a valid PASS still blocks', async () => {
    await readyDelivery();
    const pass = await recorded('PASS', ws.head);
    assert.equal(reviewOf(await view()).status, 'passing');
    const provenance = rawRows(ledger).find((r) => r.event_type === 'PROVENANCE_RECORDED')!;
    db().prepare('UPDATE soa_ledger SET artifact_path = ? WHERE id = ?').run('evil.ts', provenance.id);
    let v = await view();
    assert.equal(reviewOf(v).status, 'failing', 'an evidence row whose seal fails is unverifiable evidence');
    assert.ok(blockingKinds(v).includes('unverifiable-evidence'));
    db().prepare('UPDATE soa_ledger SET artifact_path = ? WHERE id = ?').run(provenance.artifact_path, provenance.id);
    assert.equal(reviewOf(await view()).status, 'passing');
    db().prepare('UPDATE soa_ledger SET payload = replace(payload, \'"note":""\', \'"note":"y"\') WHERE id = ?').run(pass.ledgerEntryId);
    v = await view();
    assert.equal(reviewOf(v).status, 'failing', 'the PASS row itself tampered: a bad-seal item, and the PASS no longer counts');
  });

  // ------------------------------------------------------------------ not counted

  test('not counted: a forged PASS mirror with a recomputed chain and no row; a PASS row without a mirror', async () => {
    await readyDelivery();
    const p = await plan('PASS', ws.head);
    rewriteHistory((es) => [...es, {
      intentId, timestamp: new Date().toISOString(), event: 'REVIEWED', actor: 'user',
      details: { reviewId: crypto.randomUUID(), verdict: 'PASS', evaluates: p.binding.evaluates, covers: p.binding.covers, evidenceDigest: p.binding.evidenceDigest,
        supersedes: [], ledgerEntryId: 999, ledgerEntryHash: 'a'.repeat(64), operationId: 'op_forged' },
    } as IntentHistoryEntry]);
    let v = await view();
    assert.equal(reviewOf(v).status, 'failing', 'the forged mirror names a row beyond the head: the walk reports a possible deletion');
    assert.deepEqual(blockingKinds(v), ['continuity']);
    assert.ok(!reviewOf(v).records.some((x) => x.record === 'review'), 'the forged PASS is not a review');
    rewriteHistory((es) => es.filter((e) => e.event !== 'REVIEWED'));
    await forgeRow('PASS', ws.head);
    v = await view();
    assert.equal(reviewOf(v).status, 'missing', 'a PASS row without its mirror counts for nothing and does not block');
  });

  test('not counted and blocking: unverified-loopback, a foreign overseer, another writer and another intent\'s CREATED hash', async () => {
    await readyDelivery();
    await forgeRow('PASS', ws.head, { payload: (p) => { (p.authentication as Record<string, unknown>).method = 'unverified-loopback'; } });
    await forgeRow('PASS', ws.head, { overseerDid: 'did:myth:overseer:remote' });
    await forgeRow('PASS', ws.head, { agentDid: 'did:myth:agent:claude' });
    await forgeRow('PASS', ws.head, { payload: (p) => { (p.binding as Record<string, unknown>).intentCreatedEntryHash = 'b'.repeat(64); } });
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    const labels = reviewOf(v).records.filter((x) => x.record === 'blocking').map((x) => String(x.label));
    assert.equal(labels.length, 4, labels.join('\n'));
    assert.ok(labels.some((l) => /modal VS Code dialog/.test(l)));
    assert.ok(labels.some((l) => /local overseer/.test(l)));
    assert.ok(labels.some((l) => /not written by the delivery review/.test(l)));
    assert.ok(labels.some((l) => /CREATED entry/.test(l)));
  });

  test('v3 only: a review row re-sealed under the legacy v2 format is unverifiable, even though its v2 seal holds', async () => {
    await readyDelivery();
    const pass = await recorded('PASS', ws.head);
    const row = db().prepare('SELECT * FROM soa_ledger WHERE id = ?').get(pass.ledgerEntryId) as SoaLedgerRow;
    const hash = legacyEntryHash(row, 'v2');
    db().prepare('UPDATE soa_ledger SET entry_hash = ?, signature = ? WHERE id = ?').run(hash, `v2:${legacyMac(secret(), hash)}`, row.id);
    const sealed = (await ledger.getSealedEntriesByType('DELIVERY_REVIEWED'))[0];
    assert.deepEqual([sealed.seal.ok, sealed.seal.version], [true, 'v2'], 'the legacy seal itself verifies');
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.ok(reviewOf(v).records.some((x) => x.record === 'blocking' && x.kind === 'unverifiable-row' && /not v3-sealed/.test(String(x.label))));
  });

  test("another intent's reviews neither count nor block", async () => {
    await readyDelivery();
    await recorded('VETO', ws.head);
    await service.updateStatus('PASS', 'user');
    await service.sealIntent('user');
    intentId = (await importedIntent(service, 'PROJ-9 — next')).id;
    await readyDelivery();
    const v = await view();
    assert.equal(reviewOf(v).status, 'missing', reviewOf(v).reason);
    assert.equal(v.assessment.overall, 'awaiting-review');
  });

  test('an orphan VETO row (no mirror) blocks', async () => {
    await readyDelivery();
    await forgeRow('VETO', ws.head);
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    assert.deepEqual(blockingKinds(v), ['veto']);
  });

  // ------------------------------------------------------------------ concurrency, restart, disabled ledger

  test('two windows: a VETO recorded by another window between the rebuild and the append stands afterwards', async () => {
    await readyDelivery();
    const ledger2 = await openLedger(env);
    extra.push(ledger2);
    // Another extension host has its own lock map; a different path spelling gives this one its own lock key.
    const ctx2: DeliveryContext = { workspaceRoot: ws.root + path.sep, intents: intentService(ws.root), ledger: ledger2 };
    let injected = 0;
    const out = await record('PASS', ws.head, {
      hooks: { beforeAppend: async () => { injected = (await recorded('VETO', ws.head, { c: ctx2 })).ledgerEntryId; } },
    });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.ok(injected > 0);
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing', 'the PASS never showed that VETO, so it does not clear it');
    assert.ok(reviewOf(v).records.some((x) => x.record === 'blocking' && x.kind === 'veto' && x.id === injected));
  });

  test('a change while the operator is confirming answers 409 and writes nothing', async () => {
    await readyDelivery();
    const req = request('PASS', ws.head);
    const built = await buildReviewPlan(ctx, req);
    assert.equal(built.ok, true);
    await evidence();
    const out = await recordDeliveryReview(ctx, req, (built as { plan: ReviewPlan }).plan, { operationId: 'op_x', channel: 'console' });
    assert.equal(out.status, 409);
    assert.equal(reviewRows().length, 0);
    assert.equal(historyLines().filter((e) => e.event === 'REVIEWED').length, 0);
  });

  test('restart: reopening the ledger with the same secret and a new IntentService gives the same statuses', async () => {
    await readyDelivery();
    await recorded('VETO', ws.head);
    fs.writeFileSync(path.join(ws.root, 'b.txt'), 'b\n');
    const b = commitAll(ws.root, 'b');
    await linkEdge('committed-under', b);
    await recorded('PASS', b);
    const before = await view();
    await reopen();
    service = intentService(ws.root);
    ctx = { ...ctx, intents: service };
    const after = await view();
    assert.equal(reviewOf(after).status, 'passing');
    assert.deepEqual(after.assessment.steps.map((s) => s.status), before.assessment.steps.map((s) => s.status));
  });

  test('a disabled ledger (a stub entry, id 0) answers 503 and writes no mirror; the step is unavailable without the ledger', async () => {
    await readyDelivery();
    // Each clause of the refusal on its own: an id of 0 with a hash-shaped value, and the stub marker with a real-looking id.
    for (const stubEntry of [{ id: 0, entryHash: 'a'.repeat(64) }, { id: 5, entryHash: 'STUB_DISABLED' }]) {
      const stub = new Proxy(ledger, {
        get: (target, prop) => (prop === 'appendEntry'
          ? async () => ({ ...stubEntry, timestamp: new Date().toISOString() })
          : (typeof (target as unknown as Record<string | symbol, unknown>)[prop] === 'function'
            ? ((target as unknown as Record<string | symbol, (...a: unknown[]) => unknown>)[prop]).bind(target)
            : (target as unknown as Record<string | symbol, unknown>)[prop])),
      });
      const out = await record('PASS', ws.head, { c: { ...ctx, ledger: stub } });
      assert.equal(out.status, 503, JSON.stringify(stubEntry));
      assert.equal(historyLines().filter((e) => e.event === 'REVIEWED').length, 0);
    }
    const v = await view({ ...ctx, ledger: null });
    assert.equal(reviewOf(v).status, 'unavailable');
    assert.equal(v.assessment.completeReachable, false);
    assert.deepEqual(v.assessment.completeBlockedBy, ['ledger-unavailable']);
  });

  // ------------------------------------------------------------------ review folds (review320)

  test('fold 2: a gap cleared by a PASS blocks again when it widens (the break identity includes its row range)', async () => {
    await readyDelivery();
    await recorded('PASS', ws.head);
    await evidence(3);
    const rows = rawRows(ledger).filter((r) => r.event_type === 'PROVENANCE_RECORDED');
    const [a, b] = rows.slice(-3, -1);
    await recorded('PASS', ws.head);
    db().prepare('DELETE FROM soa_ledger WHERE id = ?').run(b.id);
    assert.equal(reviewOf(await view()).status, 'failing');
    await evidence();
    await recorded('PASS', ws.head);
    assert.equal(reviewOf(await view()).status, 'passing', 'the PASS named the gap');
    db().prepare('DELETE FROM soa_ledger WHERE id = ?').run(a.id);
    const v = await view();
    assert.equal(reviewOf(v).status, 'failing', 'the widened gap is a new break');
    assert.deepEqual(blockingKinds(v), ['continuity']);
  });

  test('fold 1: over 10000 unverifiable evidence rows (a regenerated secret) are one item; a PASS still records and clears it', async function () {
    this.timeout(300000);
    await readyDelivery();
    await recorded('VETO', ws.head);
    await evidence(10000);
    await reopen(new StubSecrets());
    let v = await view();
    assert.equal(reviewOf(v).status, 'failing');
    const ev = reviewOf(v).records.filter((x) => x.record === 'blocking' && x.kind === 'unverifiable-evidence');
    assert.equal(ev.length, 1, 'one item for the whole set');
    assert.match(String(ev[0].label), /^Evidence unverifiable: 10001 ledger entries name this intent/);
    const p = await plan('PASS', ws.head);
    assert.ok(p.supersedes.length < 10, JSON.stringify(p.supersedes.map((s) => s.kind)));
    await recorded('PASS', ws.head);
    v = await view();
    assert.equal(reviewOf(v).status, 'passing', reviewOf(v).reason);
  });

  test('fold 1: more linked commits than a review can record is refused before the dialog and nothing is written', async function () {
    this.timeout(300000);
    const tree = git(ws.root, 'rev-parse', `${ws.head}^{tree}`);
    const stream = Array.from({ length: 1001 }, (_, i) => [
      'commit refs/heads/many', `mark :${i + 1}`, `committer T <t@failsafe.invalid> ${1700000000 + i} +0000`, `data ${String(i).length}`, String(i),
      i === 0 ? `from ${ws.head}` : `from :${i}`, '',
    ].join('\n')).join('\n');
    const imported = spawnSync('git', ['fast-import', '--quiet'], { cwd: ws.root, input: stream, encoding: 'utf8', windowsHide: true });
    assert.equal(imported.status, 0, imported.stderr);
    const shas = git(ws.root, 'rev-list', '--reverse', `${ws.head}..many`).split(/\r?\n/);
    assert.equal(shas.length, 1001);
    for (const sha of shas) {
      assert.deepEqual(await service.linkEdge({ intentId, edge: 'committed-under', target: sha, actor: 'user', provenance: { sha, tree, branch: 'many' } }), { ok: true });
    }
    await linkEdge('implements', RUNTIME_ROW);
    await evidence();
    const built = await buildReviewPlan(ctx, request('PASS', shas[shas.length - 1]));
    assert.equal(built.ok, false);
    assert.equal((built as { status: number }).status, 409);
    assert.match((built as { error: string }).error, /cover 1001 linked commits, more than a review can record \(1000\)/);
    assert.equal(reviewRows().length, 0);
  });

  test('fold 1: recordProblem names covers and supersedes overflows and passes a recordable review', async () => {
    await readyDelivery();
    const p = await plan('PASS', ws.head);
    assert.equal(recordProblem(intentId, 'PASS', p.binding, p.supersedes, ''), null);
    const ref = p.binding.covers[0];
    assert.match(String(recordProblem(intentId, 'PASS', { ...p.binding, covers: Array.from({ length: 1001 }, () => ref) }, [], '')), /more than a review can record \(1000\)/);
    const item = { kind: 'bad-seal' as const, id: 1, hash: 'h' };
    assert.match(String(recordProblem(intentId, 'PASS', p.binding, Array.from({ length: 10001 }, () => item), '')), /supersede 10001 items/);
  });

  test('fold 7: each mirror field is compared: changing any one makes the PASS stop counting', async () => {
    await readyDelivery();
    await recorded('PASS', ws.head);
    assert.equal(reviewOf(await view()).status, 'passing');
    const original = historyLines();
    const changes: Array<[string, (d: Record<string, unknown>) => void]> = [
      ['reviewId', (d) => { d.reviewId = crypto.randomUUID(); }],
      ['evidenceDigest', (d) => { d.evidenceDigest = 'f'.repeat(64); }],
      ['covers', (d) => { d.covers = [{ ...(d.covers as Array<Record<string, unknown>>)[0], edgeEntryHash: 'f'.repeat(64) }]; }],
      ['supersedes', (d) => { d.supersedes = [{ kind: 'veto', id: 1, hash: 'x' }]; }],
      ['evaluates', (d) => { d.evaluates = { ...(d.evaluates as Record<string, unknown>), tree: 'f'.repeat(40) }; }],
      ['operationId', (d) => { d.operationId = 'op_other'; }],
      ['verdict', (d) => { d.verdict = 'VETO'; }],
    ];
    for (const [field, change] of changes) {
      rewriteHistory((es) => es.map((e) => {
        if (e.event !== 'REVIEWED') return e;
        const d = { ...(e.details as Record<string, unknown>) };
        change(d);
        return { ...e, details: d };
      }));
      assert.notEqual(reviewOf(await view()).status, 'passing', `a changed ${field} must break the pair`);
      fs.writeFileSync(historyPath(), original.map((e) => JSON.stringify(e)).join('\n') + '\n');
      assert.equal(reviewOf(await view()).status, 'passing', `restored after ${field}`);
    }
  });

  test('fold 7: each row column is checked: decision, result, method and artifact hash', async () => {
    await readyDelivery();
    const pass = await recorded('PASS', ws.head);
    const row = db().prepare('SELECT * FROM soa_ledger WHERE id = ?').get(pass.ledgerEntryId) as SoaLedgerRow;
    const cases: Array<[Partial<SoaLedgerRow>, RegExp]> = [
      [{ overseer_decision: 'VETO' }, /columns disagree with its verdict/],
      [{ verification_result: 'VETO' }, /columns disagree with its verdict/],
      [{ verification_method: 'other' }, /verification method is not the delivery review/],
      [{ artifact_hash: 'f'.repeat(40) }, /artifact hash is not the reviewed tree/],
    ];
    for (const [set, label] of cases) {
      resealRow(row.id, set);
      const v = await view();
      assert.ok(reviewOf(v).records.some((x) => x.record === 'blocking' && x.kind === 'unverifiable-row' && label.test(String(x.label))), JSON.stringify(set));
      resealRow(row.id, { overseer_decision: row.overseer_decision, verification_result: row.verification_result, verification_method: row.verification_method, artifact_hash: row.artifact_hash, prev_hash: row.prev_hash });
    }
  });

  test('walkContinuity: contiguous v3 rows pass; a gap, a broken link and a bad seal are each reported', async () => {
    await readyDelivery();
    await evidence(3);
    const rows = await ledger.getSealedRange(2);
    assert.deepEqual(walkContinuity(3, rows, null).breaks, []);
    const gap = rows.filter((_, i) => i !== 2);
    assert.deepEqual(walkContinuity(3, gap, null).breaks.map((b) => b.code), ['gap']);
    const link = rows.map((r, i) => (i === 2 ? { ...r, row: { ...r.row, prev_hash: '0'.repeat(64) } } : r));
    assert.deepEqual(walkContinuity(3, link, null).breaks.map((b) => b.code), ['prev-link']);
    const seal = rows.map((r, i) => (i === 1 ? { ...r, seal: { ...r.seal, ok: false, code: 'signature-mismatch' as const } } : r));
    assert.deepEqual(walkContinuity(3, seal, null).breaks.map((b) => b.code), ['seal']);
    assert.deepEqual(walkContinuity(3, rows.slice(1), null).breaks.map((b) => b.code), ['missing-range']);
  });
});

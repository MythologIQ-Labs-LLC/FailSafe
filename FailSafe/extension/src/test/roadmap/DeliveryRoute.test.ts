// #532 part B (plan-532b LD7/LD10): delivery routes against a real temp git repository, a real
// IntentService and a real SOA ledger (ledgerTestKit).
//
// Remote callers are refused on every route; a declined, busy or unwired confirmation writes
// nothing; request-supplied hashes are ignored; unknown targets, archived and non-active intents
// are refused; an unavailable ledger makes governance `unavailable`; an intent id that appears only
// in some other payload field is not evidence.
//
// plan-532c (R1-R8): a checkpoint git_head equal to a linked commit is not evidence (B285 retired);
// a PROVENANCE_RECORDED entry naming the intent is presence, so the delivery stays incomplete with
// the review gap; a policy decision is classified with its outcome; an intent PASS is approval for
// implementation and leaves review missing; a later PULSE supersedes it; a VETO makes the delivery
// failing; a Console link records `via: workspace-delivery`.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { setupDeliveryRoutes, type DeliveryRouteDeps } from '../../roadmap/routes/DeliveryRoute';
import type { OperatorActionRequest, OperatorConfirmation } from '../../extension/operatorConfirmation';
import type { IntentService } from '../../governance/IntentService';
import type { LedgerManager } from '../../qorelogic/ledger/LedgerManager';
import { RouteHarness, makeApp, invokeRemote } from '../extension/helpers/routeTestHarness';
import { makeEnv, openLedger, type Env } from '../qorelogic/ledgerTestKit';
import {
  deliveryWorkspace, importedIntent, intentService, RUNTIME_DOC, RUNTIME_ROW, type DeliveryWorkspace,
} from '../governance/delivery/deliveryFixtures';

const sha = (buf: Buffer | string): string => createHash('sha256').update(buf).digest('hex');
const ROUTES: Array<[string, string]> = [
  ['GET', '/api/v1/delivery/intents'], ['GET', '/api/v1/delivery/intents/00000000-0000-4000-8000-000000000000'],
  ['GET', '/api/v1/delivery/candidates'], ['POST', '/api/actions/delivery/link'], ['POST', '/api/actions/delivery/unlink'],
];

interface Setup {
  harness: RouteHarness;
  shown: OperatorActionRequest[];
  service: IntentService;
}

suite('#532 DeliveryRoute', () => {
  let ws: DeliveryWorkspace;
  let env: Env;
  let ledger: LedgerManager | null = null;
  let harness: RouteHarness | null = null;

  setup(async () => {
    ws = deliveryWorkspace('failsafe-delivery-route-');
    env = makeEnv();
    ledger = await openLedger(env);
  });
  teardown(async () => {
    if (harness) await harness.stop();
    harness = null;
    ledger?.close();
    ledger = null;
    env.cleanup();
    ws.cleanup();
  });

  async function start(over: Partial<DeliveryRouteDeps> & { confirmResult?: OperatorConfirmation | 'unwired'; service?: IntentService } = {}): Promise<Setup> {
    const app = makeApp();
    const shown: OperatorActionRequest[] = [];
    const service = over.service ?? intentService(ws.root);
    const result = over.confirmResult ?? 'approved';
    const deps: DeliveryRouteDeps = {
      rejectIfRemote: () => false, // the harness dials 127.0.0.1; the remote path has its own test

      workspaceRoot: ws.root,
      getIntentService: () => service,
      getLedgerManager: () => ledger,
      confirmOperatorAction: result === 'unwired' ? undefined : async (r) => { shown.push(r); return result; },
      ...over,
    };
    setupDeliveryRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();
    return { harness, shown, service };
  }

  const link = (s: Setup, intentId: string, edge: string, target: string, extra: Record<string, unknown> = {}) =>
    s.harness.request({ method: 'POST', path: '/api/actions/delivery/link', body: { intentId, edge, target, ...extra } });
  const historyLines = (): string[] => fs.readFileSync(path.join(ws.root, '.failsafe', 'manifest', 'intent_history.jsonl'), 'utf8').trim().split('\n');

  test('every route refuses a non-loopback caller', async () => {
    const app = makeApp();
    let served = 0;
    setupDeliveryRoutes(app, {
      rejectIfRemote: (_req, res) => { res.status(403).json({ error: 'remote' }); return true; },
      workspaceRoot: ws.root, getIntentService: () => { served += 1; return null; }, getLedgerManager: () => null,
    });
    for (const [method, p] of ROUTES) {
      const out = await invokeRemote(app, method, p);
      assert.equal(out.statusCode, 403, `${method} ${p}`);
    }
    assert.equal(served, 0, 'the remote guard runs before any route work');
  });

  test('no intent service answers 503', async () => {
    const s = await start({ getIntentService: () => null });
    assert.equal((await s.harness.request({ path: '/api/v1/delivery/intents' })).status, 503);
  });

  test('candidates list the registered row and HEAD', async () => {
    const s = await start();
    const res = await s.harness.request({ path: '/api/v1/delivery/candidates' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.architecture.rows.map((r: { id: string }) => r.id), ['architecture-navigation', RUNTIME_ROW]);
    assert.equal(res.body.commits.state, 'ok');
    assert.equal(res.body.commits.commits[0].sha, ws.head);
  });

  test('declined, busy and unwired confirmations write nothing', async () => {
    for (const confirmResult of ['declined', 'busy', 'unwired'] as const) {
      const s = await start({ confirmResult });
      const intent = (await s.service.getActiveIntent()) ?? await importedIntent(s.service);
      const before = historyLines().length;
      const res = await link(s, intent.id, 'implements', RUNTIME_ROW);
      assert.equal(res.status, { declined: 409, busy: 429, unwired: 503 }[confirmResult], confirmResult);
      assert.equal(res.body.confirmation, confirmResult);
      assert.equal(historyLines().length, before, `${confirmResult} appended nothing`);
      await harness!.stop();
      harness = null;
    }
  });

  test('link shows server values in the dialog and ignores request-supplied hashes', async () => {
    const s = await start();
    const intent = await importedIntent(s.service);
    const res = await link(s, intent.id, 'implements', RUNTIME_ROW, { docSha256: 'f'.repeat(64), provenance: { docSha256: 'f'.repeat(64) } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const actual = sha(fs.readFileSync(path.join(ws.root, ...RUNTIME_DOC.split('/'))));
    assert.equal(s.shown.length, 1);
    assert.match(s.shown[0].detail, new RegExp(actual));
    assert.doesNotMatch(s.shown[0].detail, /f{64}/);
    const view = (await s.harness.request({ path: `/api/v1/delivery/intents/${intent.id}` })).body;
    assert.equal(view.edges[0].provenance.docSha256, actual);
    assert.equal(view.edges[0].provenance.sourceSha, ws.head, 'HEAD at link time');
  });

  test('unknown targets are refused: an unregistered row and a commit outside the recent list', async () => {
    const s = await start();
    const intent = await importedIntent(s.service);
    assert.equal((await link(s, intent.id, 'implements', 'no-such-row')).status, 400);
    assert.equal((await link(s, intent.id, 'committed-under', 'e'.repeat(40))).status, 400);
    assert.equal((await link(s, intent.id, 'committed-under', 'HEAD')).status, 400);
    assert.equal((await link(s, 'not-a-uuid', 'implements', RUNTIME_ROW)).status, 400);
    assert.equal(s.shown.length, 0, 'no dialog for a refused request');
  });

  test('archived and non-active intents are refused; an archived intent is still readable', async () => {
    const s = await start();
    const first = await importedIntent(s.service);
    await s.service.updateStatus('PASS', 'user');
    await s.service.sealIntent('user');
    await importedIntent(s.service, 'PROJ-8 — next');
    assert.equal((await link(s, first.id, 'implements', RUNTIME_ROW)).status, 409);
    assert.equal((await link(s, '00000000-0000-4000-8000-000000000000', 'implements', RUNTIME_ROW)).status, 404);
    const unlink = await s.harness.request({ method: 'POST', path: '/api/actions/delivery/unlink', body: { intentId: first.id, edge: 'implements', target: RUNTIME_ROW } });
    assert.equal(unlink.status, 409);
    assert.equal(s.shown.length, 0);
    const listing = await s.harness.request({ path: '/api/v1/delivery/intents' });
    assert.equal(listing.body.intents.length, 2);
    const archived = await s.harness.request({ path: `/api/v1/delivery/intents/${first.id}` });
    assert.equal(archived.status, 200);
    assert.equal(archived.body.linkable, false);
    assert.equal(archived.body.intent.sealed, true);
  });

  test('a ledger that is unavailable makes governance unavailable, never missing', async () => {
    const s = await start({ getLedgerManager: () => null });
    const intent = await importedIntent(s.service);
    const view = (await s.harness.request({ path: `/api/v1/delivery/intents/${intent.id}` })).body;
    assert.equal(view.assessment.steps.find((x: { key: string }) => x.key === 'governance').status, 'unavailable');
  });

  test('an intent id only in another payload field is not evidence', async () => {
    const s = await start();
    const intent = await importedIntent(s.service);
    await ledger!.appendEntry({ eventType: 'SYSTEM_EVENT', agentDid: 'did:test', agentTrustAtAction: 0, payload: { note: intent.id, intent: { id: intent.id } } });
    await ledger!.appendEntry({ eventType: 'PROVENANCE_RECORDED', agentDid: 'did:test', agentTrustAtAction: 0, payload: { intentId: intent.id.slice(0, 8) } });
    const view = (await s.harness.request({ path: `/api/v1/delivery/intents/${intent.id}` })).body;
    assert.equal(view.assessment.steps.find((x: { key: string }) => x.key === 'governance').status, 'missing');
  });

  const stepOf = (a: { steps: Array<{ key: string; status: string; reason: string; records: Array<Record<string, unknown>> }> }, key: string) =>
    a.steps.find((x) => x.key === key)!;
  async function linkedIntent(s: Setup) {
    const intent = await importedIntent(s.service);
    assert.equal((await link(s, intent.id, 'implements', RUNTIME_ROW)).status, 200);
    assert.equal((await link(s, intent.id, 'committed-under', ws.head)).status, 200);
    return intent;
  }
  const assess = async (s: Setup, id: string) => (await s.harness.request({ path: `/api/v1/delivery/intents/${id}` })).body;

  test('R1 (B285): a CHECKPOINT_CREATED whose git_head equals the linked HEAD is not evidence', async () => {
    const s = await start();
    const intent = await linkedIntent(s);
    await ledger!.appendEntry({ eventType: 'CHECKPOINT_CREATED', agentDid: 'did:test', agentTrustAtAction: 0, payload: { git_head: ws.head } });
    const gov = stepOf((await assess(s, intent.id)).assessment, 'governance');
    assert.equal(gov.status, 'missing', JSON.stringify(gov));
    assert.deepEqual(gov.records, []);
  });

  test('R3: GOVERNANCE_PAUSED naming the intent is a policy decision, denied; governance stays recorded', async () => {
    const s = await start();
    const intent = await linkedIntent(s);
    await ledger!.appendEntry({ eventType: 'GOVERNANCE_PAUSED', agentDid: 'did:test', agentTrustAtAction: 0, payload: { intentId: intent.id, action: 'file.write' } });
    await ledger!.appendEntry({ eventType: 'GOVERNANCE_RESUMED', agentDid: 'did:test', agentTrustAtAction: 0, payload: { intentId: intent.id, action: 'file.write' } });
    const gov = stepOf((await assess(s, intent.id)).assessment, 'governance');
    assert.equal(gov.status, 'recorded');
    assert.deepEqual(gov.records.map((r) => [r.eventType, r.kind, r.outcome]),
      [['GOVERNANCE_RESUMED', 'policy-decision', 'allowed'], ['GOVERNANCE_PAUSED', 'policy-decision', 'denied']]);
  });

  test('R4: an intent PASS after the links is approval for implementation; review stays missing, incomplete', async () => {
    const s = await start();
    const intent = await linkedIntent(s);
    await s.service.updateStatus('PASS', 'judge');
    const body = await assess(s, intent.id);
    const review = stepOf(body.assessment, 'review');
    assert.equal(review.status, 'missing');
    assert.match(review.reason, /B320/);
    assert.equal(review.records[0].decision, 'approved for implementation (not a review)');
    assert.equal(body.assessment.overall, 'incomplete');
    assert.equal(body.assessment.completeReachable, false);
    assert.equal(body.intent.decision.status, 'PASS');
    assert.equal(body.intent.decision.actor, 'judge');
    assert.equal(body.intent.createdBy, 'user');
    assert.match(String(body.intent.createdEntryHash), /^[0-9a-f]{64}$/);
  });

  test('R5: PASS then PULSE leaves no decision', async () => {
    const s = await start();
    const intent = await linkedIntent(s);
    await s.service.updateStatus('PASS', 'judge');
    await s.service.updateStatus('PULSE', 'user');
    const body = await assess(s, intent.id);
    assert.equal(body.intent.decision, null);
    assert.deepEqual(stepOf(body.assessment, 'review').records, []);
  });

  test('R6: a VETO makes review failing ("Intent vetoed") and the delivery failing', async () => {
    const s = await start();
    const intent = await linkedIntent(s);
    await s.service.updateStatus('VETO', 'judge');
    const a = (await assess(s, intent.id)).assessment;
    assert.equal(stepOf(a, 'review').status, 'failing');
    assert.match(stepOf(a, 'review').reason, /^Intent vetoed/);
    assert.equal(a.overall, 'failing');
  });

  test('R7: VETO then PULSE is missing again, incomplete', async () => {
    const s = await start();
    const intent = await linkedIntent(s);
    await s.service.updateStatus('VETO', 'judge');
    await s.service.updateStatus('PULSE', 'user');
    const a = (await assess(s, intent.id)).assessment;
    assert.equal(stepOf(a, 'review').status, 'missing');
    assert.equal(a.overall, 'incomplete');
  });

  test('R8: a Console link records via workspace-delivery and the dialog says who made it', async () => {
    const s = await start();
    const intent = await linkedIntent(s);
    const view = await assess(s, intent.id);
    for (const e of view.edges) assert.equal(e.provenance.via, 'workspace-delivery', JSON.stringify(e));
    assert.equal(stepOf(view.assessment, 'code').records[0].via, 'workspace-delivery');
    assert.match(s.shown[0].detail, /Made by: Workspace > Delivery/);
  });

  test('R2: links plus a PROVENANCE_RECORDED entry naming the intent give incomplete with the review gap; recorded is not passed', async () => {
    const s = await start();
    const intent = await importedIntent(s.service);
    assert.equal((await link(s, intent.id, 'implements', RUNTIME_ROW)).status, 200);
    assert.equal((await link(s, intent.id, 'committed-under', ws.head)).status, 200);
    const entry = await ledger!.appendEntry({ eventType: 'PROVENANCE_RECORDED', agentDid: 'did:test', agentTrustAtAction: 0, payload: { intentId: intent.id } });
    const res = await s.harness.request({ path: `/api/v1/delivery/intents/${intent.id}` });
    assert.equal(res.status, 200);
    const a = res.body.assessment;
    assert.equal(a.overall, 'incomplete', JSON.stringify(a.steps.map((x: { key: string; status: string }) => [x.key, x.status])));
    assert.deepEqual(a.gaps, ['review']);
    assert.equal(a.steps.find((x: { key: string }) => x.key === 'governance').status, 'recorded');
    const gov = a.steps.find((x: { key: string }) => x.key === 'governance');
    assert.deepEqual(gov.records.map((r: { entryId: number; eventType: string; chain: string }) => [r.entryId, r.eventType, r.chain]),
      [[entry.id, 'PROVENANCE_RECORDED', 'unknown']]);
    assert.equal(a.steps.find((x: { key: string }) => x.key === 'receipt').status, 'unavailable');
    // Unlink through the route: architecture becomes missing.
    const un = await s.harness.request({ method: 'POST', path: '/api/actions/delivery/unlink', body: { intentId: intent.id, edge: 'implements', target: RUNTIME_ROW } });
    assert.equal(un.status, 200);
    const after = (await s.harness.request({ path: `/api/v1/delivery/intents/${intent.id}` })).body;
    assert.equal(after.assessment.steps.find((x: { key: string }) => x.key === 'architecture').status, 'missing');
  });
});

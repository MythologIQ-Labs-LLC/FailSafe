// #532 B320 (plan-b320 LD3, audit should-fix 4): failsafe.delivery.recordReview.
//
// The command never skips the confirmation: confirm is called exactly once per run, from the
// palette and when called with arguments. Arguments are shown "as requested" with the command-call
// footer; palette picks are shown as "your pick". Declined, busy, unwired and expired write 0 rows
// and 0 mirrors; an approval records the sealed row and its mirror. The command is contributed in
// package.json with its onCommand activation event, and the assessment summary has an
// awaiting-review branch.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  DELIVERY_REVIEW_COMMAND, runDeliveryReviewCommand, type DeliveryReviewCommandDeps, type ReviewCommandUi,
} from '../../extension/deliveryReviewCommand';
import { summarizeDelivery } from '../../extension/deliveryAssessmentCommand';
import {
  COMMAND_CALL_FOOTER, DELIVERY_REVIEW_TITLES, LOOPBACK_FOOTER, type OperatorActionRequest, type OperatorConfirmation,
} from '../../extension/operatorConfirmation';
import { assessIntentDelivery, prepareDeliveryEdge, writeDeliveryEdge, type DeliveryContext, type DeliveryView } from '../../governance/delivery/deliveryService';
import type { IntentService } from '../../governance/IntentService';
import type { LedgerManager } from '../../qorelogic/ledger/LedgerManager';
import { makeEnv, openLedger, rawRows, type Env } from '../qorelogic/ledgerTestKit';
import { deliveryWorkspace, importedIntent, intentService, RUNTIME_ROW, type DeliveryWorkspace } from '../governance/delivery/deliveryFixtures';

suite('#532 B320 failsafe.delivery.recordReview', () => {
  let ws: DeliveryWorkspace;
  let env: Env;
  let ledger: LedgerManager;
  let service: IntentService;
  let intentId = '';

  setup(async () => {
    ws = deliveryWorkspace('failsafe-review-command-');
    env = makeEnv();
    ledger = await openLedger(env);
    service = intentService(ws.root);
    intentId = (await importedIntent(service)).id;
    const ctx: DeliveryContext = { workspaceRoot: ws.root, intents: service, ledger };
    for (const [edge, target] of [['implements', RUNTIME_ROW], ['committed-under', ws.head]] as const) {
      const prepared = await prepareDeliveryEdge(ctx, 'link', { intentId, edge, target });
      assert.equal(prepared.ok, true, JSON.stringify(prepared));
      await writeDeliveryEdge(ctx, prepared as Extract<typeof prepared, { ok: true }>, 'user');
    }
    await ledger.appendEntry({ eventType: 'PROVENANCE_RECORDED', agentDid: 'did:myth:agent:claude', payload: { intentId } });
  });
  teardown(() => { try { ledger.close(); } catch { /* closed */ } env.cleanup(); ws.cleanup(); });

  const rows = () => rawRows(ledger).filter((r) => r.event_type === 'DELIVERY_REVIEWED').length;
  const mirrors = () => fs.readFileSync(path.join(ws.root, '.failsafe', 'manifest', 'intent_history.jsonl'), 'utf8')
    .trim().split('\n').filter((l) => JSON.parse(l).event === 'REVIEWED').length;
  const silentUi = (over: Partial<ReviewCommandUi> = {}): ReviewCommandUi & { infos: string[] } => {
    const infos: string[] = [];
    return {
      infos, pickVerdict: async () => 'PASS', pickCommit: async (c) => c[0]?.sha, inputNote: async () => 'from the palette',
      info: (m) => { infos.push(m); }, ...over,
    };
  };
  function deps(confirm: DeliveryReviewCommandDeps['confirm'], ui = silentUi(), extra: Partial<DeliveryReviewCommandDeps> = {}): DeliveryReviewCommandDeps {
    return { workspaceRoot: ws.root, intents: service, getLedger: () => ledger, confirm, ui, ...extra };
  }
  function counting(answer: OperatorConfirmation | (() => Promise<OperatorConfirmation>)) {
    const shown: OperatorActionRequest[] = [];
    const confirm = async (r: OperatorActionRequest): Promise<OperatorConfirmation> => {
      shown.push(r);
      return typeof answer === 'function' ? answer() : answer;
    };
    return { shown, confirm };
  }

  test('called with arguments: confirm is called exactly once, the values are "as requested" with the command-call footer, and an approval records the row and its mirror', async () => {
    const c = counting('approved');
    const out = await runDeliveryReviewCommand(deps(c.confirm), { verdict: 'PASS', commitSha: ws.head, note: 'looks right' });
    assert.equal(out.outcome, 'recorded', out.detail);
    assert.equal(c.shown.length, 1);
    assert.equal(c.shown[0].title, DELIVERY_REVIEW_TITLES.PASS);
    assert.match(c.shown[0].detail, /Verdict \(as requested\): PASS/);
    assert.match(c.shown[0].detail, /Note \(as requested\): looks right/);
    assert.ok(c.shown[0].detail.endsWith(COMMAND_CALL_FOOTER), c.shown[0].detail);
    assert.ok(!c.shown[0].detail.includes(LOOPBACK_FOOTER));
    assert.equal(rows(), 1);
    assert.equal(mirrors(), 1);
    const row = rawRows(ledger).find((r) => r.id === out.ledgerEntryId)!;
    assert.match(String(row.payload), /"channel":"command:failsafe\.delivery\.recordReview"/);
    const view = await assessIntentDelivery({ workspaceRoot: ws.root, intents: service, ledger }, intentId) as Extract<DeliveryView, { found: true }>;
    assert.equal(view.assessment.overall, 'evidence-complete-except-receipt');
  });

  test('from the palette: the picks are shown as "your pick", without a footer, and confirm is still called exactly once', async () => {
    const c = counting('approved');
    const out = await runDeliveryReviewCommand(deps(c.confirm, silentUi({ pickVerdict: async () => 'VETO' })));
    assert.equal(out.outcome, 'recorded', out.detail);
    assert.equal(c.shown.length, 1);
    assert.equal(c.shown[0].title, DELIVERY_REVIEW_TITLES.VETO);
    assert.match(c.shown[0].detail, /Verdict \(your pick\): VETO/);
    assert.match(c.shown[0].detail, /Note \(your pick\): from the palette/);
    assert.ok(!c.shown[0].detail.includes(COMMAND_CALL_FOOTER));
  });

  test('declined, busy, unwired and expired write 0 rows and 0 mirrors', async () => {
    for (const answer of ['declined', 'busy'] as const) {
      const c = counting(answer);
      const out = await runDeliveryReviewCommand(deps(c.confirm), { verdict: 'PASS', commitSha: ws.head });
      assert.equal(out.outcome, answer);
      assert.equal(c.shown.length, 1, `${answer}: confirm called once`);
    }
    const unwired = await runDeliveryReviewCommand(deps(undefined), { verdict: 'PASS', commitSha: ws.head });
    assert.equal(unwired.outcome, 'unwired');
    let release: () => void = () => undefined;
    const late = counting(async () => { await new Promise<void>((r) => { release = r; }); return 'approved'; });
    const expired = await runDeliveryReviewCommand(deps(late.confirm, silentUi(), { deadlineMs: 30 }), { verdict: 'PASS', commitSha: ws.head });
    assert.equal(expired.outcome, 'expired');
    assert.equal(late.shown.length, 1);
    release();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(rows(), 0);
    assert.equal(mirrors(), 0);
  });

  test('invalid arguments and dismissed prompts never reach the dialog; nothing is written', async () => {
    const c = counting('approved');
    assert.equal((await runDeliveryReviewCommand(deps(c.confirm), { verdict: 'MAYBE', commitSha: ws.head })).outcome, 'invalid');
    assert.equal((await runDeliveryReviewCommand(deps(c.confirm), { verdict: 'PASS', commitSha: 'HEAD' })).outcome, 'invalid');
    assert.equal((await runDeliveryReviewCommand(deps(c.confirm, silentUi({ pickVerdict: async () => undefined })))).outcome, 'dismissed');
    assert.equal((await runDeliveryReviewCommand(deps(c.confirm, silentUi({ inputNote: async () => undefined })))).outcome, 'dismissed');
    assert.equal(c.shown.length, 0);
    assert.equal(rows(), 0);
  });

  test('package.json contributes the command and its onCommand activation event', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
    assert.ok(pkg.contributes.commands.some((c: { command: string; title: string }) =>
      c.command === DELIVERY_REVIEW_COMMAND && c.title === 'FailSafe: Record a Delivery Review'));
    assert.ok(pkg.activationEvents.includes(`onCommand:${DELIVERY_REVIEW_COMMAND}`));
  });

  test('the assessment summary has an awaiting-review branch and names the failing reason', async () => {
    const ctx = { workspaceRoot: ws.root, intents: service, ledger };
    let view = await assessIntentDelivery(ctx, intentId);
    assert.match(summarizeDelivery(view), /is awaiting review: no review PASS is recorded\. Record a PASS or VETO on the newest linked commit \(FailSafe: Record a Delivery Review\)/);
    const c = counting('approved');
    await runDeliveryReviewCommand(deps(c.confirm), { verdict: 'VETO', commitSha: ws.head });
    view = await assessIntentDelivery(ctx, intentId);
    assert.match(summarizeDelivery(view), /is failing: Rejected by review: VETO on/);
    assert.doesNotMatch(summarizeDelivery(view), /not reachable until FailSafe records a review/);
    await service.updateStatus('VETO', 'judge');
    view = await assessIntentDelivery(ctx, intentId);
    assert.match(summarizeDelivery(view), /is failing: Rejected by review/, 'the review VETO is named first');
  });
});

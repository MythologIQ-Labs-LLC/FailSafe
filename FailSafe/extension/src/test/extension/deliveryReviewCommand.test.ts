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
import { commitAll, deliveryWorkspace, git, importedIntent, intentService, RUNTIME_ROW, type DeliveryWorkspace } from '../governance/delivery/deliveryFixtures';

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

// #532 B344 (plan-b344 LD5, red-first): the command with declared reworks.
suite('#532 B344 failsafe.delivery.recordReview with rework', () => {
  let ws: DeliveryWorkspace;
  let env: Env;
  let ledger: LedgerManager;
  let service: IntentService;
  let intentId = '';
  let vetoId = 0;
  let b = '';
  let b2 = '';
  const G = ['-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath='];

  setup(async () => {
    ws = deliveryWorkspace('failsafe-review-rework-command-');
    env = makeEnv();
    ledger = await openLedger(env);
    service = intentService(ws.root);
    intentId = (await importedIntent(service)).id;
    const ctx: DeliveryContext = { workspaceRoot: ws.root, intents: service, ledger };
    const link = async (edge: 'implements' | 'committed-under', target: string, action: 'link' | 'unlink' = 'link') => {
      const prepared = await prepareDeliveryEdge(ctx, action, { intentId, edge, target });
      assert.equal(prepared.ok, true, JSON.stringify(prepared));
      await writeDeliveryEdge(ctx, prepared as Extract<typeof prepared, { ok: true }>, 'user');
    };
    await link('implements', RUNTIME_ROW);
    await link('committed-under', ws.head);
    await ledger.appendEntry({ eventType: 'PROVENANCE_RECORDED', agentDid: 'did:myth:agent:claude', payload: { intentId } });
    fs.writeFileSync(path.join(ws.root, 'w.ts'), 'one\n');
    b = commitAll(ws.root, 'b');
    await link('committed-under', b);
    const veto = await runDeliveryReviewCommand(deps(async () => 'approved'), { verdict: 'VETO', commitSha: b });
    assert.equal(veto.outcome, 'recorded', veto.detail);
    vetoId = veto.ledgerEntryId!;
    fs.writeFileSync(path.join(ws.root, 'w.ts'), 'two\n');
    git(ws.root, ...G, 'commit', '-q', '-a', '--amend', '-m', 'b amended');
    b2 = git(ws.root, 'rev-parse', 'HEAD');
    await link('committed-under', b, 'unlink');
    await link('committed-under', b2);
  });
  teardown(() => { try { ledger.close(); } catch { /* closed */ } env.cleanup(); ws.cleanup(); });

  const rows = () => rawRows(ledger).filter((r) => r.event_type === 'DELIVERY_REVIEWED').length;
  function deps(confirm: DeliveryReviewCommandDeps['confirm'], ui?: Partial<ReviewCommandUi>): DeliveryReviewCommandDeps {
    return {
      workspaceRoot: ws.root, intents: service, getLedger: () => ledger, confirm,
      ui: { pickVerdict: async () => 'PASS', pickCommit: async () => b2, inputNote: async () => '', info: () => undefined, ...ui },
    };
  }

  test('arguments that carry only reworks still count as arguments, are shown "as requested", and confirm is called once', async () => {
    const shown: OperatorActionRequest[] = [];
    const out = await runDeliveryReviewCommand(deps(async (r) => { shown.push(r); return 'approved'; }, { pickVerdict: async () => { throw new Error('the palette must not be used'); } }),
      { reworks: [{ vetoEntryId: vetoId, reworkCommit: b2 }], verdict: 'PASS', commitSha: b2 });
    assert.equal(out.outcome, 'recorded', out.detail);
    assert.equal(shown.length, 1);
    assert.match(shown[0].detail, /Superseded by rework/);
    assert.ok(shown[0].detail.endsWith(COMMAND_CALL_FOOTER));
    const onlyReworks = await runDeliveryReviewCommand(deps(async () => 'approved'), { reworks: [] });
    assert.equal(onlyReworks.outcome, 'invalid', 'an argument object with only reworks is read as arguments (and is invalid), not as a palette run');
  });

  test('from the palette, a non-ancestor VETO asks once for its rework, then confirm is called once; dismissing writes nothing', async () => {
    // Corrected after the red run: the dismissal ran after the clearing PASS, when no VETO was left to ask about.
    const before = rows();
    let dismissAsked = 0;
    const dismissed = await runDeliveryReviewCommand(deps(async () => 'approved', { pickRework: async () => { dismissAsked += 1; return undefined; } }));
    assert.equal(dismissAsked, 1, 'the dismissal row reaches the rework prompt');
    assert.equal(dismissed.outcome, 'dismissed');
    assert.equal(rows(), before, 'nothing written');
    const asked: Array<{ entryId: number; commitSha: string }> = [];
    let confirms = 0;
    const out = await runDeliveryReviewCommand(deps(async () => { confirms += 1; return 'approved'; }, {
      pickRework: async (veto) => { asked.push(veto); return b2; },
    }));
    assert.equal(out.outcome, 'recorded', out.detail);
    assert.deepEqual(asked, [{ entryId: vetoId, commitSha: b }]);
    assert.equal(confirms, 1);
  });
});

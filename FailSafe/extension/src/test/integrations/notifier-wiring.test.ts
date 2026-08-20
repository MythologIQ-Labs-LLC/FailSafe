/**
 * Notifier wiring regression suite (#241 follow-up F-2 + the envelope defect it
 * uncovered).
 *
 * These tests drive a REAL EventBus rather than calling the mappers directly.
 * The mappers were always correct in isolation; the defect lived in the wiring —
 * `EventBus.emit` hands every listener an envelope (`{ type, timestamp, payload,
 * seq }`), and the notifiers passed that envelope where the payload belonged.
 * A unit test that calls `mapGovernanceEvent(type, payload)` directly cannot see
 * that, which is exactly why it went unnoticed.
 */

import { strict as assert } from 'assert';
import { EventBus } from '../../shared/EventBus';
import type { FailSafeEventType } from '../../shared/types/events';
import { SlackNotifier, type SlackDeliveryFailure } from '../../integrations/slack/SlackNotifier';
import { TeamsNotifier, type TeamsDeliveryFailure } from '../../integrations/teams/TeamsNotifier';
import { readEventBusEvent, redactWebhookUrl } from '../../integrations/notify-event';

const SLACK_HOOK = 'https://hooks.slack.com/services/T000/B000/SECRETPATH';
const TEAMS_HOOK = 'https://prod-1.westus.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?sig=SECRETSIG';

/** Flush the notifier's fire-and-forget async handler. No timers, no I/O. */
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await new Promise((res) => setImmediate(res));
}

interface Sent { url: string; body: string }

function slackHarness(status = 200) {
  const sent: Sent[] = [];
  const failures: SlackDeliveryFailure[] = [];
  const bus = new EventBus();
  new SlackNotifier(
    bus,
    () => ({ enabled: true, webhookUrl: SLACK_HOOK }),
    async (url, body) => { sent.push({ url, body }); return { status }; },
    (f) => { failures.push(f); },
  ).register();
  return { bus, sent, failures };
}

function teamsHarness(status = 200) {
  const sent: Sent[] = [];
  const failures: TeamsDeliveryFailure[] = [];
  const bus = new EventBus();
  new TeamsNotifier(
    bus,
    () => ({ enabled: true, webhookUrl: TEAMS_HOOK }),
    async (url, body) => { sent.push({ url, body }); return { status }; },
    (f) => { failures.push(f); },
  ).register();
  return { bus, sent, failures };
}

const VERDICT = {
  id: 'v1', eventId: 'e1', timestamp: '2026-08-20T20:00:00.000Z',
  decision: 'VETO', riskGrade: 'L3', artifactPath: 'src/dangerous.ts',
};

suite('notifier wiring: EventBus envelope → governance notification (#241 F-2)', () => {
  test('Slack: a real emitted VETO verdict is delivered', async () => {
    const { bus, sent } = slackHarness();
    bus.emit('sentinel.verdict' as FailSafeEventType, VERDICT);
    await flush();

    // Regression anchor: reading the envelope instead of the payload left
    // `decision` undefined, the mapper returned null, and NO veto ever sent.
    assert.equal(sent.length, 1, 'a VETO verdict must produce exactly one Slack post');
    assert.equal(sent[0].url, SLACK_HOOK);
    assert.match(sent[0].body, /VETO/);
    assert.match(sent[0].body, /src\/dangerous\.ts/, 'the artifact path must survive the wiring');
  });

  test('Teams: a real emitted VETO verdict is delivered', async () => {
    const { bus, sent } = teamsHarness();
    bus.emit('sentinel.verdict' as FailSafeEventType, VERDICT);
    await flush();
    assert.equal(sent.length, 1);
    assert.match(sent[0].body, /VETO/);
    assert.match(sent[0].body, /src\/dangerous\.ts/);
  });

  test('a non-enforcement verdict still sends nothing', async () => {
    const { bus, sent } = slackHarness();
    bus.emit('sentinel.verdict' as FailSafeEventType, { ...VERDICT, decision: 'PASS' });
    await flush();
    assert.equal(sent.length, 0, 'PASS must not notify');
  });

  test('l3Decided carries the real decision, not the "recorded" fallback', async () => {
    const { bus, sent } = slackHarness();
    bus.emit('qorelogic.l3Decided' as FailSafeEventType, { request: { filePath: 'a.ts' }, decision: 'APPROVED' });
    await flush();
    assert.equal(sent.length, 1);
    assert.match(sent[0].body, /APPROVED/);
    assert.ok(!/recorded/.test(sent[0].body), 'the envelope defect degraded this to "L3 decision: recorded"');
  });

  test('driftDetected carries its summary detail', async () => {
    const { bus, sent } = slackHarness();
    bus.emit('governance.driftDetected' as FailSafeEventType, { summary: 'ledger hash mismatch' });
    await flush();
    assert.equal(sent.length, 1);
    assert.match(sent[0].body, /ledger hash mismatch/);
  });

  test('the envelope timestamp is used when the payload carries none', async () => {
    const { bus, sent } = slackHarness();
    bus.emit('qorelogic.l3Queued' as FailSafeEventType, { filePath: 'b.ts' });
    await flush();
    assert.equal(sent.length, 1);
    // L3ApprovalRequest has no `timestamp`/`ts`; the context line must not go blank.
    assert.match(sent[0].body, /\d{4}-\d{2}-\d{2}T/);
    assert.match(sent[0].body, /b\.ts/);
  });
});

suite('notifier wiring: delivery failures are never silent (#241 F-2)', () => {
  test('Slack: a non-2xx reports the failure with kind and status', async () => {
    const { bus, failures } = slackHarness(404);
    bus.emit('sentinel.verdict' as FailSafeEventType, VERDICT);
    await flush();
    assert.equal(failures.length, 1, 'a dropped VETO alert must leave a trace');
    assert.equal(failures[0].kind, 'veto');
    assert.equal(failures[0].status, 404);
  });

  test('Teams: throttling is reported distinctly', async () => {
    const { bus, failures } = teamsHarness(429);
    bus.emit('governance.driftDetected' as FailSafeEventType, { summary: 's' });
    await flush();
    assert.equal(failures.length, 1);
    assert.equal(failures[0].throttled, true);
    assert.equal(failures[0].status, 429);
  });

  test('a transport throw is reported, not swallowed, and never escapes', async () => {
    const failures: SlackDeliveryFailure[] = [];
    const bus = new EventBus();
    new SlackNotifier(
      bus,
      () => ({ enabled: true, webhookUrl: SLACK_HOOK }),
      async () => { throw new Error('ECONNREFUSED'); },
      (f) => { failures.push(f); },
    ).register();

    bus.emit('sentinel.verdict' as FailSafeEventType, VERDICT);
    await flush();
    assert.equal(failures.length, 1);
    assert.match(failures[0].error ?? '', /ECONNREFUSED/);
  });

  test('a successful send reports no failure', async () => {
    const { bus, failures } = slackHarness(200);
    bus.emit('sentinel.verdict' as FailSafeEventType, VERDICT);
    await flush();
    assert.equal(failures.length, 0);
  });

  test('the webhook URL is never carried into failure diagnostics', async () => {
    const failures: SlackDeliveryFailure[] = [];
    const bus = new EventBus();
    new SlackNotifier(
      bus,
      () => ({ enabled: true, webhookUrl: SLACK_HOOK }),
      async () => { throw new Error(`connect failed for ${SLACK_HOOK}`); },
      (f) => { failures.push(f); },
    ).register();

    bus.emit('sentinel.verdict' as FailSafeEventType, VERDICT);
    await flush();
    assert.equal(failures.length, 1);
    assert.ok(!(failures[0].error ?? '').includes('SECRETPATH'), 'the webhook URL is the channel secret');
    assert.match(failures[0].error ?? '', /\[webhook\]/);
  });

  test('a disabled channel neither sends nor reports', async () => {
    const sent: Sent[] = [];
    const failures: SlackDeliveryFailure[] = [];
    const bus = new EventBus();
    new SlackNotifier(
      bus,
      () => ({ enabled: false, webhookUrl: SLACK_HOOK }),
      async (url, body) => { sent.push({ url, body }); return { status: 500 }; },
      (f) => { failures.push(f); },
    ).register();

    bus.emit('sentinel.verdict' as FailSafeEventType, VERDICT);
    await flush();
    assert.equal(sent.length, 0);
    assert.equal(failures.length, 0, 'default-off must stay quiet, not warn');
  });
});

suite('notify-event helpers', () => {
  test('readEventBusEvent unwraps an envelope and passes a bare value through', () => {
    assert.deepEqual(
      readEventBusEvent({ type: 't', timestamp: '2026-01-01T00:00:00.000Z', payload: { a: 1 }, seq: 3 }),
      { payload: { a: 1 }, timestamp: '2026-01-01T00:00:00.000Z' },
    );
    assert.deepEqual(readEventBusEvent({ a: 1 }), { payload: { a: 1 } });
    assert.deepEqual(readEventBusEvent(undefined), { payload: undefined });
  });

  test('redactWebhookUrl removes every occurrence and tolerates regex-special URLs', () => {
    const url = 'https://h.example/a+b?x=1';
    assert.equal(redactWebhookUrl(`fail ${url} and ${url}`, url), 'fail [webhook] and [webhook]');
    assert.equal(redactWebhookUrl('plain', undefined), 'plain');
    assert.equal(redactWebhookUrl(undefined, url), undefined);
  });
});

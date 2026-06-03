import { strict as assert } from 'assert';
import { buildSlackMessage, type SlackNotifyEvent } from '../../../integrations/slack/slack-notify';
import { sendSlackNotification, type SlackPostFn } from '../../../integrations/slack/slack-sender';
import { mapGovernanceEvent } from '../../../integrations/slack/slack-notify-map';

const HOOK = 'https://hooks.slack.com/services/XXX/YYY/ZZZ';

suite('slack-notify builder (B-INT-9 #100)', () => {
  test('builds header + section + context with the kind label and fallback text', () => {
    const m = buildSlackMessage({ kind: 'veto', title: 'Plan failed audit' });
    assert.equal(m.text, 'VETO: Plan failed audit');
    assert.equal((m.blocks[0] as { type: string }).type, 'header');
    assert.match(JSON.stringify(m.blocks[0]), /VETO/);
    assert.equal((m.blocks[1] as { type: string }).type, 'section');
    assert.equal((m.blocks[2] as { type: string }).type, 'context');
  });

  test('all five kinds produce a distinct labeled header', () => {
    const kinds: SlackNotifyEvent['kind'][] = ['veto', 'l3-queued', 'l3-decided', 'release-seal', 'critical-drift'];
    const labels = kinds.map((k) => JSON.stringify(buildSlackMessage({ kind: k, title: 't' }).blocks[0]));
    assert.equal(new Set(labels).size, 5);
  });

  test('consoleUrl renders a link-back in the context block (no interactive buttons)', () => {
    const m = buildSlackMessage({ kind: 'l3-queued', title: 'Tier-3 action queued', consoleUrl: 'http://127.0.0.1:9376/console/home' });
    assert.match(JSON.stringify(m.blocks[2]), /<http:\/\/127\.0\.0\.1:9376\/console\/home\|Open Command Center>/);
    // notify-only: no `actions` block / interactive elements anywhere.
    assert.ok(!m.blocks.some((b) => (b as { type: string }).type === 'actions'));
  });

  test('privacy: an unused/secret-bearing field on the event never reaches the message', () => {
    const evt = { kind: 'veto', title: 'safe title', detail: 'safe summary', secretToken: 'sk_live_should_not_appear' } as unknown as SlackNotifyEvent;
    const serialized = JSON.stringify(buildSlackMessage(evt));
    assert.ok(!serialized.includes('sk_live_should_not_appear'));
    assert.ok(serialized.includes('safe summary'));
  });
});

suite('slack-sender (B-INT-9 #100)', () => {
  const okPost: SlackPostFn = async () => ({ status: 200 });

  test('posts and returns ok on 2xx; body carries the blocks, url is the webhook', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const post: SlackPostFn = async (url, body) => { calls.push({ url, body }); return { status: 200 }; };
    const r = await sendSlackNotification(HOOK, { kind: 'release-seal', title: 'v9.9.9 sealed' }, post);
    assert.deepEqual(r, { ok: true, status: 200 });
    assert.equal(calls[0].url, HOOK);
    assert.match(calls[0].body, /"blocks"/);
  });

  test('no webhook configured → skipped, no post, no throw', async () => {
    let called = false;
    const post: SlackPostFn = async () => { called = true; return { status: 200 }; };
    const r = await sendSlackNotification('', { kind: 'veto', title: 't' }, post);
    assert.deepEqual(r, { ok: false, skipped: true });
    assert.equal(called, false);
  });

  test('transport throw → non-blocking ok:false with error (never throws)', async () => {
    const post: SlackPostFn = async () => { throw new Error('ECONNREFUSED'); };
    const r = await sendSlackNotification(HOOK, { kind: 'critical-drift', title: 't' }, post);
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /ECONNREFUSED/);
  });

  test('non-2xx → ok:false with status (notify-only, non-fatal)', async () => {
    const post: SlackPostFn = async () => ({ status: 500 });
    const r = await sendSlackNotification(HOOK, { kind: 'l3-decided', title: 't' }, post);
    assert.equal(r.ok, false);
    assert.equal(r.status, 500);
    void okPost;
  });
});

suite('slack-notify-map (B-INT-9 #100)', () => {
  test('sentinel.verdict only notifies on a blocking decision (VETO/BLOCK), not PASS/ESCALATE', () => {
    const veto = mapGovernanceEvent('sentinel.verdict', { decision: 'VETO', artifactPath: 'src/x.ts' });
    assert.equal(veto?.kind, 'veto');
    assert.match(veto!.title, /VETO/);
    assert.match(veto!.detail ?? '', /src\/x\.ts/);
    assert.equal(mapGovernanceEvent('sentinel.verdict', { decision: 'PASS' }), null);
    assert.equal(mapGovernanceEvent('sentinel.verdict', { decision: 'ESCALATE' }), null);
  });

  test('l3Queued / l3Decided / driftDetected map to their kinds', () => {
    assert.equal(mapGovernanceEvent('qorelogic.l3Queued', { filePath: 'a.ts' })?.kind, 'l3-queued');
    assert.equal(mapGovernanceEvent('qorelogic.l3Decided', { decision: 'APPROVED' })?.kind, 'l3-decided');
    assert.match(mapGovernanceEvent('qorelogic.l3Decided', { decision: 'APPROVED' })!.title, /APPROVED/);
    assert.equal(mapGovernanceEvent('governance.driftDetected', { summary: 's' })?.kind, 'critical-drift');
  });

  test('unknown event → null; every mapped event carries the console link-back', () => {
    assert.equal(mapGovernanceEvent('some.other.event', {}), null);
    const e = mapGovernanceEvent('qorelogic.l3Queued', {});
    assert.match(e!.consoleUrl ?? '', /\/console\//);
  });

  test('privacy: a raw/secret payload field is never carried into the mapped event', () => {
    const e = mapGovernanceEvent('governance.driftDetected', { summary: 'safe', rawPrompt: 'SECRET sk_live_x', apiKey: 'whsec_y' });
    const s = JSON.stringify(e);
    assert.ok(!s.includes('sk_live_x'));
    assert.ok(!s.includes('whsec_y'));
    assert.ok(s.includes('safe'));
  });
});

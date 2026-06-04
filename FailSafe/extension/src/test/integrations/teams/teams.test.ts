import { strict as assert } from 'assert';
import { buildTeamsMessage, type TeamsNotifyEvent } from '../../../integrations/teams/teams-notify';
import { sendTeamsNotification, TEAMS_MAX_BYTES, type TeamsPostFn } from '../../../integrations/teams/teams-sender';
import { mapGovernanceEvent } from '../../../integrations/teams/teams-notify-map';

const HOOK = 'https://prod-1.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=XXX';

suite('teams-notify builder (B-INT-10 #101)', () => {
  test('builds the Workflows envelope: message → adaptive card attachment', () => {
    const m = buildTeamsMessage({ kind: 'veto', title: 'Plan failed audit' });
    assert.equal(m.type, 'message');
    assert.equal(m.attachments.length, 1);
    assert.equal(m.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
    assert.equal(m.attachments[0].content.type, 'AdaptiveCard');
    assert.equal(m.attachments[0].content.version, '1.5');
    assert.match(JSON.stringify(m.attachments[0].content), /VETO/);
  });

  test('all five kinds produce a distinct labeled header', () => {
    const kinds: TeamsNotifyEvent['kind'][] = ['veto', 'l3-queued', 'l3-decided', 'release-seal', 'critical-drift'];
    const labels = kinds.map((k) => JSON.stringify(buildTeamsMessage({ kind: k, title: 't' }).attachments[0].content));
    assert.equal(new Set(labels).size, 5);
  });

  test('consoleUrl renders a markdown TEXT link (no action buttons — Workflows cannot render them)', () => {
    const m = buildTeamsMessage({ kind: 'l3-queued', title: 'Tier-3 queued', consoleUrl: 'http://127.0.0.1:9376/console/home' });
    const s = JSON.stringify(m.attachments[0].content);
    assert.match(s, /\[Open Command Center\]\(http:\/\/127\.0\.0\.1:9376\/console\/home\)/);
    // notify-only: no Adaptive Card `actions` / Action.OpenUrl anywhere.
    assert.ok(!s.includes('"actions"'));
    assert.ok(!s.includes('Action.OpenUrl'));
  });

  test('privacy: a secret-bearing field on the event never reaches the card', () => {
    const evt = { kind: 'veto', title: 'safe', detail: 'safe summary', secretToken: 'sk_live_should_not_appear' } as unknown as TeamsNotifyEvent;
    const s = JSON.stringify(buildTeamsMessage(evt));
    assert.ok(!s.includes('sk_live_should_not_appear'));
    assert.ok(s.includes('safe summary'));
  });
});

suite('teams-notify-map (B-INT-10 #101)', () => {
  test('sentinel.verdict notifies only on enforcement (VETO/BLOCK/FAIL/DENY), not PASS/WARN', () => {
    assert.equal(mapGovernanceEvent('sentinel.verdict', { decision: 'PASS' }), null);
    assert.equal(mapGovernanceEvent('sentinel.verdict', { decision: 'WARN' }), null);
    const veto = mapGovernanceEvent('sentinel.verdict', { decision: 'VETO', artifactPath: 'src/auth/login.ts' });
    assert.equal(veto?.kind, 'veto');
    assert.match(veto?.detail ?? '', /src\/auth\/login\.ts/);
  });

  test('maps L3 queued/decided + drift; unknown event → null', () => {
    assert.equal(mapGovernanceEvent('qorelogic.l3Queued', { filePath: 'x' })?.kind, 'l3-queued');
    assert.equal(mapGovernanceEvent('qorelogic.l3Decided', { decision: 'APPROVED' })?.kind, 'l3-decided');
    assert.equal(mapGovernanceEvent('governance.driftDetected', { summary: 's' })?.kind, 'critical-drift');
    assert.equal(mapGovernanceEvent('some.other.event', {}), null);
  });
});

suite('teams-sender (B-INT-10 #101)', () => {
  const okPost: TeamsPostFn = async () => ({ status: 202 });

  test('skips (no throw) when no webhook configured', async () => {
    const r = await sendTeamsNotification(undefined, { kind: 'veto', title: 't' }, okPost);
    assert.equal(r.skipped, true);
    assert.equal(r.ok, false);
  });

  test('2xx → ok; the webhook url is never echoed in the result', async () => {
    const r = await sendTeamsNotification(HOOK, { kind: 'veto', title: 't' }, okPost);
    assert.equal(r.ok, true);
    assert.equal(r.status, 202);
    assert.ok(!JSON.stringify(r).includes('sig=XXX'));
  });

  test('429 → throttled flag (non-throwing)', async () => {
    const r = await sendTeamsNotification(HOOK, { kind: 'veto', title: 't' }, async () => ({ status: 429 }));
    assert.equal(r.ok, false);
    assert.equal(r.throttled, true);
    assert.equal(r.status, 429);
  });

  test('builder clamps huge fields so the card stays under the 28 KB budget (it sends, not rejects)', async () => {
    let sentBytes = 0;
    const spy: TeamsPostFn = async (_u, body) => { sentBytes = Buffer.byteLength(body, 'utf8'); return { status: 202 }; };
    const big = 'x'.repeat(50_000);
    const r = await sendTeamsNotification(HOOK, { kind: 'veto', title: big, detail: big }, spy);
    assert.equal(r.ok, true, 'clamped card is within budget → sends');
    assert.ok(sentBytes < TEAMS_MAX_BYTES, `sent ${sentBytes}B < ${TEAMS_MAX_BYTES}B budget`);
  });

  test('transport failure → non-throwing error result', async () => {
    const r = await sendTeamsNotification(HOOK, { kind: 'veto', title: 't' }, async () => { throw new Error('network down'); });
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /network down/);
  });
});

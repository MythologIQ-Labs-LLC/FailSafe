import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { buildSreHtml, fetchAgtSnapshot, type AgtSreSnapshot, type SreViewModel } from '../../roadmap/routes/templates/SreTemplate';

function mockSnapshot(overrides: Partial<AgtSreSnapshot> = {}): AgtSreSnapshot {
  return {
    policies: [],
    trustScores: [],
    sli: { name: "compliance", target: 0.95, currentValue: null, meetingTarget: null, totalDecisions: 0 },
    asiCoverage: {
      "ASI-03": { label: "Audit Trail", covered: true, feature: "FailSafeAuditSink" },
      "ASI-06": { label: "Delegation Chain Visibility", covered: true, feature: "FailSafeTrustMapper (partial)" },
    },
    ...overrides,
  };
}

describe('SreTemplate', () => {
  describe('buildSreHtml — disconnected', () => {
    it('contains AGT Adapter not connected message', () => {
      const html = buildSreHtml({ connected: false, snapshot: null });
      assert.ok(html.includes('AGT Adapter not connected'), 'missing disconnect message');
    });

    it('contains install command', () => {
      const html = buildSreHtml({ connected: false, snapshot: null });
      assert.ok(html.includes('agent-failsafe[server]'), 'missing install command');
    });
  });

  describe('buildSreHtml — connected', () => {
    it('contains Active Policies heading', () => {
      const html = buildSreHtml({ connected: true, snapshot: mockSnapshot() });
      assert.ok(html.includes('Active Policies'), 'missing Active Policies heading');
    });

    it('contains OWASP ASI Coverage heading', () => {
      const html = buildSreHtml({ connected: true, snapshot: mockSnapshot() });
      assert.ok(html.includes('OWASP ASI Coverage'), 'missing OWASP ASI Coverage heading');
    });

    it('HTML-escapes policy name to prevent XSS', () => {
      const snap = mockSnapshot({
        policies: [{ name: '<script>alert(1)</script>', type: 'allow', enforced: true }],
      });
      const html = buildSreHtml({ connected: true, snapshot: snap });
      assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag present — XSS risk');
      assert.ok(html.includes('&lt;script&gt;'), 'escaped content not found');
    });

    it('enforced policy row has class "on"', () => {
      const snap = mockSnapshot({
        policies: [{ name: 'p1', type: 'allow', enforced: true }],
      });
      const html = buildSreHtml({ connected: true, snapshot: snap });
      assert.ok(html.includes('sre-badge on'), 'missing on class for enforced policy');
    });

    it('inactive policy row has class "off"', () => {
      const snap = mockSnapshot({
        policies: [{ name: 'p1', type: 'deny', enforced: false }],
      });
      const html = buildSreHtml({ connected: true, snapshot: snap });
      assert.ok(html.includes('sre-badge off'), 'missing off class for inactive policy');
    });

    it('ASI-03 row contains covered checkmark', () => {
      const html = buildSreHtml({ connected: true, snapshot: mockSnapshot() });
      assert.ok(html.includes('ASI-03'), 'ASI-03 row missing');
      assert.ok(html.includes('\u2713') || html.includes('&#10003;'), 'checkmark missing');
    });

    it('ASI-06 row is present', () => {
      const html = buildSreHtml({ connected: true, snapshot: mockSnapshot() });
      assert.ok(html.includes('ASI-06'), 'ASI-06 row missing');
    });

    it('meetingTarget true produces meeting target text', () => {
      const snap = mockSnapshot({ sli: { name: 's', target: 0.95, currentValue: 0.97, meetingTarget: true, totalDecisions: 10 } });
      const html = buildSreHtml({ connected: true, snapshot: snap });
      assert.ok(html.includes('Meeting target'), 'meeting target text missing');
    });

    it('meetingTarget false produces below target text', () => {
      const snap = mockSnapshot({ sli: { name: 's', target: 0.95, currentValue: 0.80, meetingTarget: false, totalDecisions: 10 } });
      const html = buildSreHtml({ connected: true, snapshot: snap });
      assert.ok(html.includes('Below target'), 'below target text missing');
    });

    it('meetingTarget null produces No data text', () => {
      const snap = mockSnapshot({ sli: { name: 's', target: 0.95, currentValue: null, meetingTarget: null, totalDecisions: 0 } });
      const html = buildSreHtml({ connected: true, snapshot: snap });
      assert.ok(html.includes('No data'), 'no data text missing');
    });
  });

  describe('Activity Feed renders ALLOW / DENY / AUDIT rows', () => {
    // FX409 — SRE Activity Feed (ALLOW/DENY/AUDIT)
    const threeEventSnapshot = (): AgtSreSnapshot => mockSnapshot({
      auditEvents: [
        { id: 'e1', timestamp: '2026-05-13T10:00:00Z', type: 'policy.decision',
          agentId: 'agent-alpha', action: 'ALLOW', reason: 'within policy' },
        { id: 'e2', timestamp: '2026-05-13T10:01:00Z', type: 'policy.decision',
          agentId: 'agent-bravo', action: 'DENY', reason: 'blocked by deny-rule' },
        { id: 'e3', timestamp: '2026-05-13T10:02:00Z', type: 'audit.log',
          agentId: 'agent-charlie', action: 'AUDIT', reason: 'observation only' },
      ],
    });

    it('renders an Activity Feed header when events are present', () => {
      const html = buildSreHtml({ connected: true, snapshot: threeEventSnapshot() });
      assert.ok(html.includes('Activity Feed'), 'Activity Feed header missing');
    });

    it('renders ALLOW action text and on-class badge', () => {
      const html = buildSreHtml({ connected: true, snapshot: threeEventSnapshot() });
      assert.ok(html.includes('>ALLOW<'), 'ALLOW action text missing from any badge');
      assert.ok(html.includes('sre-badge on'), 'ALLOW row missing on-class badge');
    });

    it('renders DENY action text and off-class badge', () => {
      const html = buildSreHtml({ connected: true, snapshot: threeEventSnapshot() });
      assert.ok(html.includes('>DENY<'), 'DENY action text missing from any badge');
      assert.ok(html.includes('sre-badge off'), 'DENY row missing off-class badge');
    });

    it('renders AUDIT action text and warn-class badge', () => {
      const html = buildSreHtml({ connected: true, snapshot: threeEventSnapshot() });
      assert.ok(html.includes('>AUDIT<'), 'AUDIT action text missing from any badge');
      assert.ok(html.includes('sre-badge warn'), 'AUDIT row missing warn-class badge');
    });

    it('renders all three agentIds inline with their rows', () => {
      const html = buildSreHtml({ connected: true, snapshot: threeEventSnapshot() });
      assert.ok(html.includes('agent-alpha'), 'ALLOW row agentId missing');
      assert.ok(html.includes('agent-bravo'), 'DENY row agentId missing');
      assert.ok(html.includes('agent-charlie'), 'AUDIT row agentId missing');
    });

    it('preserves ALLOW/DENY/AUDIT ordering (each subsequent action after the previous)', () => {
      const html = buildSreHtml({ connected: true, snapshot: threeEventSnapshot() });
      const allowIdx = html.indexOf('>ALLOW<');
      const denyIdx = html.indexOf('>DENY<');
      const auditIdx = html.indexOf('>AUDIT<');
      assert.ok(allowIdx > -1 && denyIdx > -1 && auditIdx > -1, 'one of ALLOW/DENY/AUDIT missing');
      assert.ok(allowIdx < denyIdx, 'ALLOW must render before DENY');
      assert.ok(denyIdx < auditIdx, 'DENY must render before AUDIT');
    });

    it('binds each action to its correct badge class (DENY not rendered as on, ALLOW not as off)', () => {
      const html = buildSreHtml({ connected: true, snapshot: threeEventSnapshot() });
      // Isolate the Activity Feed subsection (other sections also use sre-badge classes)
      const feedStart = html.indexOf('Activity Feed');
      assert.ok(feedStart > -1, 'Activity Feed section not found');
      const feedHtml = html.slice(feedStart);
      // In the audit feed, each action label appears as a badge with the matching class
      const allowMatch = /<span class="sre-badge on">([^<]+)<\/span>/.exec(feedHtml);
      const denyMatch = /<span class="sre-badge off">([^<]+)<\/span>/.exec(feedHtml);
      const warnMatch = /<span class="sre-badge warn">([^<]+)<\/span>/.exec(feedHtml);
      assert.ok(allowMatch, 'no sre-badge on found in audit feed');
      assert.ok(denyMatch, 'no sre-badge off found in audit feed');
      assert.ok(warnMatch, 'no sre-badge warn found in audit feed');
      assert.strictEqual(allowMatch![1], 'ALLOW', 'on-class badge does not contain ALLOW');
      assert.strictEqual(denyMatch![1], 'DENY', 'off-class badge does not contain DENY');
      assert.strictEqual(warnMatch![1], 'AUDIT', 'warn-class badge does not contain AUDIT');
    });

    it('renders reason text alongside each event row', () => {
      const html = buildSreHtml({ connected: true, snapshot: threeEventSnapshot() });
      assert.ok(html.includes('within policy'), 'ALLOW reason missing');
      assert.ok(html.includes('blocked by deny-rule'), 'DENY reason missing');
      assert.ok(html.includes('observation only'), 'AUDIT reason missing');
    });

    it('omits Activity Feed section entirely when auditEvents is empty', () => {
      const html = buildSreHtml({ connected: true, snapshot: mockSnapshot({ auditEvents: [] }) });
      assert.ok(!html.includes('Activity Feed'), 'Activity Feed header should not render with no events');
    });
  });

  describe('fetchAgtSnapshot', () => {
    it('returns connected: false when fetch throws', async () => {
      // Override global fetch to simulate network failure
      const originalFetch = global.fetch;
      global.fetch = async () => { throw new Error('ECONNREFUSED'); };
      try {
        const result = await fetchAgtSnapshot('http://127.0.0.1:9377');
        assert.strictEqual(result.connected, false);
        assert.strictEqual(result.snapshot, null);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

// Lane E (plan-e-console-ui-xss) rows X1-X6 + X28: Governance > Compliance
// sinks in governance.js. Each row renders a hostile hub value and asserts it
// stays inert text (or round-trips through its attribute).

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { GovernanceRenderer } from '../../roadmap/ui/modules/governance.js';
import { TAG, DQ, CLS, assertInert, installDom } from './xssProbe';

function hub(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sentinelStatus: {},
    l3Queue: [],
    chainValid: null,
    metricIntegrity: [],
    unattributedFileActivity: { count: 0, recent: [] },
    recentModeTransitions: [],
    ...extra,
  };
}

suite('Lane E XSS: governance.js (X1-X6, X28)', () => {
  let restore: () => void;
  let root: Element;
  setup(() => {
    const env = installDom('<div id="gov"></div>');
    restore = env.restore;
    root = env.dom.window.document.getElementById('gov')!;
  });
  teardown(() => restore());

  test('X1 policies card: a ledger BLOCK verdict carrying markup stays text (S1)', () => {
    const r = new GovernanceRenderer('gov');
    const message = `Blocked: BLOCK ${TAG}`;
    r.render(hub({ governancePhase: { current: 'GATE', activeAlerts: [{ id: 'block-1', type: 'BLOCK', message }] } }));
    assertInert(root);
    assert.ok(root.textContent!.includes(message), 'the verdict text is shown literally');
  });

  test('X2 policies card: a hostile Sentinel mode stays text (S1, integrity.js:72 path)', () => {
    const r = new GovernanceRenderer('gov');
    r.render(hub({ sentinelStatus: { mode: TAG } }));
    assertInert(root);
    assert.ok(root.textContent!.includes(TAG), 'the mode is shown literally');
  });

  test('X3 protocol audit log: a verdict event message carrying markup stays text (S2)', () => {
    const r = new GovernanceRenderer('gov');
    r.onEvent({ type: 'verdict', payload: { message: TAG } });
    r.render(hub());
    assertInert(root);
    assert.ok(root.textContent!.includes(TAG));
  });

  test('X4 L3 queue: a hostile riskGrade cannot add a class or handler; queuedAt stays text (S3)', () => {
    const r = new GovernanceRenderer('gov');
    r.render(hub({ l3Queue: [{ id: 'l3-1', filePath: 'src/a.ts', riskGrade: CLS, queuedAt: TAG }] }));
    assertInert(root);
    const badge = root.querySelector('[data-section="l3-chain"] .cc-badge');
    assert.ok(badge, 'the L3 badge renders');
    assert.equal(badge!.className, 'cc-badge cc-badge--medium', 'an off-allowlist grade falls back to medium');
    assert.ok(root.textContent!.includes(TAG), 'queuedAt is shown literally');
  });

  test('X4b L3 queue control: an ordinary grade keeps its modifier class', () => {
    const r = new GovernanceRenderer('gov');
    r.render(hub({ l3Queue: [{ id: 'l3-1', filePath: 'src/a.ts', riskGrade: 'L3', queuedAt: '2026-10-22T00:00:00Z' }] }));
    const badge = root.querySelector('[data-section="l3-chain"] .cc-badge');
    assert.equal(badge!.className, 'cc-badge cc-badge--l3');
  });

  test('X5 data attributes: transition timestamp and resolution id round-trip a double-quote payload (S4)', () => {
    const r = new GovernanceRenderer('gov');
    r.render(hub({
      recentModeTransitions: [{ timestamp: DQ, previousMode: 'observe', newMode: 'enforce', reason: 'r', actor: 'a' }],
      auditLog: [{ id: DQ, timestamp: 't', eventType: 'BLOCK', artifactPath: 'p', resolution: { state: 'LIVE' } }],
    }));
    assertInert(root);
    assert.equal(root.querySelector('.cc-mode-transition')!.getAttribute('data-transition-ts'), DQ);
    assert.equal(root.querySelector('.cc-verdict-resolution')!.getAttribute('data-resolution-entry-id'), DQ);
  });

  test('X6 control: escaped rows still render their text (preflight conflict, transition reason)', () => {
    const r = new GovernanceRenderer('gov');
    r.render(hub({
      l3Queue: [{ id: 'l3-1', filePath: 'src/a.ts', riskGrade: 'L3', queuedAt: 'q',
        meta: { preflight: { driftedDecisions: [{ title: 'Adopt 15-min TTL' }] } } }],
      recentModeTransitions: [{ timestamp: 't', previousMode: 'observe', newMode: 'enforce', reason: "operator's call", actor: 'a' }],
    }));
    assert.ok(root.querySelector('.l3-preflight-conflict')!.textContent!.includes('Adopt 15-min TTL'));
    assert.ok(root.querySelector('.cc-mode-transition')!.textContent!.includes("operator's call"));
  });

  test('X28 protocol audit log: a hostile event time stays text (fold 5, governance.js:256)', () => {
    const r = new GovernanceRenderer('gov');
    r.onEvent({ type: 'verdict', time: TAG, payload: { message: 'ok' } });
    r.render(hub());
    assertInert(root);
    assert.ok(root.textContent!.includes(TAG));
  });
});

// Lane E (plan-e-console-ui-xss) rows X7-X15: Agents > Operations (operations.js)
// and Governance > Risks (risks.js) sinks.

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { OperationsRenderer } from '../../roadmap/ui/modules/operations.js';
// @ts-expect-error JS module import in TS test context
import { RisksRenderer } from '../../roadmap/ui/modules/risks.js';
import { TAG, DQ, SQ, CLS, assertInert, installDom } from './xssProbe';

suite('Lane E XSS: operations.js (X7-X9)', () => {
  let restore: () => void;
  let doc: Document;
  setup(() => {
    const env = installDom('<div id="ops"></div><div id="panel"></div>');
    restore = env.restore;
    doc = env.dom.window.document;
  });
  teardown(() => restore());

  test('X7 mission strip: a hostile current phase stays text (S5)', async () => {
    const r = new OperationsRenderer('ops');
    await r.render({ runState: { currentPhase: TAG }, sentinelStatus: { running: true } });
    const root = doc.getElementById('ops')!;
    assertInert(root);
    assert.ok(root.textContent!.includes(TAG));
  });

  test('X8 mission strip and right panel: a hostile Sentinel mode stays text (S6)', async () => {
    const r = new OperationsRenderer('ops');
    await r.render({ runState: {}, sentinelStatus: { running: true, mode: TAG } });
    const root = doc.getElementById('ops')!;
    assertInert(root);
    assert.ok(root.textContent!.includes(TAG), 'mission strip shows the mode literally');
    const panel = doc.getElementById('panel')!;
    panel.innerHTML = r.renderRightPanel();
    assertInert(panel);
    assert.ok(panel.textContent!.includes(TAG), 'right panel shows the mode literally');
  });

  test('X9 phase grid: hostile phase name and status stay text (S7)', async () => {
    const r = new OperationsRenderer('ops');
    r.roadmap = { phases: [{ name: TAG, status: TAG }] };
    await r.render({ runState: {}, sentinelStatus: {} });
    const root = doc.getElementById('ops')!;
    assertInert(root);
    assert.ok(root.textContent!.includes(TAG));
  });
});

suite('Lane E XSS: risks.js (X10-X15)', () => {
  let restore: () => void;
  let doc: Document;
  setup(() => {
    const env = installDom('<div id="risks"></div>');
    restore = env.restore;
    doc = env.dom.window.document;
  });
  teardown(() => {
    doc.querySelectorAll('.cc-modal-overlay').forEach((n) => n.remove());
    restore();
  });

  const base = { id: 'r1', title: 'T', severity: 'high', description: 'd', source: 'manual' };

  test('X10 source pill: a hostile audit-veto ledgerEntry stays text (S8)', () => {
    const r = new RisksRenderer('risks');
    r.render({ risks: [{ ...base, source: 'audit-veto', derivedFrom: { ledgerEntry: TAG } }] });
    const root = doc.getElementById('risks')!;
    assertInert(root);
    assert.ok(root.querySelector('.cc-source-pill')!.textContent!.includes(TAG));
  });

  test('X11 severity class allowlist: a hostile severity adds no class or handler (S10)', () => {
    const r = new RisksRenderer('risks');
    r.render({ risks: [{ ...base, severity: CLS }] });
    const root = doc.getElementById('risks')!;
    assertInert(root);
    const badge = root.querySelector('.cc-risk-list .cc-badge')!;
    assert.equal(badge.className, 'cc-badge', 'an unknown severity gets no modifier class');
    assert.equal(badge.textContent, CLS, 'the severity text is still shown');
  });

  test('X11b control: a known severity keeps its modifier class', () => {
    const r = new RisksRenderer('risks');
    r.render({ risks: [{ ...base, severity: 'high' }] });
    const badge = doc.querySelector('.cc-risk-list .cc-badge')!;
    assert.equal(badge.className, 'cc-badge cc-badge--high');
  });

  test('X12 data attributes: hostile id and source round-trip (S9)', () => {
    const r = new RisksRenderer('risks');
    r.render({ risks: [{ ...base, id: DQ, source: DQ, severity: DQ }] });
    const root = doc.getElementById('risks')!;
    assertInert(root);
    const card = root.querySelector('.cc-risk-list > .cc-card')!;
    assert.equal(card.getAttribute('data-rid'), DQ);
    assert.equal(card.getAttribute('data-risk-severity'), DQ);
    assert.equal(root.querySelector('.cc-risk-edit')!.getAttribute('data-id'), DQ);
    assert.equal(root.querySelector('.cc-risk-del')!.getAttribute('data-id'), DQ);
    assert.equal(root.querySelector('.cc-source-pill')!.getAttribute('data-source'), DQ);
  });

  test('X13 edit modal: a double-quote title round-trips into the input value (S11)', () => {
    const r = new RisksRenderer('risks');
    r.openModal({ ...base, title: DQ });
    const overlay = doc.querySelector('.cc-modal-overlay')!;
    assertInert(overlay);
    assert.equal((overlay.querySelector('input[name=title]') as HTMLInputElement).value, DQ);
  });

  test('X14 control: a single-quote title round-trips (value is double-quoted)', () => {
    const r = new RisksRenderer('risks');
    r.openModal({ ...base, title: SQ });
    const overlay = doc.querySelector('.cc-modal-overlay')!;
    assertInert(overlay);
    assert.equal((overlay.querySelector('input[name=title]') as HTMLInputElement).value, SQ);
  });

  test('X15 control: a description cannot close the textarea', () => {
    const r = new RisksRenderer('risks');
    const description = `</textarea>${TAG}`;
    r.openModal({ ...base, description });
    const overlay = doc.querySelector('.cc-modal-overlay')!;
    assertInert(overlay);
    assert.equal((overlay.querySelector('textarea[name=description]') as HTMLTextAreaElement).value, description);
  });
});

// Judge (iteration-5 auditor) probes for plan-703. Copy into src/test/roadmap/ as
// delivery-assessment-renderer.zprobe.test.ts in a scratch tree only; run with run703.sh.
import { strict as assert } from 'assert';
// @ts-expect-error untyped JS module
import { DeliveryAssessmentRenderer } from '../../../src/roadmap/ui/modules/delivery-assessment-renderer.js';
import { ACTIVE, SEALED, SHA, SHA2, fire, fx, holdFirstGet, holdPosts, resetFixture, settled, setupDom } from './deliveryRendererFixture';

const SHA3 = '7'.repeat(40);
const REVIEW = '/api/actions/delivery/review';
const q = <T extends Element>(doc: Document, s: string) => doc.querySelector(s) as T;
const value = (doc: Document, s: string) => q<HTMLInputElement | HTMLSelectElement>(doc, s).value;
const pick = (doc: Document, s: string, v: string) => { const el = q<HTMLSelectElement>(doc, s); el.value = v; fire(doc, el, 'change'); };
const typeNote = (doc: Document, t: string) => { const n = q<HTMLInputElement>(doc, '.cc-dlv-review-note'); n.value = t; fire(doc, n, 'input'); };
const vetoes = (...on: Array<[number, string]>) => ({
  status: 'failing', reason: 'Rejected by review: VETO',
  records: on.map(([id, commitSha]) => ({ record: 'blocking', kind: 'veto', id, hash: 'h'.repeat(64), label: 'VETO', verdict: 'VETO', commitSha, commitState: 'sealed' })),
});

// Switch the intent picker to SEALED and hold SEALED's detail GET; returns release + a wait for the switch refresh.
async function switchHeld(doc: Document, renderer: Record<string, unknown>) {
  const hold = holdFirstGet(`/api/v1/delivery/intents/${SEALED}`);
  const refreshed = settled(renderer, 'refresh');
  pick(doc, '.cc-dlv-picker', SEALED);
  await hold.started;
  return { hold, refreshed };
}

suite('PROBE iter5 auditor', () => {
  setup(() => resetFixture());

  test('PROBE-Z14: with no VETO, a picked older commit survives a repaint', async () => {
    fx.extraLinked = [SHA2];
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      await r.refresh();
      pick(ctx.doc, '.cc-dlv-review-pick', SHA);
      await r.refresh();
      assert.equal(value(ctx.doc, '.cc-dlv-review-pick'), SHA);
    } finally { ctx.cleanup(); }
  });

  test('PROBE-Z8: a rework pick is kept by VETO id when another VETO leaves the list', async () => {
    fx.extraLinked = [SHA2, SHA3];
    fx.reviewOverride = vetoes([8, SHA2], [10, SHA3]);
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      await r.refresh();
      pick(ctx.doc, '.cc-dlv-rework-pick[data-veto="10"]', SHA);
      fx.reviewOverride = vetoes([10, SHA3]); // VETO #8 is no longer blocking
      await r.refresh();
      assert.equal(value(ctx.doc, '.cc-dlv-rework-pick[data-veto="10"]'), SHA);
    } finally { ctx.cleanup(); }
  });

  test('PROBE-X14: a note typed on the shown intent while an intent switch is pending stays with the shown intent', async () => {
    fx.extraLinked = [SHA2];
    fx.secondLinkable = true;
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      await r.refresh();
      const { hold, refreshed } = await switchHeld(ctx.doc, r);
      assert.equal(q(ctx.doc, '.cc-dlv')?.getAttribute('data-intent'), ACTIVE, 'ACTIVE still shown');
      typeNote(ctx.doc, 'typed on ACTIVE');
      hold.release();
      await refreshed();
      assert.equal(q(ctx.doc, '.cc-dlv')?.getAttribute('data-intent'), SEALED);
      assert.equal(value(ctx.doc, '.cc-dlv-review-note'), '', 'not shown on SEALED');
      r.selectedId = ACTIVE; await r.refresh();
      assert.equal(value(ctx.doc, '.cc-dlv-review-note'), 'typed on ACTIVE', 'kept for ACTIVE');
    } finally { ctx.cleanup(); }
  });

  test('PROBE-Z2: a commit picked on the shown intent while an intent switch is pending stays with the shown intent', async () => {
    fx.extraLinked = [SHA2];
    fx.secondLinkable = true;
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      await r.refresh();
      const { hold, refreshed } = await switchHeld(ctx.doc, r);
      pick(ctx.doc, '.cc-dlv-review-pick', SHA);
      hold.release();
      await refreshed();
      assert.equal(value(ctx.doc, '.cc-dlv-review-pick'), SHA2, 'SEALED starts at the newest');
      r.selectedId = ACTIVE; await r.refresh();
      assert.equal(value(ctx.doc, '.cc-dlv-review-pick'), SHA, 'ACTIVE keeps its pick');
    } finally { ctx.cleanup(); }
  });

  test('PROBE-Z1 (pre-existing): a review clicked on the shown intent while an intent switch is pending is posted for the shown intent', async () => {
    fx.secondLinkable = true;
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      await r.refresh();
      const reviewed = settled(r, 'review');
      const { hold } = await switchHeld(ctx.doc, r);
      q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').click();
      hold.release();
      await reviewed();
      assert.equal(ctx.posted[0].body.intentId, ACTIVE);
    } finally { ctx.cleanup(); }
  });

  test('PROBE-Z10: an old failed GET does not change the selected intent', async () => {
    const ctx = setupDom();
    const hold = holdFirstGet('/api/v1/delivery/intents', { failWith: 'stale' });
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      const earlier = r.refresh();
      await hold.started;
      r.selectedId = SEALED;
      await r.refresh();
      hold.release();
      await earlier;
      assert.equal(r.selectedId, SEALED);
    } finally { hold.release(); ctx.cleanup(); }
  });

  test('PROBE-Z16: a held completion message is not consumed by an error panel', async () => {
    const ctx = setupDom();
    const hold = holdPosts(REVIEW);
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      const reviewed = settled(r, 'review');
      await r.refresh();
      q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').click();
      const fail = holdFirstGet('/api/v1/delivery/intents', { failWith: 'down' });
      hold.release();
      fail.release();
      await reviewed();
      assert.equal(q(ctx.doc, '.cc-dlv-result'), null, 'not shown on the error panel');
      await r.refresh();
      assert.match(q(ctx.doc, '.cc-dlv-result')?.textContent || '', /Review PASS recorded/);
    } finally { hold.release(); ctx.cleanup(); }
  });
});

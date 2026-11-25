// Judge probes, plan-703 iteration 6 audit. Run only in the Judge's scratch tree.
import { strict as assert } from 'assert';
// @ts-expect-error untyped JS module
import { DeliveryAssessmentRenderer } from '../../../src/roadmap/ui/modules/delivery-assessment-renderer.js';
import { REVIEW, SHA, SHA2, SHA3, fx, holdPosts, pick, q, resetFixture, settled, setupDom, value, vetoes } from './deliveryRendererFixture';

suite('Judge iter6 probes', () => {
  setup(() => resetFixture());

  test('PROBE-W1: a repainted PASS is disabled while a review is pending', async () => {
    const ctx = setupDom();
    const hold = holdPosts(REVIEW);
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const reviewed = settled(renderer, 'review');
      await renderer.refresh();
      q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-veto').click();
      await renderer.refresh();
      assert.equal(q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').disabled, true);
      hold.release();
      await reviewed();
    } finally { hold.release(); ctx.cleanup(); }
  });

  test('PROBE-W11: a VETO left at none stays none beside a picked VETO after a repaint, and PASS posts only the pick', async () => {
    fx.extraLinked = [SHA2, SHA3];
    fx.reviewOverride = vetoes([8, SHA2], [10, SHA3]);
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const reviewed = settled(renderer, 'review');
      await renderer.refresh();
      pick(ctx.doc, '.cc-dlv-rework-pick[data-veto="10"]', SHA);
      await renderer.refresh();
      assert.equal(value(ctx.doc, '.cc-dlv-rework-pick[data-veto="8"]'), '');
      assert.equal(value(ctx.doc, '.cc-dlv-rework-pick[data-veto="10"]'), SHA);
      q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').click();
      await reviewed();
      assert.deepEqual(ctx.posted[0].body.reworks, [{ vetoEntryId: 10, reworkCommit: SHA }]);
    } finally { ctx.cleanup(); }
  });

  test('PROBE-W23: a successful PASS keeps the picked commit for the next review', async () => {
    fx.extraLinked = [SHA2];
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const reviewed = settled(renderer, 'review');
      await renderer.refresh();
      pick(ctx.doc, '.cc-dlv-review-pick', SHA);
      q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').click();
      await reviewed();
      assert.equal(ctx.posted[0].body.commitSha, SHA);
      assert.equal(value(ctx.doc, '.cc-dlv-review-pick'), SHA, 'a completed PASS does not clear the form');
    } finally { ctx.cleanup(); }
  });
});

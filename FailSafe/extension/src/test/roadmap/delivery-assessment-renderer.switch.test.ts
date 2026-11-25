// #703: the review form while the panel is between views. Choosing another intent sets the selection
// before its view arrives, and the old panel stays usable until then: whatever the operator does on
// the shown panel belongs to the shown intent. Also the picked commit without any VETO, and rework
// picks kept by VETO id when the VETO set changes. Held requests use promise gates, never sleeps.
// The cases were first written as probes by the iteration-5 plan-703 auditor (remediation, R-table).

import { strict as assert } from 'assert';
// @ts-expect-error untyped JS module
import { DeliveryAssessmentRenderer } from '../../../src/roadmap/ui/modules/delivery-assessment-renderer.js';
import {
  ACTIVE, SEALED, SHA, SHA2, SHA3, fx, holdFirstGet, pick, q, resetFixture, settled, setupDom, typeNote, value, vetoes,
} from './deliveryRendererFixture';

/** Choose SEALED in the intent picker and hold its detail GET, so ACTIVE stays shown. */
async function switchHeld(doc: Document, renderer: Record<string, unknown>) {
  const hold = holdFirstGet(`/api/v1/delivery/intents/${SEALED}`);
  const refreshed = settled(renderer, 'refresh');
  pick(doc, '.cc-dlv-picker', SEALED);
  await hold.started;
  assert.equal(q(doc, '.cc-dlv')?.getAttribute('data-intent'), ACTIVE, 'ACTIVE is still shown while SEALED loads');
  return { hold, refreshed };
}

suite('DeliveryAssessmentRenderer review form between views (#703, jsdom)', () => {
  setup(() => resetFixture());

  test('#703: with no VETO, a picked older commit survives a repaint', async () => {
    fx.extraLinked = [SHA2];
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      await renderer.refresh();
      pick(ctx.doc, '.cc-dlv-review-pick', SHA);
      await renderer.refresh();
      assert.equal(value(ctx.doc, '.cc-dlv-review-pick'), SHA);
    } finally { ctx.cleanup(); }
  });

  test('#703: a rework pick is kept by VETO id when another VETO leaves the list', async () => {
    fx.extraLinked = [SHA2, SHA3];
    fx.reviewOverride = vetoes([8, SHA2], [10, SHA3]);
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      await renderer.refresh();
      pick(ctx.doc, '.cc-dlv-rework-pick[data-veto="10"]', SHA);
      fx.reviewOverride = vetoes([10, SHA3]); // VETO #8 is no longer blocking
      await renderer.refresh();
      assert.equal(value(ctx.doc, '.cc-dlv-rework-pick[data-veto="10"]'), SHA);
    } finally { ctx.cleanup(); }
  });

  test('#703: a VETO left at none stays none beside a picked VETO after a repaint, and PASS posts only the pick', async () => {
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

  test('#703: a successful PASS keeps the picked commit for the next review', async () => {
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

  test('#703: a round trip through the intent picker keeps the note and the commit pick', async () => {
    fx.extraLinked = [SHA2];
    fx.secondLinkable = true;
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      await renderer.refresh();
      const refreshed = settled(renderer, 'refresh');
      pick(ctx.doc, '.cc-dlv-review-pick', SHA);
      typeNote(ctx.doc, 'kept across the picker');
      pick(ctx.doc, '.cc-dlv-picker', SEALED);
      await refreshed();
      pick(ctx.doc, '.cc-dlv-picker', ACTIVE);
      await refreshed();
      assert.equal(value(ctx.doc, '.cc-dlv-review-pick'), SHA);
      assert.equal(value(ctx.doc, '.cc-dlv-review-note'), 'kept across the picker');
    } finally { ctx.cleanup(); }
  });

  test('#703: a note typed on the shown intent while an intent switch is pending stays with the shown intent', async () => {
    fx.extraLinked = [SHA2];
    fx.secondLinkable = true;
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      await renderer.refresh();
      const { hold, refreshed } = await switchHeld(ctx.doc, renderer);
      typeNote(ctx.doc, 'typed on ACTIVE');
      hold.release();
      await refreshed();
      assert.equal(q(ctx.doc, '.cc-dlv')?.getAttribute('data-intent'), SEALED);
      assert.equal(value(ctx.doc, '.cc-dlv-review-note'), '', 'not shown on SEALED');
      renderer.selectedId = ACTIVE;
      await renderer.refresh();
      assert.equal(value(ctx.doc, '.cc-dlv-review-note'), 'typed on ACTIVE', 'kept for ACTIVE');
    } finally { ctx.cleanup(); }
  });

  test('#703: a commit picked on the shown intent while an intent switch is pending stays with the shown intent', async () => {
    fx.extraLinked = [SHA2];
    fx.secondLinkable = true;
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      await renderer.refresh();
      const { hold, refreshed } = await switchHeld(ctx.doc, renderer);
      pick(ctx.doc, '.cc-dlv-review-pick', SHA);
      hold.release();
      await refreshed();
      assert.equal(value(ctx.doc, '.cc-dlv-review-pick'), SHA2, 'SEALED starts at the newest');
      renderer.selectedId = ACTIVE;
      await renderer.refresh();
      assert.equal(value(ctx.doc, '.cc-dlv-review-pick'), SHA, 'ACTIVE keeps its pick');
    } finally { ctx.cleanup(); }
  });

  test('#703: a review clicked on the shown intent while an intent switch is pending is posted for the shown intent', async () => {
    fx.secondLinkable = true;
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      await renderer.refresh();
      const reviewed = settled(renderer, 'review');
      const { hold } = await switchHeld(ctx.doc, renderer);
      q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').click();
      hold.release();
      await reviewed();
      assert.equal(ctx.posted[0].body.intentId, ACTIVE);
    } finally { ctx.cleanup(); }
  });
});

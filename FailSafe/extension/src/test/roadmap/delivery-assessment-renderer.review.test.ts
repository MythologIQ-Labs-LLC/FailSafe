// #703: the Delivery review form across repaints. The operator's picked commit, rework picks and
// unsent note survive a refresh; a note belongs to one intent and commit; a newer edit is never
// erased by an older POST; PASS and VETO cannot both be submitted; a failed POST allows a retry.
// Pending requests are held with explicit promise gates, never sleeps.

import { strict as assert } from 'assert';
// @ts-expect-error untyped JS module
import { DeliveryAssessmentRenderer } from '../../../src/roadmap/ui/modules/delivery-assessment-renderer.js';
import { ACTIVE, REVIEW, SEALED, SHA, SHA2, SHA3, fire, fx, holdPosts, pick, q, resetFixture, settled, setupDom, typeNote, value, vetoes } from './deliveryRendererFixture';


suite('DeliveryAssessmentRenderer review form across repaints (#703, jsdom)', () => {
  setup(() => resetFixture());

  test('a typed review note survives an async repaint and posts exactly once before the draft is cleared (#703)', async () => {
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const reviewed = settled(renderer, 'review');
      await renderer.refresh();
      const oldInput = typeNote(ctx.doc, 'keep this note');
      // This recreates reviewControls, just as an overlapping API refresh does in the real UI.
      await renderer.refresh();
      const newInput = q<HTMLInputElement>(ctx.doc, '.cc-dlv-review-note');
      assert.notEqual(newInput, oldInput, 'the refresh must replace the actual input');
      assert.equal(newInput.value, 'keep this note', 'unsent text must not disappear during a refresh');
      q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').click();
      await reviewed();
      assert.deepEqual(ctx.posted, [
        { url: REVIEW, body: { intentId: ACTIVE, verdict: 'PASS', commitSha: SHA, note: 'keep this note' } },
      ], 'only the real typed note may be recorded');
      assert.equal(q<HTMLInputElement>(ctx.doc, '.cc-dlv-review-note').value, '', 'a successful post clears the private draft');
    } finally { ctx.cleanup(); }
  });

  test('#703: an older picked commit, its note and the rework pick survive a repaint and are posted', async () => {
    fx.extraLinked = [SHA2];
    fx.reviewOverride = vetoes([8, SHA2]);
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const reviewed = settled(renderer, 'review');
      await renderer.refresh();
      assert.equal(q<HTMLSelectElement>(ctx.doc, '.cc-dlv-review-pick').value, SHA2, 'the newest linked commit is the default');
      pick(ctx.doc, '.cc-dlv-review-pick', SHA);
      typeNote(ctx.doc, 'older commit note');
      await renderer.refresh();
      assert.equal(value(ctx.doc, '.cc-dlv-review-pick'), SHA, 'the commit pick alone is kept');
      pick(ctx.doc, '.cc-dlv-rework-pick', SHA);
      await renderer.refresh();
      assert.equal(q<HTMLSelectElement>(ctx.doc, '.cc-dlv-review-pick').value, SHA, 'the picked commit survives');
      assert.equal(q<HTMLInputElement>(ctx.doc, '.cc-dlv-review-note').value, 'older commit note');
      assert.equal(q<HTMLSelectElement>(ctx.doc, '.cc-dlv-rework-pick').value, SHA, 'the rework pick survives');
      q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').click();
      await reviewed();
      assert.deepEqual(ctx.posted, [{ url: REVIEW, body: {
        intentId: ACTIVE, verdict: 'PASS', commitSha: SHA, note: 'older commit note', reworks: [{ vetoEntryId: 8, reworkCommit: SHA }] } }]);
    } finally { ctx.cleanup(); }
  });

  test('#703: a note belongs to its commit: changing the picked commit hides it and changing back restores it', async () => {
    fx.extraLinked = [SHA2];
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      typeNote(ctx.doc, 'about the newest commit');
      pick(ctx.doc, '.cc-dlv-review-pick', SHA);
      assert.equal(q<HTMLInputElement>(ctx.doc, '.cc-dlv-review-note').value, '', 'another commit starts with no note');
      pick(ctx.doc, '.cc-dlv-review-pick', SHA2);
      assert.equal(q<HTMLInputElement>(ctx.doc, '.cc-dlv-review-note').value, 'about the newest commit');
    } finally { ctx.cleanup(); }
  });

  test('#703: a note and commit pick belong to their intent: another linkable intent starts empty', async () => {
    fx.extraLinked = [SHA2];
    fx.secondLinkable = true;
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const show = async (id: string) => { renderer.selectedId = id; await renderer.refresh(); };
      await renderer.refresh();
      typeNote(ctx.doc, 'about the active intent'); // on the newest commit, which SEALED also links
      await show(SEALED);
      assert.equal(q<HTMLInputElement>(ctx.doc, '.cc-dlv-review-note').value, '', 'a draft is not shown on another intent');
      await show(ACTIVE);
      assert.equal(q<HTMLInputElement>(ctx.doc, '.cc-dlv-review-note').value, 'about the active intent');
      pick(ctx.doc, '.cc-dlv-review-pick', SHA);
      await show(SEALED);
      assert.equal(q<HTMLSelectElement>(ctx.doc, '.cc-dlv-review-pick').value, SHA2, 'another intent starts at the newest commit');
    } finally { ctx.cleanup(); }
  });

  test('#703: a picked commit that is no longer linked falls back to the newest linked commit and keeps the rework pick', async () => {
    fx.extraLinked = [SHA2, SHA3];
    fx.reviewOverride = vetoes([8, SHA3]);
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      await renderer.refresh();
      pick(ctx.doc, '.cc-dlv-review-pick', SHA2);
      pick(ctx.doc, '.cc-dlv-rework-pick[data-veto="8"]', SHA);
      fx.extraLinked = [SHA3]; // SHA2 was unlinked
      await renderer.refresh();
      assert.equal(value(ctx.doc, '.cc-dlv-review-pick'), SHA3);
      assert.equal(value(ctx.doc, '.cc-dlv-rework-pick[data-veto="8"]'), SHA, 'the rework pick does not depend on the picked commit');
    } finally { ctx.cleanup(); }
  });

  test('#703: each rework pick is kept for its own VETO', async () => {
    fx.extraLinked = [SHA2, SHA3];
    fx.reviewOverride = vetoes([8, SHA2], [10, SHA3]);
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      await renderer.refresh();
      pick(ctx.doc, '.cc-dlv-rework-pick[data-veto="8"]', SHA3);
      pick(ctx.doc, '.cc-dlv-rework-pick[data-veto="10"]', SHA);
      await renderer.refresh();
      assert.equal(value(ctx.doc, '.cc-dlv-rework-pick[data-veto="8"]'), SHA3);
      assert.equal(value(ctx.doc, '.cc-dlv-rework-pick[data-veto="10"]'), SHA);
      pick(ctx.doc, '.cc-dlv-review-pick', SHA2); // a later commit change keeps the rework picks
      await renderer.refresh();
      assert.deepEqual([value(ctx.doc, '.cc-dlv-rework-pick[data-veto="8"]'), value(ctx.doc, '.cc-dlv-rework-pick[data-veto="10"]')], [SHA3, SHA]);
      const reviewed = settled(renderer, 'review');
      q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-veto').click();
      await reviewed();
      pick(ctx.doc, '.cc-dlv-rework-pick[data-veto="10"]', '');
      q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').click();
      await reviewed();
      assert.deepEqual(ctx.posted.map((p) => p.body), [
        { intentId: ACTIVE, verdict: 'VETO', commitSha: SHA2, note: '' },
        { intentId: ACTIVE, verdict: 'PASS', commitSha: SHA2, note: '', reworks: [{ vetoEntryId: 8, reworkCommit: SHA3 }] },
      ], 'a VETO never carries rework claims, and a PASS carries only the picked ones');
    } finally { ctx.cleanup(); }
  });

  test('#703: recording a review on one commit keeps the unsent note of another', async () => {
    fx.extraLinked = [SHA2];
    const ctx = setupDom();
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const reviewed = settled(renderer, 'review');
      await renderer.refresh();
      typeNote(ctx.doc, 'about the newest commit');
      pick(ctx.doc, '.cc-dlv-review-pick', SHA);
      q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').click();
      await reviewed();
      assert.deepEqual(ctx.posted, [{ url: REVIEW, body: { intentId: ACTIVE, verdict: 'PASS', commitSha: SHA, note: '' } }]);
      pick(ctx.doc, '.cc-dlv-review-pick', SHA2);
      assert.equal(value(ctx.doc, '.cc-dlv-review-note'), 'about the newest commit');
    } finally { ctx.cleanup(); }
  });

  for (const nextDraft of ['new unsent draft', 'submitted earlier']) {
    test(`#703: a later ${nextDraft === 'submitted earlier' ? 'same-text' : 'different-text'} edit survives a prior POST`, async () => {
      const ctx = setupDom();
      const hold = holdPosts(REVIEW);
      try {
        const renderer = new DeliveryAssessmentRenderer('workspace');
        const reviewed = settled(renderer, 'review');
        await renderer.refresh();
        typeNote(ctx.doc, 'submitted earlier');
        q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').click();
        assert.ok(hold.held(), 'POST must remain pending');
        typeNote(ctx.doc, nextDraft);
        hold.release();
        await reviewed();
        assert.deepEqual(ctx.posted, [
          { url: REVIEW, body: { intentId: ACTIVE, verdict: 'PASS', commitSha: SHA, note: 'submitted earlier' } },
        ]);
        assert.equal(q<HTMLInputElement>(ctx.doc, '.cc-dlv-review-note').value, nextDraft,
          'a newer unsent draft must not be cleared by completion of the older request');
      } finally { hold.release(); ctx.cleanup(); }
    });
  }

  test('#703: PASS and VETO cannot both submit across an overlapping repaint', async () => {
    const ctx = setupDom();
    const hold = holdPosts(REVIEW);
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const reviewed = settled(renderer, 'review');
      await renderer.refresh();
      const pass = q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass');
      pass.click();
      assert.equal(pass.disabled, true);
      const veto = q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-veto');
      assert.equal(veto.disabled, true, 'the opposite outcome must be unavailable while PASS is pending');
      // An HTTP snapshot can repaint the whole panel while an earlier review POST is pending.
      await renderer.refresh();
      const repaintedVeto = q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-veto');
      assert.notEqual(veto, repaintedVeto);
      assert.equal(repaintedVeto.disabled, true, 'a new panel must not bypass the in-flight guard');
      assert.equal(q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').disabled, true, 'the repainted PASS is disabled too');
      fire(ctx.doc, repaintedVeto, 'click');
      hold.release();
      await reviewed();
      assert.equal(ctx.posted.length, 1, 'only one backend review may be submitted');
      assert.equal(ctx.posted[0].body.verdict, 'PASS');
      assert.equal(q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-veto').disabled, false,
        'controls become available once the request completes');
    } finally { hold.release(); ctx.cleanup(); }
  });

  for (const failure of ['network', 'http'] as const) {
    test(`#703: a ${failure === 'network' ? 'rejected network' : 'refused (HTTP 409)'} POST keeps the note and re-enables review`, async () => {
      const ctx = setupDom();
      const hold = holdPosts(REVIEW, failure);
      try {
        const renderer = new DeliveryAssessmentRenderer('workspace');
        const reviewed = settled(renderer, 'review');
        await renderer.refresh();
        typeNote(ctx.doc, 'retry me');
        q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-pass').click();
        hold.release();
        await reviewed();
        assert.match(q(ctx.doc, '.cc-dlv-result')?.textContent || '', failure === 'network' ? /Recording the review failed: late network failure/ : /late refusal/);
        assert.equal(value(ctx.doc, '.cc-dlv-review-note'), 'retry me', 'a review that was not recorded keeps its note');
        const veto = q<HTMLButtonElement>(ctx.doc, '.cc-dlv-review-veto');
        assert.equal(veto.disabled, false, 'the operator may retry after failure');
        veto.click();
        await reviewed();
        assert.deepEqual(ctx.posted.map((p) => [p.body.verdict, p.body.note]), [['VETO', 'retry me']]);
      } finally { hold.release(); ctx.cleanup(); }
    });
  }
});

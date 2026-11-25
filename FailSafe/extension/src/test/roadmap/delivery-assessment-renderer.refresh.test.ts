// #703: overlapping refreshes and late operation results in the Workspace "Delivery" sub-view.
// An older GET (listing, detail, candidates, or a failure) must not change the selection, repaint
// a newer view or keep fetching; a late review or link result is shown only on the intent that
// initiated it, once. Each case suspends one request with an explicit promise gate, never a sleep.

import { strict as assert } from 'assert';
// @ts-expect-error untyped JS module
import { DeliveryAssessmentRenderer } from '../../../src/roadmap/ui/modules/delivery-assessment-renderer.js';
import { ACTIVE, INTENTS, SEALED, holdFirstGet, holdPosts, resetFixture, settled, setupDom } from './deliveryRendererFixture';

const DETAIL = `/api/v1/delivery/intents/${ACTIVE}`;
const REVIEW = '/api/actions/delivery/review';
const LINK = '/api/actions/delivery/link';
const click = (doc: Document, selector: string) => (doc.querySelector(selector) as HTMLButtonElement).click();

// Each case starts an operation on ACTIVE and views SEALED while it is pending; `expected` is the
// completion text then shown once on ACTIVE.
const LATE_RESULTS = [
  { name: 'successful review POST', url: REVIEW, fail: 'none', method: 'review', button: '.cc-dlv-review-pass', expected: /Review PASS recorded/ },
  { name: 'failed review POST', url: REVIEW, fail: 'network', method: 'review', button: '.cc-dlv-review-pass', expected: /Recording the review failed: late network failure/ },
  { name: 'refused review POST', url: REVIEW, fail: 'http', method: 'review', button: '.cc-dlv-review-pass', expected: /late refusal/ },
  { name: 'successful link POST', url: LINK, fail: 'none', method: 'post', button: '.cc-dlv-link-arch', expected: /Link recorded in the intent history/ },
  { name: 'refused link POST', url: LINK, fail: 'http', method: 'post', button: '.cc-dlv-link-arch', expected: /late refusal/ },
] as const;

suite('DeliveryAssessmentRenderer stale refresh and result attribution (#703, jsdom)', () => {
  setup(() => resetFixture());

  // The stale listing may differ from the current one: it is checked before it can select or paint.
  const STALE_LISTINGS: Array<[string, unknown]> = [
    ['the same', undefined], ['an invalid', { integrity: 'invalid' }], ['an empty', { integrity: 'valid', intents: [] }],
    ['a selection-less', { integrity: 'valid', intents: [INTENTS.intents[0]] }],
  ];
  for (const [kind, body] of STALE_LISTINGS) test(`#703: ${kind} stale listing response neither repaints, reselects nor fetches the details it would have chosen`, async () => {
    const ctx = setupDom();
    const hold = holdFirstGet('/api/v1/delivery/intents', { body });
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const earlier = renderer.refresh();
      await hold.started;
      renderer.selectedId = SEALED;
      await renderer.refresh();
      const panel = ctx.doc.querySelector('.cc-dlv');
      const fetchedBefore = ctx.fetched.length;
      hold.release();
      await earlier;
      assert.equal(ctx.doc.querySelector('.cc-dlv'), panel);
      assert.equal(renderer.selectedId, SEALED);
      assert.deepEqual(ctx.fetched.slice(fetchedBefore), ['/api/v1/delivery/intents'],
        'only the held listing completes; an obsolete refresh must stop at its first stale response');
    } finally { hold.release(); ctx.cleanup(); }
  });

  test('#703: a stale detail response cannot repaint a newer selected intent', async () => {
    const ctx = setupDom();
    const hold = holdFirstGet(DETAIL);
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const earlier = renderer.refresh();
      await hold.started;
      renderer.selectedId = SEALED; // Operator chose another intent while the detail GET was pending.
      await renderer.refresh();
      const currentPanel = ctx.doc.querySelector('.cc-dlv');
      assert.ok(currentPanel, 'the newly chosen intent must render');
      assert.match(currentPanel.textContent || '', /PROJ-6/);
      assert.equal(ctx.doc.querySelector('.cc-dlv-review-pass'), null, 'sealed intent cannot be reviewed');
      const fetchedBefore = ctx.fetched.length;
      hold.release();
      await earlier;
      assert.equal(ctx.doc.querySelector('.cc-dlv'), currentPanel,
        'an older response must not replace the newer selected view');
      assert.equal(renderer.selectedId, SEALED);
      assert.equal(ctx.doc.querySelector('.cc-dlv-review-pass'), null);
      assert.deepEqual(ctx.fetched.slice(fetchedBefore), [DETAIL], 'only the held detail completes; it must not fetch candidates');
    } finally { hold.release(); ctx.cleanup(); }
  });

  test('#703: delayed candidates from a previous intent cannot overwrite the newly selected view', async () => {
    const ctx = setupDom();
    const hold = holdFirstGet('/api/v1/delivery/candidates');
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const earlier = renderer.refresh();
      await hold.started;
      renderer.selectedId = SEALED;
      await renderer.refresh();
      const newPanel = ctx.doc.querySelector('.cc-dlv');
      assert.ok(newPanel);
      assert.match(newPanel.textContent || '', /PROJ-6/);
      hold.release();
      await earlier;
      assert.equal(ctx.doc.querySelector('.cc-dlv'), newPanel, 'stale candidates must not repaint');
      assert.equal(renderer.selectedId, SEALED);
      assert.equal(ctx.doc.querySelector('.cc-dlv-review-pass'), null);
    } finally { hold.release(); ctx.cleanup(); }
  });

  test('#703: an old failed GET must not overwrite a later successful Delivery view', async () => {
    const ctx = setupDom();
    const hold = holdFirstGet('/api/v1/delivery/intents', { failWith: 'stale transport failure' });
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const earlier = renderer.refresh();
      await hold.started;
      await renderer.refresh();
      const currentPanel = ctx.doc.querySelector('.cc-dlv');
      assert.ok(currentPanel);
      assert.match(currentPanel.textContent || '', /PROJ-7/);
      hold.release();
      await earlier;
      assert.equal(ctx.doc.querySelector('.cc-dlv'), currentPanel);
      assert.doesNotMatch(ctx.doc.querySelector('.cc-dlv')?.textContent || '', /stale transport failure/);
    } finally { hold.release(); ctx.cleanup(); }
  });

  test('#703: an old failed GET does not change the selected intent', async () => {
    const ctx = setupDom();
    const hold = holdFirstGet('/api/v1/delivery/intents', { failWith: 'stale' });
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const earlier = renderer.refresh();
      await hold.started;
      renderer.selectedId = SEALED;
      await renderer.refresh();
      hold.release();
      await earlier;
      assert.equal(renderer.selectedId, SEALED);
    } finally { hold.release(); ctx.cleanup(); }
  });

  test('#703: a held completion message is not consumed by an error panel and shows on the next view of its intent', async () => {
    const ctx = setupDom();
    const hold = holdPosts(REVIEW);
    try {
      const renderer = new DeliveryAssessmentRenderer('workspace');
      const reviewed = settled(renderer, 'review');
      await renderer.refresh();
      click(ctx.doc, '.cc-dlv-review-pass');
      const fail = holdFirstGet('/api/v1/delivery/intents', { failWith: 'down' });
      hold.release();
      fail.release();
      await reviewed();
      assert.equal(ctx.doc.querySelector('.cc-dlv-result'), null, 'not shown on the error panel');
      await renderer.refresh();
      assert.match(ctx.doc.querySelector('.cc-dlv-result')?.textContent || '', /Review PASS recorded/);
    } finally { hold.release(); ctx.cleanup(); }
  });

  for (const c of LATE_RESULTS) {
    test(`#703: a ${c.name} does not display its result on another intent`, async () => {
      const ctx = setupDom();
      const hold = holdPosts(c.url, c.fail);
      try {
        const renderer = new DeliveryAssessmentRenderer('workspace');
        const finished = settled(renderer, c.method);
        await renderer.refresh();
        click(ctx.doc, c.button);
        assert.ok(hold.held(), 'the operation must still be pending');
        renderer.selectedId = SEALED; // A different intent becomes visible while the POST is pending.
        await renderer.refresh();
        assert.match(ctx.doc.querySelector('.cc-dlv')?.textContent || '', /PROJ-6/);
        hold.release();
        await finished();
        assert.equal(renderer.selectedId, SEALED);
        assert.equal(ctx.doc.querySelector('.cc-dlv-result'), null,
          'an older intent operation must not be reported as this sealed intent result');
        assert.match(ctx.doc.querySelector('.cc-dlv')?.textContent || '', /PROJ-6/);
        renderer.selectedId = ACTIVE;
        await renderer.refresh();
        assert.match(ctx.doc.querySelector('.cc-dlv-result')?.textContent || '', c.expected);
        assert.equal(ctx.doc.querySelectorAll('.cc-dlv-result').length, 1,
          'completion may be displayed once, only on its initiating intent');
        await renderer.refresh();
        assert.equal(ctx.doc.querySelector('.cc-dlv-result'), null,
          'a consumed completion message may not replay on another refresh');
      } finally { hold.release(); ctx.cleanup(); }
    });
  }
});

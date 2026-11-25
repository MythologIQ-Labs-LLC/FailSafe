// #532 part B (plan-532b LD8/LD10): structural (jsdom) tests for the Workspace "Delivery" sub-view.
// jsdom checks structure only; the visual surface is checked in the installed VSIX (screenshots).
//
// Chips per status (recorded info, passing ok, failing fail, stale warn, missing bad, unavailable
// muted), records with hashes, ids, sha and tree, the fixed scope line, markup in repository strings
// stays text, and no link or unlink buttons for a sealed (archived) intent.
// plan-532c LD9: six steps with the review step, the legend, the intent decision labelled "not a
// review" with the forgeability note, governance kind and outcome, "Linked by" from the edge
// origin, and the Failing pill.
// plan-b320 LD9: the four outcome pills (Evidence complete except receipt, Awaiting review,
// Incomplete, Failing) with the complete line that never claims a receipt; "complete cannot be
// assessed" only while the ledger or git cannot be read; blocking items with their commit state;
// reviews with reviewer, what the confirmation proves and the ledger entry; Record PASS / Record
// VETO on a linked commit with a note, each posting once; none of it for a sealed intent.
// #703: the fixture lives in deliveryRendererFixture.ts; the race and review-form cases are in
// delivery-assessment-renderer.refresh.test.ts and delivery-assessment-renderer.review.test.ts.

import { strict as assert } from 'assert';
// @ts-expect-error untyped JS module
import { DeliveryAssessmentRenderer, DELIVERY_SCOPE_LINE, COMPLETE_LINE } from '../../../src/roadmap/ui/modules/delivery-assessment-renderer.js';
import { ACTIVE, DECISION_NOTE, SCOPE, SEALED, SHA, SHA2, TREE, fire, fx, resetFixture, settled, setupDom } from './deliveryRendererFixture';

suite('DeliveryAssessmentRenderer (#532 LD8, jsdom structural)', () => {
  setup(() => resetFixture());

  test('six steps with a chip per status, the overall outcome and its gaps; no "cannot be assessed" line while the ledger and git are readable', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const d = ctx.doc;
      const steps = [...d.querySelectorAll('.cc-dlv-step')].map((s) => [s.getAttribute('data-key'), s.getAttribute('data-status')]);
      assert.deepEqual(steps, [['issue', 'recorded'], ['architecture', 'stale'], ['code', 'recorded'], ['review', 'missing'], ['governance', 'recorded'], ['receipt', 'unavailable']]);
      const chip = (key: string) => d.querySelector(`.cc-dlv-step[data-key="${key}"] .cc-dlv-pill`)!;
      assert.match(chip('issue').className, /cc-dlv-pill-info/, 'recorded is not shown as a pass');
      assert.doesNotMatch(chip('issue').className, /cc-dlv-pill-ok/);
      assert.match(chip('architecture').className, /cc-dlv-pill-warn/);
      assert.match(chip('review').className, /cc-dlv-pill-bad/);
      assert.match(chip('receipt').className, /cc-dlv-pill-muted/);
      const o = d.querySelector('.cc-dlv-overall')?.textContent ?? '';
      assert.match(o, /Incomplete/);
      assert.match(o, /Governing architecture, Review, Governance evidence/);
      assert.equal(d.querySelector('.cc-dlv-unreachable'), null);
      assert.doesNotMatch(o, /B320|B321/);
    } finally { ctx.cleanup(); }
  });

  test('the four outcome pills; Complete reads "Evidence complete except receipt" and never claims a receipt', async () => {
    const seen: Array<[string, string]> = [];
    for (const o of ['evidence-complete-except-receipt', 'awaiting-review', 'incomplete', 'failing']) {
      fx.overall = o;
      const ctx = setupDom();
      try {
        await new DeliveryAssessmentRenderer('workspace').refresh();
        const pill = ctx.doc.querySelector('.cc-dlv-overall .cc-dlv-pill')!;
        seen.push([pill.textContent ?? '', pill.className.replace('cc-dlv-pill ', '')]);
        if (o === 'evidence-complete-except-receipt') {
          assert.equal(ctx.doc.querySelector('.cc-dlv-complete')?.textContent, COMPLETE_LINE);
          assert.match(COMPLETE_LINE, /except receipt \(the receipt needs the ledger repair, #467\)\. New evidence will need a fresh review\./);
          assert.doesNotMatch(ctx.doc.querySelector('.cc-dlv-overall')?.textContent ?? '', /receipt issued|receipt recorded/i);
        }
      } finally { ctx.cleanup(); }
    }
    assert.deepEqual(seen, [
      ['Evidence complete except receipt', 'cc-dlv-pill-ok'], ['Awaiting review', 'cc-dlv-pill-warn'],
      ['Incomplete', 'cc-dlv-pill-warn'], ['Failing', 'cc-dlv-pill-fail'],
    ]);
  });

  test('complete cannot be assessed only while the ledger or git cannot be read', async () => {
    fx.reachable = ['ledger-unavailable', 'git-unavailable'];
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      assert.equal(ctx.doc.querySelector('.cc-dlv-unreachable')?.textContent, 'Complete cannot be assessed while the ledger is unavailable and git is unavailable.');
    } finally { ctx.cleanup(); }
  });

  test('the review step lists blocking items with their commit state and reviews with reviewer, proof and ledger entry', async () => {
    fx.overall = 'failing';
    fx.reviewOverride = {
      status: 'failing', reason: 'Rejected by review: VETO on a (ledger entry #8). (and 1 more blocking item)',
      records: [
        { record: 'blocking', kind: 'veto', id: 8, hash: 'h'.repeat(64), label: 'Rejected by review: VETO on a.', verdict: 'VETO', commitSha: SHA, commitState: 'sealed', note: 'missing tests' },
        { record: 'blocking', kind: 'bad-seal', id: 9, hash: 'k'.repeat(64), label: 'Review record unverifiable: ledger entry #9 fails its seal.', commitSha: SHA2, commitState: 'recorded, unverified' },
        { record: 'review', reviewId: 'rid-1', verdict: 'VETO', commitSha: SHA, tree: TREE, covers: [SHA], evidenceCount: 3, evidenceDigest: 'z'.repeat(64),
          supersedes: [], note: 'missing tests', reviewerDid: 'did:myth:overseer:local', proves: 'A person approved a modal VS Code dialog. This does not identify which local process sent the request.',
          entryId: 8, entryHash: 'h'.repeat(64), timestamp: 't' },
      ],
    };
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const text = ctx.doc.querySelector('.cc-dlv-step[data-key="review"]')?.textContent ?? '';
      assert.match(text, new RegExp(`Commit${SHA} \\(sealed\\)`));
      assert.match(text, new RegExp(`Commit${SHA2} \\(recorded, unverified\\)`));
      assert.match(text, /Reviewerdid:myth:overseer:local/);
      assert.match(text, /ProvesA person approved a modal VS Code dialog\. This does not identify/);
      assert.match(text, /Ledger entry#8 h{64} \(seal verified\)/);
      assert.match(text, /Notemissing tests/);
    } finally { ctx.cleanup(); }
  });

  test('Record PASS and Record VETO on a linked commit, with a note, each post once; a sealed intent has no review controls', async () => {
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      const reviewed = settled(r, 'review');
      const refreshed = settled(r, 'refresh');
      await r.refresh();
      const d = ctx.doc;
      const options = [...d.querySelectorAll('.cc-dlv-review-pick option')].map((o) => (o as HTMLOptionElement).value);
      assert.deepEqual(options, [SHA], 'only linked commits can be reviewed');
      (d.querySelector('.cc-dlv-review-note') as HTMLInputElement).value = 'ship it';
      (d.querySelector('.cc-dlv-review-pass') as HTMLButtonElement).click();
      await reviewed();
      (d.querySelector('.cc-dlv-review-veto') as HTMLButtonElement).click();
      await reviewed();
      assert.deepEqual(ctx.posted, [
        { url: '/api/actions/delivery/review', body: { intentId: ACTIVE, verdict: 'PASS', commitSha: SHA, note: 'ship it' } },
        { url: '/api/actions/delivery/review', body: { intentId: ACTIVE, verdict: 'VETO', commitSha: SHA, note: '' } },
      ]);
      const picker = d.querySelector('.cc-dlv-picker') as HTMLSelectElement;
      picker.value = SEALED;
      for (let i = 0; i < 3; i++) await refreshed(); // the first load and the refresh after each review
      fire(d, picker, 'change');
      await refreshed();
      assert.equal(d.querySelectorAll('.cc-dlv-review-pass, .cc-dlv-review-veto, .cc-dlv-review-pick').length, 0);
    } finally { ctx.cleanup(); }
  });

  test('the legend names all six statuses with distinct chips', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const pills = [...ctx.doc.querySelectorAll('.cc-dlv-legend .cc-dlv-pill')];
      assert.deepEqual(pills.map((p) => p.textContent), ['Recorded', 'Passing', 'Failing', 'Stale', 'Missing', 'Unavailable']);
      assert.equal(new Set(pills.map((p) => p.className)).size, 6, 'each status has its own chip class');
      assert.match(ctx.doc.querySelector('.cc-dlv-legend')?.textContent ?? '', /Recorded means present, not passed/);
    } finally { ctx.cleanup(); }
  });

  test('the intent decision: approved for implementation (not a review), with the provenance note; review stays missing', async () => {
    fx.decision = { status: 'PASS', actor: 'judge', timestamp: '2026-10-19T00:00:00.000Z', entryHash: 'p'.repeat(64) };
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const head = ctx.doc.querySelector('.cc-dlv-intent')?.textContent ?? '';
      assert.match(head, /Intent decision: approved for implementation \(not a review\)/);
      assert.match(head, /judge/);
      assert.ok(head.includes(DECISION_NOTE));
      assert.match(head, /Created by user/);
      assert.ok(head.includes('e'.repeat(64)));
      const review = ctx.doc.querySelector('.cc-dlv-step[data-key="review"]')!;
      assert.equal(review.getAttribute('data-status'), 'missing');
      assert.match(review.textContent ?? '', /Awaiting review/);
      assert.ok((review.textContent ?? '').includes('p'.repeat(64)));
    } finally { ctx.cleanup(); }
  });

  test('a vetoed intent: review Failing, the Failing pill, "vetoed" in the header', async () => {
    fx.decision = { status: 'VETO', actor: 'judge', timestamp: 't', entryHash: 'v'.repeat(64) };
    fx.overall = 'failing';
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const d = ctx.doc;
      const chip = d.querySelector('.cc-dlv-step[data-key="review"] .cc-dlv-pill')!;
      assert.equal(chip.textContent, 'Failing');
      assert.match(chip.className, /cc-dlv-pill-fail/);
      assert.match(d.querySelector('.cc-dlv-step[data-key="review"]')?.textContent ?? '', /Intent vetoed/);
      const pill = d.querySelector('.cc-dlv-overall .cc-dlv-pill')!;
      assert.equal(pill.textContent, 'Failing');
      assert.match(d.querySelector('.cc-dlv-intent')?.textContent ?? '', /Intent decision: vetoed/);
    } finally { ctx.cleanup(); }
  });

  test('governance records show kind and outcome; edge records show who linked them', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const gov = ctx.doc.querySelector('.cc-dlv-step[data-key="governance"]')?.textContent ?? '';
      assert.match(gov, /Kind.*policy decision/);
      assert.match(gov, /Outcome.*denied/);
      assert.doesNotMatch(gov, /Matched by/);
      const code = ctx.doc.querySelector('.cc-dlv-step[data-key="code"]')?.textContent ?? '';
      assert.match(code, /Linked by.*FailSafe organize \(governed commit\)/);
      const arch = ctx.doc.querySelector('.cc-dlv-step[data-key="architecture"]')?.textContent ?? '';
      assert.match(arch, /Linked by.*Workspace > Delivery/);
    } finally { ctx.cleanup(); }
  });

  test('records show hashes, ids, sha and tree; the architecture record says HEAD at link time', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const text = ctx.doc.querySelector('.cc-dlv')?.textContent ?? '';
      for (const v of ['c'.repeat(64), 'e'.repeat(64), 'd'.repeat(64), 'f'.repeat(64), SHA, TREE, 'PROJ-7', 'src/a.ts']) {
        assert.ok(text.includes(v), `record value ${v.slice(0, 12)} shown`);
      }
      assert.match(text, /HEAD at link time/);
      assert.match(text, /Blocked on the damaged ledger \(#467\), B216\./);
    } finally { ctx.cleanup(); }
  });

  test('the fixed scope line is shown verbatim', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      assert.equal(DELIVERY_SCOPE_LINE, SCOPE);
      assert.equal(ctx.doc.querySelector('.cc-dlv-scope')?.textContent, SCOPE);
    } finally { ctx.cleanup(); }
  });

  test('markup in purposes, paths, subjects and file names stays text', async () => {
    const ctx = setupDom();
    try {
      await new DeliveryAssessmentRenderer('workspace').refresh();
      const root = ctx.doc.querySelector('.cc-dlv')!;
      assert.equal(root.querySelectorAll('img, b, i, script').length, 0, 'no element was created from a string');
      assert.ok((root.textContent ?? '').includes('<b>docs/RUNTIME.md</b>'));
      assert.ok((root.textContent ?? '').includes('<img src=x onerror="window.__pwned=1">PROJ-7'));
      assert.ok((root.textContent ?? '').includes('seed <script>alert(1)</script>'));
    } finally { ctx.cleanup(); }
  });

  test('the active intent offers Link architecture, Link commit and Unlink; already-linked targets are not offered; each posts once', async () => {
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      const linked = settled(r, 'post');
      await r.refresh();
      const d = ctx.doc;
      assert.equal(d.querySelectorAll('.cc-dlv-unlink').length, 2);
      const archOptions = [...d.querySelectorAll('.cc-dlv-arch-pick option')].map((o) => (o as HTMLOptionElement).value);
      assert.deepEqual(archOptions, ['storage'], 'the linked row is not offered again');
      const commitOptions = [...d.querySelectorAll('.cc-dlv-commit-pick option')].map((o) => (o as HTMLOptionElement).value);
      assert.deepEqual(commitOptions, [SHA2], 'the linked commit is not offered again');
      (d.querySelector('.cc-dlv-link-arch') as HTMLButtonElement).click();
      await linked();
      (d.querySelector('.cc-dlv-link-commit') as HTMLButtonElement).click();
      await linked();
      assert.deepEqual(ctx.posted, [
        { url: '/api/actions/delivery/link', body: { intentId: ACTIVE, edge: 'implements', target: 'storage' } },
        { url: '/api/actions/delivery/link', body: { intentId: ACTIVE, edge: 'committed-under', target: SHA2 } },
      ]);
      assert.ok(ctx.fetched.every((u) => u.startsWith('/api/')), 'every fetch target is relative');
    } finally { ctx.cleanup(); }
  });

  test('a sealed intent is read-only: no link or unlink buttons and no candidate fetch', async () => {
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      await r.refresh();
      const refreshed = settled(r, 'refresh');
      const picker = ctx.doc.querySelector('.cc-dlv-picker') as HTMLSelectElement;
      picker.value = SEALED;
      fire(ctx.doc, picker, 'change');
      await refreshed();
      const d = ctx.doc;
      assert.equal(d.querySelector('.cc-dlv')?.getAttribute('data-intent'), SEALED);
      assert.equal(d.querySelectorAll('.cc-dlv-link-arch, .cc-dlv-link-commit, .cc-dlv-unlink').length, 0);
      assert.match(d.querySelector('.cc-dlv')?.textContent ?? '', /sealed/i);
      const after = ctx.fetched.slice(ctx.fetched.lastIndexOf(`/api/v1/delivery/intents/${SEALED}`));
      assert.equal(after.includes('/api/v1/delivery/candidates'), false);
    } finally { ctx.cleanup(); }
  });

  test('B344 (red-first): "Reworked by" appears only on trusted VETO records, and Record PASS posts the chosen reworks once', async () => {
    fx.overall = 'failing';
    fx.reviewOverride = {
      status: 'failing', reason: 'Rejected by review: VETO on 9',
      records: [
        { record: 'blocking', kind: 'veto', id: 8, hash: 'h'.repeat(64), label: 'Rejected by review: VETO.', verdict: 'VETO', commitSha: SHA2, commitState: 'sealed' },
        { record: 'blocking', kind: 'bad-seal', id: 9, hash: 'k'.repeat(64), label: 'Review record unverifiable.', commitSha: null, commitState: null },
      ],
    };
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      const reviewed = settled(r, 'review');
      await r.refresh();
      const d = ctx.doc;
      const selects = [...d.querySelectorAll('.cc-dlv-rework-pick')] as HTMLSelectElement[];
      assert.equal(selects.length, 1, 'only the trusted VETO record offers a rework');
      assert.equal(selects[0].getAttribute('data-veto'), '8');
      assert.deepEqual([...selects[0].options].map((o) => o.value), ['', SHA], 'none, or a linked commit other than the vetoed one');
      selects[0].value = SHA;
      (d.querySelector('.cc-dlv-review-pass') as HTMLButtonElement).click();
      await reviewed();
      assert.deepEqual(ctx.posted, [
        { url: '/api/actions/delivery/review', body: { intentId: ACTIVE, verdict: 'PASS', commitSha: SHA, note: '', reworks: [{ vetoEntryId: 8, reworkCommit: SHA }] } },
      ]);
    } finally { ctx.cleanup(); }
  });
});

// Judge-only probe (iteration-4 auditor). To use: copy into src/test/roadmap/ of a scratch tree as delivery-assessment-renderer.zjudgeprobe.test.ts, run run703.sh; never commit under FailSafe/.
import { strict as assert } from 'assert';
// @ts-expect-error untyped JS module
import { DeliveryAssessmentRenderer } from '../../../src/roadmap/ui/modules/delivery-assessment-renderer.js';
import { ACTIVE, SEALED, SHA, SHA2, INTENTS, fire, fx, resetFixture, setupDom } from './deliveryRendererFixture';

const SHA3 = '7'.repeat(40);
type FetchFn = (url: string, init?: { method?: string; body?: string }) => Promise<unknown>;
function holdListing(body: unknown) {
  const g = global as unknown as { fetch: FetchFn };
  const prior = g.fetch; let release!: () => void; let announce!: () => void; let first = true;
  const started = new Promise<void>((r) => { announce = r; });
  const gate = new Promise<void>((r) => { release = r; });
  g.fetch = async (u, init) => {
    if (first && u === '/api/v1/delivery/intents') { first = false; announce(); await gate; return { ok: true, status: 200, json: async () => body }; }
    return prior(u, init);
  };
  return { started, release };
}
const pick = (doc: Document, sel: string, v: string) => { const s = doc.querySelector(sel) as HTMLSelectElement; s.value = v; fire(doc, s, 'change'); };
const vetoes = (...on: Array<[number, string]>) => ({ status: 'failing', reason: 'r',
  records: on.map(([id, commitSha]) => ({ record: 'blocking', kind: 'veto', id, hash: 'h'.repeat(64), label: 'v', verdict: 'VETO', commitSha, commitState: 'sealed' })) });

suite('JUDGE PROBES', () => {
  setup(() => resetFixture());
  const staleListing = (name: string, body: unknown) => test(`PROBE-X8-${name}: a stale listing neither repaints nor changes the selection`, async () => {
    const ctx = setupDom();
    const hold = holdListing(body);
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      const earlier = r.refresh();
      await hold.started;
      r.selectedId = SEALED;
      await r.refresh();
      const panel = ctx.doc.querySelector('.cc-dlv');
      hold.release();
      await earlier;
      assert.equal(ctx.doc.querySelector('.cc-dlv'), panel, 'no repaint');
      assert.equal(r.selectedId, SEALED, 'selection unchanged');
    } finally { hold.release(); ctx.cleanup(); }
  });
  staleListing('invalid', { integrity: 'invalid' });
  staleListing('empty', { integrity: 'valid', intents: [] });
  staleListing('lacks-selected', { integrity: 'valid', intents: [INTENTS.intents[0]] });

  test('PROBE-Y13: rework pick kept when the picked commit is unlinked', async () => {
    fx.extraLinked = [SHA2, SHA3];
    fx.reviewOverride = vetoes([8, SHA2]);
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      await r.refresh();
      pick(ctx.doc, '.cc-dlv-review-pick', SHA3);
      pick(ctx.doc, '.cc-dlv-rework-pick[data-veto="8"]', SHA);
      fx.extraLinked = [SHA2];
      await r.refresh();
      assert.equal((ctx.doc.querySelector('.cc-dlv-review-pick') as HTMLSelectElement).value, SHA2);
      assert.equal((ctx.doc.querySelector('.cc-dlv-rework-pick[data-veto="8"]') as HTMLSelectElement).value, SHA, 'rework kept');
    } finally { ctx.cleanup(); }
  });

  test('PROBE-N-default: a note typed on the default commit after a new link', async () => {
    const ctx = setupDom();
    try {
      const r = new DeliveryAssessmentRenderer('workspace');
      await r.refresh();
      const note = ctx.doc.querySelector('.cc-dlv-review-note') as HTMLInputElement;
      note.value = 'on the only commit'; fire(ctx.doc, note, 'input');
      fx.extraLinked = [SHA2];
      await r.refresh();
      const info = [(ctx.doc.querySelector('.cc-dlv-review-pick') as HTMLSelectElement).value === SHA2 ? 'pick=SHA2(newest)' : 'pick=SHA', (ctx.doc.querySelector('.cc-dlv-review-note') as HTMLInputElement).value];
      console.log('      INFO', JSON.stringify(info));
      void ACTIVE;
    } finally { ctx.cleanup(); }
  });
});

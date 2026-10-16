// #477 O14 (jsdom, structural): the Console Timeline shows each entry's title
// (timeline entries carry `title`, not `summary`/`type`) and offers an
// Imported filter that asks the route for `categories=imported`.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { TimelineRenderer } from '../../../src/roadmap/ui/modules/timeline.js';

interface G { window?: unknown; document?: unknown; fetch?: unknown }

const ENTRIES = {
  entries: [
    { id: 'imp', timestamp: '2026-10-10T10:00:00.000Z', category: 'imported', title: 'OpenHands (historical import): action execute_bash', detail: 'd', icon: 'archive', severity: 'warning' },
    { id: 'v', timestamp: '2026-10-10T09:00:00.000Z', category: 'verdict', title: 'Verdict: PASS (a.ts)', detail: '', icon: 'shield', severity: 'info' },
  ],
};

suite('Console TimelineRenderer (#477 O14, jsdom structural)', () => {
  test('entries show their titles and the Imported filter requests categories=imported', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="tl"></div></body></html>', { url: 'http://localhost:9999' });
    const g = global as unknown as G;
    const prev = { window: g.window, document: g.document, fetch: g.fetch };
    const urls: string[] = [];
    g.window = dom.window;
    g.document = dom.window.document;
    g.fetch = async (url: string) => { urls.push(url); return { ok: true, json: async () => ENTRIES }; };
    try {
      const r = new TimelineRenderer('tl');
      await r.render();
      // The heading line of each row must be the title itself; the raw JSON in
      // the collapsed detail also contains it, so match a whole element.
      const lines = Array.from(dom.window.document.querySelectorAll('.cc-timeline-entry div')).map((d) => d.textContent?.trim());
      assert.ok(lines.includes('OpenHands (historical import): action execute_bash'), lines.join(' | '));
      assert.ok(lines.includes('Verdict: PASS (a.ts)'), lines.join(' | '));
      const btn = dom.window.document.querySelector('.cc-tl-cat[data-cat="Imported"]') as HTMLButtonElement;
      assert.ok(btn, 'Imported filter button');
      btn.click();
      await new Promise((res) => setTimeout(res, 10));
      assert.ok(urls.some((u) => u.includes('categories=imported')), urls.join(', '));
    } finally {
      g.window = prev.window; g.document = prev.document; g.fetch = prev.fetch;
    }
  });
});

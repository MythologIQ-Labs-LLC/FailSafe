// #652 negative contract for the Statewright website handoff (audit VETO #938,
// B2 and B3): nothing reaches Statewright unless the operator activates the one
// link, and the card claims no connection, sign-in, data or partnership. Each
// assertion below exists because a source mutation survived the earlier tests.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { IntegrationCatalogRenderer } from '../../../src/roadmap/ui/modules/integration-catalog-renderer.js';

const URL_RUNS = 'https://statewright.ai/runs';
const CARD_TEXT =
  "Statewright AIWebsite handoff View your workflow runs and transition history on Statewright's website. " +
  'Statewright handles sign-in and run data. FailSafe does not read Statewright history or enforce Statewright workflows. ' +
  `Open Statewright Run History ${URL_RUNS}`;
const ITEM = { id: 'jira', label: 'Jira', category: 'Issue Tracker', summary: 'Imports Jira issues.', docsId: 'jira', configHint: 'Set token.', enabled: true, configured: true, state: 'connected', missingKeys: [] };

type FetchImpl = (url: string) => Promise<unknown>;
interface Activity { fetches: string[]; opened: unknown[]; timers: number; clicks: number }
interface Ctx { doc: Document; activity: Activity; cleanup: () => void }
type Globals = Record<string, unknown>;

/** A jsdom page that records everything the renderer could use to leave it. */
function setupDom(fetchImpl: FetchImpl): Ctx {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="integrations"></div></body></html>', { url: 'http://localhost:9999/?workspace=C%3A%5Csecret' });
  const g = global as unknown as Globals;
  const names = ['window', 'document', 'fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame'];
  const prev = names.map((n) => [n, g[n]] as const);
  const activity: Activity = { fetches: [], opened: [], timers: 0, clicks: 0 };
  const timer = () => { activity.timers += 1; return 0; };
  dom.window.open = ((...a: unknown[]) => { activity.opened.push(a); return null; }) as typeof dom.window.open;
  dom.window.HTMLElement.prototype.click = function click() { activity.clicks += 1; };
  Object.assign(dom.window, { setTimeout: timer, setInterval: timer, requestAnimationFrame: timer });
  Object.assign(g, { window: dom.window, document: dom.window.document, setTimeout: timer, setInterval: timer, requestAnimationFrame: timer,
    fetch: (url: string) => { activity.fetches.push(String(url)); return fetchImpl(url); } });
  return { doc: dom.window.document as unknown as Document, activity, cleanup: () => { for (const [n, v] of prev) g[n] = v; } };
}

const ok = (body: unknown): FetchImpl => async () => ({ ok: true, json: async () => body });
const STATES: Array<[string, FetchImpl, boolean]> = [
  ['loaded catalog', ok({ integrations: [ITEM] }), true],
  ['empty catalog', ok({ integrations: [] }), true],
  ['HTTP 500 with a JSON error body', async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }), true],
  ['non-JSON response', async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } }), true],
  ['rejected fetch', async () => { throw new Error('network down'); }, true],
  ['catalog still loading', () => new Promise(() => { /* never settles */ }), false],
];

async function renderState(fetchImpl: FetchImpl, settles: boolean): Promise<Ctx> {
  const ctx = setupDom(fetchImpl);
  const done = new IntegrationCatalogRenderer('integrations').render();
  if (settles) await done;
  else await Promise.resolve();
  return ctx;
}

const text = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const attrs = (el: Element): Record<string, string> => Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value]));

/** Every element attribute in the page whose value mentions Statewright, as tag[attribute]. */
function statewrightRefs(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('*'))
    .flatMap((el) => Array.from(el.attributes).filter((a) => /statewright/i.test(a.value)).map((a) => `${el.tagName.toLowerCase()}[${a.name}]`))
    .sort();
}

suite('#652 Statewright website handoff: negative contract (jsdom)', () => {
  for (const [name, fetchImpl, settles] of STATES) {
    test(`${name}: exactly one card, placed after the status line, with nothing but the one link`, async () => {
      const ctx = await renderState(fetchImpl, settles);
      try {
        const cards = ctx.doc.querySelectorAll('.cc-intcat-statewright');
        assert.equal(cards.length, 1, 'one Statewright card');
        const card = cards[0];
        assert.equal(card.previousElementSibling?.className, 'cc-intcat-sub', 'card follows the status line in every state');
        assert.equal(text(card), CARD_TEXT, 'the copy is exactly the reviewed text: no connection, sign-in, data or partner claim');
        const pills = card.querySelectorAll('[class*="pill"]');
        assert.equal(pills.length, 1, 'one pill only');
        assert.equal(pills[0].className, 'cc-intcat-pill', 'the pill carries no status class');
        assert.equal(text(pills[0]), 'Website handoff');
        assert.equal(card.querySelectorAll('button, input, select, textarea, form, img, iframe, script, link, object, embed, video, audio, source, style, meta').length, 0, 'no control or loadable element in the card');
        const links = card.querySelectorAll('a');
        assert.equal(links.length, 1, 'one link only');
        assert.deepEqual(attrs(links[0]), { class: 'cc-intcat-web-link', href: URL_RUNS, target: '_blank', rel: 'noopener noreferrer' }, 'no ping, tabindex, aria-hidden, download or handler attribute');
        assert.deepEqual(attrs(card), { class: 'cc-intcat-statewright', 'data-id': 'statewright', 'aria-label': 'Statewright AI website integration' });
      } finally { ctx.cleanup(); }
    });

    test(`${name}: rendering starts no navigation, timer, click or provider request`, async () => {
      const ctx = await renderState(fetchImpl, settles);
      try {
        assert.deepEqual(ctx.activity, { fetches: ['/api/v1/integrations/catalog'], opened: [], timers: 0, clicks: 0 });
        assert.deepEqual(statewrightRefs(ctx.doc), ['a[href]', 'section[aria-label]', 'section[class]', 'section[data-id]'], 'no other element in the page refers to Statewright (preconnect, prefetch, beacon)');
        assert.equal(ctx.doc.querySelectorAll('head link, head script, head meta[http-equiv]').length, 0, 'nothing loadable is added to the document head');
        assert.ok(!/localhost|workspace|secret/i.test(ctx.doc.querySelector('.cc-intcat-statewright')!.outerHTML), 'no page or workspace value is written into the card');
      } finally { ctx.cleanup(); }
    });
  }
});

// #652 negative contract for the Statewright website handoff (audit VETO #938,
// B2 and B3): nothing reaches Statewright unless the operator activates the one
// link, and the card claims no connection, sign-in, data or partnership. Each
// assertion below exists because a source mutation survived the earlier tests.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { IntegrationCatalogRenderer } from '../../../src/roadmap/ui/modules/integration-catalog-renderer.js';

const URL_RUNS = 'https://statewright.ai/runs';
const CARD_TEXT =
  "Statewright AIWebsite handoff View your workflow runs and transition history on Statewright's website. " +
  'Statewright handles sign-in and run data. FailSafe does not read Statewright history or enforce Statewright workflows. ' +
  `Open Statewright Run History ${URL_RUNS}`;
const ITEM = { id: 'jira', label: 'Jira', category: 'Issue Tracker', summary: 'Imports Jira issues.', docsId: 'jira', configHint: 'Set token.', enabled: true, configured: true, state: 'connected', missingKeys: [] };

// The catalog's own status line: loading, failure, empty, or the counts sentence that ends "does not probe."
const STATUS_LINE = /^(Loading…|Could not load integrations: [^.]*|No catalog integrations available\.|\d+ integrations — \d+ observed connection or format results, \d+ failing, \d+ configured but unverified or stale\. A recent call is not end-to-end qualification or proof of customer value\. Status comes from a stored last call; this catalog does not probe\.)$/;

type FetchImpl = (url: string) => Promise<unknown>;
interface Activity { fetches: string[]; opened: unknown[]; timers: number; clicks: number }
interface Ctx { doc: Document; activity: Activity; cleanup: () => void }
type Globals = Record<string, unknown>;

/** A jsdom page that records everything the renderer could use to leave it. */
function setupDom(fetchImpl: FetchImpl): Ctx {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="integrations"></div></body></html>', { url: 'http://localhost:9999/?workspace=C%3A%5Csecret' });
  const g = global as unknown as Globals;
  const names = ['window', 'document', 'fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'WebSocket', 'EventSource', 'XMLHttpRequest'];
  const prev = names.map((n) => [n, g[n]] as const);
  const activity: Activity = { fetches: [], opened: [], timers: 0, clicks: 0 };
  const timer = () => { activity.timers += 1; return 0; };
  // Global timers are counted and still run, so a timer owned by the test host is never lost.
  const counted = (real: unknown) => (...a: unknown[]) => { activity.timers += 1; return (real as (...x: unknown[]) => unknown)(...a); };
  dom.window.open = ((...a: unknown[]) => { activity.opened.push(a); return null; }) as typeof dom.window.open;
  dom.window.HTMLElement.prototype.click = function click() { activity.clicks += 1; };
  // Every way out of the page is recorded and never connects, both as a Node global and on the jsdom window
  // (audit VETO #945): sockets, event streams, XMLHttpRequest and fetch.
  const channel = (kind: string) => function Channel(url: unknown) { activity.opened.push([kind, String(url)]); };
  const record = (url: string) => { activity.fetches.push(String(url)); return fetchImpl(url); };
  function Xhr(this: { open: (m: string, u: string) => void; send: () => void }) {
    this.open = (m, u) => { activity.opened.push(['XMLHttpRequest', String(u)]); };
    this.send = () => undefined;
  }
  Object.assign(dom.window, { setTimeout: timer, setInterval: timer, requestAnimationFrame: timer,
    WebSocket: channel('WebSocket'), EventSource: channel('EventSource'), XMLHttpRequest: Xhr, fetch: record });
  Object.assign(g, { window: dom.window, document: dom.window.document, setTimeout: counted(g.setTimeout), setInterval: counted(g.setInterval), requestAnimationFrame: timer,
    WebSocket: channel('WebSocket'), EventSource: channel('EventSource'), XMLHttpRequest: Xhr, fetch: record });
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

const EVENTS = ['pointerover', 'mouseover', 'mouseenter', 'pointerdown', 'mousedown', 'mouseup', 'focusin', 'keydown', 'contextmenu', 'auxclick'];
/** Send every pointer and key event that is not an activation to each target. */
function poke(win: Window, targets: Element[]): void {
  const Ev = (win as unknown as { Event: typeof Event }).Event;
  for (const target of targets) EVENTS.forEach((type) => target.dispatchEvent(new Ev(type, { bubbles: true, cancelable: true })));
}

function cardContract(name: string, fetchImpl: FetchImpl, settles: boolean): void {
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
      const inner = Array.from(card.querySelectorAll('*')).filter((el) => el !== links[0]);
      assert.deepEqual(inner.map((el) => Object.keys(attrs(el)).join()), ['class', '', 'class', '', 'class', 'class'], 'no title, aria-label or other attribute on the heading, pill, text or address');
    } finally { ctx.cleanup(); }
  });
}

const MODULES = path.resolve(__dirname, '..', '..', '..', 'src', 'roadmap', 'ui', 'modules');
const source = (name: string): string => fs.readFileSync(path.join(MODULES, name), 'utf8').replace(/\r\n/g, '\n');
/** The text of a template-literal constant `name` in `file`, as the module defines it. */
function constantText(file: string, name: string): string {
  const src = source(file);
  const open = `const ${name} = \``;
  const start = src.indexOf(open) + open.length;
  return src.slice(start, src.indexOf('`;', start));
}

/** The page holds one style element, and it is exactly the two reviewed sheets (audit #945, observation O1). */
function stylesInstalled(name: string, fetchImpl: FetchImpl, settles: boolean): void {
  test(`${name}: the only styles installed are the catalog sheet followed by the card sheet`, async () => {
    const ctx = await renderState(fetchImpl, settles);
    try {
      const sheets = Array.from(ctx.doc.querySelectorAll('style'));
      assert.equal(sheets.length, 1, 'one style element');
      assert.equal(sheets[0].id, 'cc-intcat-style');
      assert.equal(sheets[0].textContent, constantText('integration-catalog-renderer.js', 'STYLE') + constantText('statewright-handoff.js', 'STATEWRIGHT_STYLES'));
      assert.equal(ctx.doc.querySelectorAll('link, [style]').length, 0, 'no linked style sheet or inline style');
    } finally { ctx.cleanup(); }
  });
}

function renderIsInert(name: string, fetchImpl: FetchImpl, settles: boolean): void {
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

function eventsChangeNothing(name: string, fetchImpl: FetchImpl, settles: boolean): void {
  test(`${name}: pointer and key events change nothing, and no text outside the card names Statewright`, async () => {
    const ctx = await renderState(fetchImpl, settles);
    try {
      const win = ctx.doc.defaultView as unknown as Window;
      const card = ctx.doc.querySelector('.cc-intcat-statewright')!;
      const link = card.querySelector('a')!;
      poke(win, [card, link, ctx.doc.getElementById('integrations')!]);
      assert.deepEqual(attrs(link), { class: 'cc-intcat-web-link', href: URL_RUNS, target: '_blank', rel: 'noopener noreferrer' }, 'no event rewrites the link');
      assert.deepEqual(ctx.activity, { fetches: ['/api/v1/integrations/catalog'], opened: [], timers: 0, clicks: 0 }, 'no event opens, schedules or requests anything');
      const rest = ctx.doc.body.cloneNode(true) as HTMLElement;
      rest.querySelector('.cc-intcat-statewright')!.remove();
      assert.ok(!/statewright/i.test(rest.textContent ?? ''), 'no status line or other card names Statewright');
      assert.ok(!/statewright/i.test(ctx.doc.title), 'the page title is unchanged');
      const shape = Array.from(ctx.doc.querySelector('.cc-intcat')!.children).map((el) => `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`);
      assert.deepEqual(shape.slice(0, 3), ['h3.', 'p.cc-intcat-sub', 'section.cc-intcat-statewright'], 'one heading, one status line, then the card');
      assert.deepEqual(shape.slice(3).filter((c) => c !== 'div.cc-intcat-group' && c !== 'div.cc-intcat-card'), [], 'nothing else beside the catalog groups and cards');
      assert.match(text(ctx.doc.querySelector('.cc-intcat-sub')!), STATUS_LINE, 'the status line is one of the four catalog messages, with no added claim');
    } finally { ctx.cleanup(); }
  });
}

suite('#652 Statewright website handoff: negative contract (jsdom)', () => {
  for (const [name, fetchImpl, settles] of STATES) {
    cardContract(name, fetchImpl, settles);
    renderIsInert(name, fetchImpl, settles);
    eventsChangeNothing(name, fetchImpl, settles);
    stylesInstalled(name, fetchImpl, settles);
  }
});

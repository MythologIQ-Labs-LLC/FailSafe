/**
 * #538 lane B (plan-538b LD10): every Console install caller tells the operator to confirm
 * in VS Code while the request is open, then says why nothing ran (declined, busy,
 * expired, unwired) or shows the server's refusal text. The server's `error` field is
 * deliberately different from the expected copy, so the rows prove the callers map the
 * `confirmation` field rather than echo the error.
 */
import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { McpCatalogRenderer } from '../../../src/roadmap/ui/modules/mcp-catalog-renderer.js';
// @ts-expect-error untyped JS module
import { AgtRenderer } from '../../../src/roadmap/ui/modules/agt-renderer.js';
// @ts-expect-error untyped JS module
import { AdapterPanel } from '../../../src/roadmap/ui/modules/adapter-panel.js';
// @ts-expect-error untyped JS module
import { BicameralRenderer } from '../../../src/roadmap/ui/modules/bicameral-renderer.js';
// @ts-expect-error untyped JS module
import { renderNotInstalled } from '../../../src/roadmap/ui/modules/bicameral-card-render.js';
// @ts-expect-error untyped JS module
import { renderInstallSkillsCard, bindInstallSkillsCard } from '../../../src/roadmap/ui/modules/install-skills-card.js';
// @ts-expect-error untyped JS module
import { ConnectionClient } from '../../../src/roadmap/ui/modules/connection.js';

const PENDING = 'Confirm in the VS Code dialog…';
const outcomes = (noun: string): Array<[number, Record<string, unknown>, string]> => [
  [409, { ok: false, confirmation: 'declined', error: 'raw server text' }, `Not confirmed in VS Code; nothing was ${noun}.`],
  [429, { ok: false, confirmation: 'busy', error: 'raw server text' }, `Another confirmation is open in VS Code; nothing was ${noun}.`],
  [410, { ok: false, confirmation: 'expired', error: 'raw server text' }, `The VS Code confirmation expired; nothing was ${noun}. Try again.`],
  [503, { ok: false, confirmation: 'unwired', error: 'raw server text' }, `Operator confirmation is unavailable; nothing was ${noun}.`],
  [403, { ok: false, guard: 'origin', error: 'Refused: the request came from another web page.' }, 'Refused: the request came from another web page.'],
];

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
interface Held { calls: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }>; release(status: number, body: unknown): void; requested: Promise<void> }

/** jsdom globals plus a fetch that answers GETs from `gets` and holds the POST to `postPath`. */
function setup(html: string, gets: Record<string, unknown>, postPath: string): { held: Held; doc: Document; cleanup: () => void } {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}<div id="cc-operator-banner" hidden></div></body></html>`, { url: 'http://localhost:9999' });
  const g = global as unknown as Record<string, unknown>;
  const prev = { window: g.window, document: g.document, fetch: g.fetch, navigator: Object.getOwnPropertyDescriptor(global, 'navigator') };
  g.window = dom.window;
  g.document = dom.window.document;
  (dom.window as unknown as { __failsafeWebSocket?: unknown }).__failsafeWebSocket = { readyState: 1, addEventListener() {}, removeEventListener() {} };
  try { Object.defineProperty(global, 'navigator', { value: { userAgent: 'Test', vendor: 'Test' }, configurable: true, writable: true }); } catch { /* keep */ }
  let release: (status: number, body: unknown) => void = () => undefined;
  let markRequested: () => void = () => undefined;
  const requested = new Promise<void>((r) => { markRequested = r; });
  const answer = new Promise<{ status: number; body: unknown }>((r) => { release = (status, body) => r({ status, body }); });
  const calls: Held['calls'] = [];
  g.fetch = async (url: string, init?: Held['calls'][number]['init']) => {
    calls.push({ url, init });
    const reply = (status: number, body: unknown) => ({ ok: status < 300, status, statusText: '', json: async () => body });
    if (url.endsWith(postPath) && init?.method === 'POST') {
      markRequested();
      const a = await answer;
      return reply(a.status, a.body);
    }
    const key = Object.keys(gets).find((k) => url.endsWith(k));
    return reply(200, key ? gets[key] : {});
  };
  return {
    held: { calls, release: (s, b) => release(s, b), requested },
    doc: dom.window.document as unknown as Document,
    cleanup: () => {
      g.window = prev.window; g.document = prev.document; g.fetch = prev.fetch;
      if (prev.navigator) { try { Object.defineProperty(global, 'navigator', prev.navigator); } catch { /* keep */ } }
    },
  };
}

function assertJsonPost(held: Held, postPath: string): void {
  const post = held.calls.find((c) => c.url.endsWith(postPath) && c.init?.method === 'POST');
  assert.ok(post, `POST ${postPath} sent`);
  const headers = post!.init?.headers ?? {};
  const ct = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1];
  assert.equal(ct, 'application/json', 'sent as JSON');
  assert.doesNotThrow(() => JSON.parse(String(post!.init?.body)), 'with a JSON body');
}

const MCP_CATALOG = { entries: [{ id: 'context7', name: 'Context7', description: 'docs', install: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] }, risk: { level: 'low', score: 1, signals: [] } }] };
const AGT_MODULES = { preview: 'Preview', detected: [], modules: [{ id: 'typescript', label: 'TypeScript', env: 'TS', kind: 'language', command: 'npm install @microsoft/agent-governance-sdk', registry: 'npm', runnable: true, status: 'published', note: '', recommended: true }] };
const ADAPTER_INSTALLED = { adapterInstalled: true, adapterVersion: '0.3.1', pythonAvailable: true, pipAvailable: true, pythonVersion: '3.11.0', toolkitPackages: [], mcpServerAvailable: false, lastCheckedAt: 'now' };
const ADAPTER_ABSENT = { ...ADAPTER_INSTALLED, adapterInstalled: false };

suite('#538 Console install callers show the VS Code confirmation outcome', () => {
  for (const [status, body, text] of outcomes('installed')) {
    test(`MCP catalog install: pending, then ${status} -> "${text}"`, async () => {
      const ctx = setup('<div id="integrations"></div>', { '/api/v1/mcp/catalog': MCP_CATALOG }, '/api/actions/mcp-install');
      try {
        await new McpCatalogRenderer('integrations').render();
        const btn = ctx.doc.querySelector('.cc-mcp-install') as HTMLButtonElement;
        btn.click();
        btn.click();
        await ctx.held.requested;
        const statusEl = ctx.doc.querySelector('.cc-mcp-status')!;
        assert.equal(statusEl.textContent, PENDING);
        ctx.held.release(status, body);
        await tick();
        assert.equal(statusEl.textContent, text);
        assertJsonPost(ctx.held, '/api/actions/mcp-install');
      } finally { ctx.cleanup(); }
    });
  }

  for (const [status, body, text] of outcomes('opened')) {
    test(`AGT terminal pre-fill: pending, then ${status} -> "${text}"`, async () => {
      const ctx = setup('<div id="integrations"></div>', { '/api/v1/agt/modules': AGT_MODULES }, '/api/actions/agt-install');
      try {
        await new AgtRenderer('integrations').render();
        (ctx.doc.querySelector('.cc-agt-run') as HTMLButtonElement).click();
        await ctx.held.requested;
        const statusEl = ctx.doc.querySelector('.cc-agt-status')!;
        assert.equal(statusEl.textContent, PENDING);
        ctx.held.release(status, body);
        await tick();
        assert.equal(statusEl.textContent, text);
      } finally { ctx.cleanup(); }
    });
  }

  for (const [status, body, text] of outcomes('uninstalled')) {
    test(`adapter uninstall: sends JSON, pending, then ${status} -> "${text}"`, async () => {
      const ctx = setup('<div id="adp-root"></div>', { '/api/adapter/status': ADAPTER_INSTALLED }, '/api/adapter/uninstall');
      try {
        const panel = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
        await panel.render();
        const done = panel.performUninstall();
        await ctx.held.requested;
        const statusEl = ctx.doc.querySelector('.cc-adapter-action-status');
        assert.ok(statusEl, 'the panel has an action status line');
        assert.equal(statusEl!.textContent, PENDING);
        ctx.held.release(status, body);
        await done;
        assert.equal(ctx.doc.querySelector('.cc-adapter-action-status')!.textContent, text);
        assertJsonPost(ctx.held, '/api/adapter/uninstall');
      } finally { ctx.cleanup(); }
    });
  }

  for (const [status, body, text] of outcomes('installed')) {
    test(`adapter install: pending, then ${status} -> "${text}"`, async () => {
      const ctx = setup('<div id="adp-root"></div>', { '/api/adapter/status': ADAPTER_ABSENT }, '/api/adapter/install');
      try {
        const panel = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
        await panel.render();
        panel.showInstallModal();
        const done = panel.performInstall(false, true);
        await ctx.held.requested;
        const msg = ctx.doc.querySelector('.cc-adapter-progress-msg')!;
        assert.equal(msg.textContent, PENDING);
        ctx.held.release(status, body);
        await done;
        assert.equal(msg.textContent, text);
        assertJsonPost(ctx.held, '/api/adapter/install');
      } finally { ctx.cleanup(); }
    });
  }

  for (const [status, body, text] of outcomes('installed')) {
    test(`Qor-logic skills install: pending, then ${status} -> "${text}"`, async () => {
      const ctx = setup('<div id="root"></div>', {}, '/api/actions/scaffold-skills');
      try {
        const root = ctx.doc.getElementById('root')!;
        root.innerHTML = renderInstallSkillsCard(
          { running: false, invocations: [], lastReport: null },
          { bootstrapState: { qorLogicInstall: { hosts: [{ host: 'claude', installed: false }] } } },
        );
        bindInstallSkillsCard(root, {});
        (root.querySelector('[data-action="install-qorlogic-skills"]') as HTMLElement).click();
        (root.querySelector('.cc-modal-confirm') as HTMLElement).click();
        await ctx.held.requested;
        assert.equal(root.querySelector('#cc-qorlogic-status')!.textContent, PENDING);
        ctx.held.release(status, body);
        await tick(30);
        const err = root.querySelector('.cc-modal-error');
        assert.ok(err, 'the modal shows the outcome');
        assert.ok(err!.textContent!.includes(text), err!.textContent!);
        assert.equal(root.querySelector('#cc-qorlogic-status')!.textContent, '');
      } finally { ctx.cleanup(); }
    });
  }

  for (const [status, body, text] of outcomes('installed')) {
    test(`Bicameral install: awaiting confirmation, then ${status} -> "${text}"`, async () => {
      const ctx = setup('<div id="bic-root"></div>', { '/api/integrations/bicameral/status': { ok: true, state: 'not-installed' } }, '/api/actions/bicameral-install');
      try {
        const r = new BicameralRenderer('bic-root', { client: {} });
        const done = r._beginInstall('solo');
        await ctx.held.requested;
        assert.equal(r.state.installProgress.awaitingConfirmation, true);
        ctx.held.release(status, body);
        await done;
        assert.equal(r.state.installProgress.done, true);
        assert.equal(r.state.installProgress.ok, false);
        assert.equal(r.state.installProgress.error, text);
        assertJsonPost(ctx.held, '/api/actions/bicameral-install');
      } finally { ctx.cleanup(); }
    });
  }

  test('Qor-logic skills install: a non-JSON 429 shows the status, not a SyntaxError', async () => {
    const ctx = setup('<div id="root"></div>', {}, '/none');
    const g = global as unknown as Record<string, unknown>;
    const prevFetch = g.fetch;
    g.fetch = async () => ({ ok: false, status: 429, statusText: 'Too Many Requests', json: async () => { throw new SyntaxError('Unexpected token T in JSON'); } });
    try {
      const root = ctx.doc.getElementById('root')!;
      root.innerHTML = renderInstallSkillsCard(
        { running: false, invocations: [], lastReport: null },
        { bootstrapState: { qorLogicInstall: { hosts: [{ host: 'claude', installed: false }] } } },
      );
      bindInstallSkillsCard(root, {});
      (root.querySelector('[data-action="install-qorlogic-skills"]') as HTMLElement).click();
      (root.querySelector('.cc-modal-confirm') as HTMLElement).click();
      await tick(30);
      const err = root.querySelector('.cc-modal-error');
      assert.ok(err, 'the modal shows the outcome');
      assert.ok(err!.textContent!.includes('Request failed (429)'), err!.textContent!);
      assert.ok(!/SyntaxError|Unexpected token/.test(err!.textContent!), err!.textContent!);
    } finally { g.fetch = prevFetch; ctx.cleanup(); }
  });

  test('Bicameral card shows the pending text while the install awaits confirmation', () => {
    const ctx = setup('', {}, '/none');
    try {
      const html = renderNotInstalled({ installProgress: { mode: 'solo', steps: [], done: false, ok: false, awaitingConfirmation: true } });
      assert.ok(html.includes(PENDING), 'pending text rendered');
    } finally { ctx.cleanup(); }
  });

  test('postGated maps an expired confirmation', async () => {
    const ctx = setup('', {}, '/api/actions/panic-stop');
    try {
      const client = new ConnectionClient({ baseUrl: '' });
      const done = client.postGated('/api/actions/panic-stop');
      await ctx.held.requested;
      ctx.held.release(410, { ok: false, confirmation: 'expired', error: 'raw server text' });
      const r = await done;
      assert.equal(r.ok, false);
      assert.equal(ctx.doc.getElementById('cc-operator-banner')!.textContent, 'The VS Code confirmation expired');
    } finally { ctx.cleanup(); }
  });
});

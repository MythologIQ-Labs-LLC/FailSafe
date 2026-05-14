// Functional tests for install-skills-card UI module (renderInstallSkillsCard
// + bindInstallSkillsCard). Pure HTML generation + click-driven fetch flow.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import {
  renderInstallSkillsCard,
  bindInstallSkillsCard,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/install-skills-card.js';

function setupDom(initial = ''): { dom: JSDOM; restore: () => void } {
  const dom = new JSDOM(`<!DOCTYPE html><div id="root">${initial}</div>`);
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  return {
    dom,
    restore: () => {
      (globalThis as { document?: unknown }).document = undefined;
      (globalThis as { window?: unknown }).window = undefined;
    },
  };
}

function mountHtml(dom: JSDOM, html: string): Element {
  const root = dom.window.document.getElementById('root');
  if (!root) throw new Error('root mount missing');
  root.innerHTML = html;
  return root;
}

function installFetch(handler: (url: string, init?: { method?: string }) => { ok?: boolean; status?: number; body?: unknown }): {
  calls: Array<{ url: string; method?: string }>;
  restore: () => void;
} {
  const calls: Array<{ url: string; method?: string }> = [];
  const original = (globalThis as { fetch?: unknown }).fetch;
  (globalThis as { fetch: unknown }).fetch = async (url: string, init?: { method?: string }) => {
    calls.push({ url, method: init?.method });
    const r = handler(url, init);
    return {
      ok: r.ok ?? true, status: r.status ?? 200,
      json: async () => r.body ?? {}, statusText: r.ok === false ? 'Bad Request' : 'OK',
    };
  };
  return { calls, restore: () => { (globalThis as { fetch?: unknown }).fetch = original; } };
}

suite('install-skills-card (FX234 + FX237 + FX238 + FX240)', () => {
  let domR: { dom: JSDOM; restore: () => void };
  setup(() => { domR = setupDom(); });
  teardown(() => { domR.restore(); });

  test('renderInstallSkillsCard — idle state shows install + bootstrap buttons (no Show Output)', () => {
    const html = renderInstallSkillsCard({ running: false, invocations: [], lastReport: null });
    assert.match(html, /data-action="install-qorlogic-skills"/);
    assert.match(html, /data-action="bootstrap-workspace"/);
    // No Show Output when there\'s no report and no invocations
    assert.equal(html.includes('data-action="show-output"'), false);
  });

  test('renderInstallSkillsCard — running state disables both action buttons', () => {
    const html = renderInstallSkillsCard({ running: true, invocations: [], lastReport: null });
    // Both install and bootstrap buttons get disabled attr
    const matches = html.match(/disabled/g) || [];
    assert.ok(matches.length >= 2, `Expected ≥2 "disabled" attributes; got ${matches.length}`);
    assert.match(html, /Installing/);
  });

  test('renderInstallSkillsCard — non-empty invocations adds Show Output button', () => {
    const html = renderInstallSkillsCard({
      running: false,
      invocations: [{ phase: 'python-probe', status: 'success', interpreter: '/usr/bin/python3' }],
      lastReport: null,
    });
    assert.match(html, /data-action="show-output"/);
    assert.match(html, /Resolved Python.*\/usr\/bin\/python3/);
  });

  test('renderInstallSkillsCard — invocations: success/error/running icons differ', () => {
    const html = renderInstallSkillsCard({
      running: false,
      invocations: [
        { phase: 'pip-install', status: 'success', command: 'python -m pip install qor-logic' },
        { phase: 'qorlogic-install', status: 'error', host: 'claude', error: 'permission denied' },
        { phase: 'refresh', status: 'running' },
      ],
      lastReport: null,
    });
    assert.match(html, /✓/);
    assert.match(html, /✗/);
    assert.match(html, /⏳/);
    assert.match(html, /permission denied/);
  });

  test('renderInstallSkillsCard — qorlogic-install detail includes skill count + destination', () => {
    const html = renderInstallSkillsCard({
      running: false,
      invocations: [{
        phase: 'qorlogic-install', status: 'success', host: 'claude', scope: 'repo',
        installedCount: 17, destination: '.claude/skills/',
      }],
      lastReport: null,
    });
    assert.match(html, /17 skills/);
    assert.match(html, /\.claude\/skills\//);
  });

  test('renderInstallSkillsCard — provenance summary pluralizes correctly', () => {
    const html1 = renderInstallSkillsCard({
      running: false,
      invocations: [{ phase: 'provenance', status: 'success', summary: { hostsVerified: 1, totalFiles: 1 } }],
      lastReport: null,
    });
    assert.match(html1, /1 host record/);
    assert.match(html1, /1 file/);
    assert.equal(html1.includes('1 hosts'), false);
    const html2 = renderInstallSkillsCard({
      running: false,
      invocations: [{ phase: 'provenance', status: 'success', summary: { hostsVerified: 2, totalFiles: 5 } }],
      lastReport: null,
    });
    assert.match(html2, /2 host records/);
    assert.match(html2, /5 files/);
  });

  test('renderInstallSkillsCard — lastReport ok=true renders teal success message', () => {
    const html = renderInstallSkillsCard({
      running: false,
      invocations: [],
      lastReport: { ok: true, totalInstalled: 17, destinations: ['.claude/skills/'], failures: [] },
    });
    assert.match(html, /var\(--accent-teal/);
    assert.match(html, /Installed 17 skill\(s\) at .claude\/skills\//);
  });

  test('renderInstallSkillsCard — lastReport ok=false renders gold partial-failure message', () => {
    const html = renderInstallSkillsCard({
      running: false,
      invocations: [],
      lastReport: { ok: false, totalInstalled: 5, destinations: [], failures: [{ host: 'codex', error: 'x' }] },
    });
    assert.match(html, /var\(--accent-gold/);
    assert.match(html, /1 host\(s\) failed/);
  });

  test('renderInstallSkillsCard — lastReport ignored while running=true', () => {
    const html = renderInstallSkillsCard({
      running: true,
      invocations: [],
      lastReport: { ok: true, totalInstalled: 3, destinations: [], failures: [] },
    });
    assert.equal(html.includes('Installed 3 skill'), false, 'report summary suppressed during running state');
  });

  test('renderInstallSkillsCard — esc() prevents XSS in destinations + error fields', () => {
    const html = renderInstallSkillsCard({
      running: false,
      invocations: [{ phase: 'qorlogic-install', status: 'error', host: 'claude', error: '<script>alert(1)</script>' }],
      lastReport: { ok: false, totalInstalled: 0, destinations: ['<img src=x>'], failures: [{}] },
    });
    assert.equal(html.includes('<script>alert(1)</script>'), false);
    assert.equal(html.includes('<img src=x>'), false);
    assert.match(html, /&lt;script&gt;/);
  });

  test('FX234/FX237 bindInstallSkillsCard — Install button opens modal; confirm POSTs /api/actions/scaffold-skills', async () => {
    const f = installFetch(() => ({ ok: true, body: { ok: true, totalInstalled: 17 } }));
    try {
      const html = renderInstallSkillsCard({ running: false, invocations: [], lastReport: null });
      mountHtml(domR.dom, html);
      const root = domR.dom.window.document.getElementById('root')!;
      let started = 0;
      let finishBody: unknown = null;
      bindInstallSkillsCard(root, {
        onStart: () => { started += 1; },
        onFinishFetch: (b: unknown) => { finishBody = b; },
      });
      const installBtn = root.querySelector('[data-action="install-qorlogic-skills"]') as HTMLElement;
      installBtn.click();
      const confirmBtn = root.querySelector('.cc-modal-confirm') as HTMLElement;
      assert.ok(confirmBtn, 'modal confirm button must exist');
      confirmBtn.click();
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(started, 1);
      assert.equal(f.calls[0].url, '/api/actions/scaffold-skills');
      assert.equal(f.calls[0].method, 'POST');
      assert.deepEqual(finishBody, { ok: true, totalInstalled: 17 });
    } finally { f.restore(); }
  });

  test('FX234 bindInstallSkillsCard — Install on error response renders cc-modal-error with message', async () => {
    // Post-V2 split: error state lives in install-skills-modal.js as
    // .cc-modal-error block (state.terminal === 'error', state.err.error).
    // The pre-split assertion against .cc-modal-progress-msg is no longer
    // valid — that selector doesn't exist in the new modal markup.
    const f = installFetch(() => ({ ok: false, body: { ok: false, error: 'pip exit 1' } }));
    try {
      const html = renderInstallSkillsCard({ running: false, invocations: [], lastReport: null });
      mountHtml(domR.dom, html);
      const root = domR.dom.window.document.getElementById('root')!;
      bindInstallSkillsCard(root, {});
      const installBtn = root.querySelector('[data-action="install-qorlogic-skills"]') as HTMLElement;
      installBtn.click();
      const confirmBtn = root.querySelector('.cc-modal-confirm') as HTMLElement;
      confirmBtn.click();
      await new Promise((r) => setTimeout(r, 50));
      const errorBlock = root.querySelector('.cc-modal-error');
      assert.ok(errorBlock, '.cc-modal-error should be rendered on error response');
      assert.match(errorBlock?.innerHTML || '', /pip exit 1/);
    } finally { f.restore(); }
  });

  test('FX234 bindInstallSkillsCard — fetch throw fires onError + surfaces error block in modal', async () => {
    // Post-V2 split: network errors flow through the same error reducer +
    // .cc-modal-error block. Generic "Network error" copy no longer used;
    // the error string is the thrown Error.message.
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch: unknown }).fetch = async () => { throw new Error('offline'); };
    try {
      const html = renderInstallSkillsCard({ running: false, invocations: [], lastReport: null });
      mountHtml(domR.dom, html);
      const root = domR.dom.window.document.getElementById('root')!;
      let errorCaught: Error | null = null;
      bindInstallSkillsCard(root, { onError: (e: Error) => { errorCaught = e; } });
      const installBtn = root.querySelector('[data-action="install-qorlogic-skills"]') as HTMLElement;
      installBtn.click();
      const confirmBtn = root.querySelector('.cc-modal-confirm') as HTMLElement;
      confirmBtn.click();
      await new Promise((r) => setTimeout(r, 50));
      assert.ok(errorCaught);
      const errorBlock = root.querySelector('.cc-modal-error');
      assert.ok(errorBlock, '.cc-modal-error should be rendered on fetch throw');
      assert.match(errorBlock?.innerHTML || '', /offline/);
    } finally { (globalThis as { fetch?: unknown }).fetch = original; }
  });

  test('FX240 bindInstallSkillsCard — Show Output button POSTs /api/actions/show-output', async () => {
    const f = installFetch(() => ({ ok: true, body: {} }));
    try {
      const html = renderInstallSkillsCard({
        running: false,
        invocations: [{ phase: 'python-probe', status: 'success' }],
        lastReport: null,
      });
      mountHtml(domR.dom, html);
      const root = domR.dom.window.document.getElementById('root')!;
      bindInstallSkillsCard(root, {});
      const btn = root.querySelector('[data-action="show-output"]') as HTMLElement;
      assert.ok(btn);
      btn.click();
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(f.calls[0].url, '/api/actions/show-output');
      assert.equal(f.calls[0].method, 'POST');
    } finally { f.restore(); }
  });
});

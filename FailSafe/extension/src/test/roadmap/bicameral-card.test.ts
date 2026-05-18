// Functional tests for bicameral-card render + bind. SG-035 compliant.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import {
  renderBicameralCard,
  bindBicameralCard,
  INITIAL_BICAMERAL_STATE,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/bicameral-card.js';

function mount(html: string): { dom: JSDOM; root: Element } {
  const dom = new JSDOM(`<!DOCTYPE html><div id="root">${html}</div>`);
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  const root = dom.window.document.getElementById('root')!;
  return { dom, root };
}

function clearDom() {
  (globalThis as { document?: unknown }).document = undefined;
  (globalThis as { window?: unknown }).window = undefined;
}

suite('bicameral-card render', () => {
  teardown(() => clearDom());

  test('not-installed → renders Install (Solo) + Install (Team) action buttons + docs link', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'not-installed' });
    assert.match(html, /data-action="bicameral-install"[^>]*data-mode="solo"/);
    assert.match(html, /data-action="bicameral-install"[^>]*data-mode="team"/);
    assert.match(html, /github\.com\/BicameralAI\/bicameral-mcp/);
  });

  test('not-installed + install in flight → renders progress block instead of pickers', () => {
    const installProgress = {
      mode: 'solo',
      steps: [{ phase: 'pip-install', status: 'running' }],
      done: false,
      ok: false,
    };
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'not-installed', installProgress });
    assert.match(html, /cc-bicameral-install-progress/);
    assert.match(html, /Installing Bicameral MCP \(solo-mode\)/);
    // Picker buttons must be suppressed while installing.
    assert.equal(/data-action="bicameral-install"/.test(html), false);
  });

  test('not-installed + install failed → renders failure block + re-shows pickers', () => {
    const installProgress = {
      mode: 'solo',
      steps: [{ phase: 'pip-install', status: 'error', error: 'pip exited with code 1' }],
      done: true,
      ok: false,
      error: 'pip exited with code 1',
    };
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'not-installed', installProgress });
    assert.match(html, /cc-bicameral-install-error/);
    assert.match(html, /pip exited with code 1/);
    // Operator can retry — pickers re-appear once done=true && ok=false.
    assert.match(html, /data-action="bicameral-install"/);
  });

  test('installed-not-configured → renders Setup (Solo) + Setup (Team) pickers', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'installed-not-configured' });
    assert.match(html, /data-action="bicameral-setup"[^>]*data-mode="solo"/);
    assert.match(html, /data-action="bicameral-setup"[^>]*data-mode="team"/);
  });

  test('configured-not-running → renders Connect button', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'configured-not-running' });
    assert.match(html, /data-action="bicameral-connect"/);
    assert.match(html, />Connect</);
  });

  test('configured-not-running with requesting=true → button shows Connecting and disabled', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'configured-not-running', requesting: true });
    assert.match(html, /Connecting/);
    assert.match(html, /disabled/);
  });

  test('running with empty features → renders empty-state copy + refresh button', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'running', features: [] });
    assert.match(html, /No decisions yet/);
    assert.match(html, /data-action="bicameral-refresh"/);
  });

  test('running with 3 features → renders 3 feature sections in order', () => {
    const features = [
      { feature: 'auth', decisions: [] },
      { feature: 'payments', decisions: [] },
      { feature: 'webhooks', decisions: [] },
    ];
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'running', features });
    const sectionMatches = html.match(/cc-bicameral-feature/g) || [];
    assert.equal(sectionMatches.length, 3);
    const authIdx = html.indexOf('data-feature="auth"');
    const paymentsIdx = html.indexOf('data-feature="payments"');
    assert.ok(authIdx > -1 && paymentsIdx > -1 && authIdx < paymentsIdx, 'features must render in array order');
  });

  test('decision with drift status maps via driftByFile to override declared status', () => {
    const features = [{
      feature: 'auth',
      decisions: [{
        id: 'd1', title: 'idempotency', source: 's', status: 'in-sync',
        bindings: [{ filePath: 'src/x.ts', symbol: 'check' }],
      }],
    }];
    const driftByFile = { 'src/x.ts': [{ decisionId: 'd1', filePath: 'src/x.ts', status: 'drifted' }] };
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'running', features, driftByFile });
    // status badge text reflects drift override
    assert.match(html, /drifted/);
  });

  test('version is shown in header when supplied', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'configured-not-running', version: '0.14.6' });
    assert.match(html, /v0\.14\.6/);
  });

  test('error string renders in cc-bicameral-error block', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'running', error: 'spawn ENOENT' });
    assert.match(html, /cc-bicameral-error/);
    assert.match(html, /spawn ENOENT/);
  });

  test('esc() prevents XSS in decision title and binding paths', () => {
    const features = [{
      feature: '<img src=x>',
      decisions: [{
        id: 'evil',
        title: '<script>alert(1)</script>',
        source: 's',
        status: 'in-sync',
        bindings: [{ filePath: '<svg onload=alert(1)>', symbol: 'x' }],
      }],
    }];
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'running', features });
    assert.equal(html.includes('<script>alert(1)</script>'), false);
    assert.equal(html.includes('<svg onload=alert(1)>'), false);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;svg/);
  });
});

suite('bicameral-card bind', () => {
  teardown(() => clearDom());

  test('Detect-again button click fires onDetect once', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'not-installed' });
    const { root } = mount(html);
    let calls = 0;
    bindBicameralCard(root, { onDetect: () => { calls += 1; } });
    const btn = root.querySelector('[data-action="bicameral-detect"]') as HTMLButtonElement;
    btn.click();
    assert.equal(calls, 1);
  });

  test('Connect button click fires onConnect once', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'configured-not-running' });
    const { root } = mount(html);
    let calls = 0;
    bindBicameralCard(root, { onConnect: () => { calls += 1; } });
    const btn = root.querySelector('[data-action="bicameral-connect"]') as HTMLButtonElement;
    btn.click();
    assert.equal(calls, 1);
  });

  test('Refresh button click fires onRefresh', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'running', features: [] });
    const { root } = mount(html);
    let calls = 0;
    bindBicameralCard(root, { onRefresh: () => { calls += 1; } });
    const btn = root.querySelector('[data-action="bicameral-refresh"]') as HTMLButtonElement;
    btn.click();
    assert.equal(calls, 1);
  });

  test('Ratify button click fires onRatify with decision id + verdict', () => {
    const features = [{
      feature: 'auth',
      decisions: [{ id: 'decision-xyz', title: 't', source: 's', status: 'drifted', bindings: [] }],
    }];
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'running', features });
    const { root } = mount(html);
    const captured: Array<{ id: string; verdict: string }> = [];
    bindBicameralCard(root, { onRatify: (id: string, verdict: string) => captured.push({ id, verdict }) });
    const btn = root.querySelector('[data-action="bicameral-ratify"]') as HTMLButtonElement;
    btn.click();
    assert.equal(captured.length, 1);
    assert.equal(captured[0].id, 'decision-xyz');
    assert.equal(captured[0].verdict, 'ratify');
  });

  test('Install (Solo) button click fires onInstall with "solo"', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'not-installed' });
    const { root } = mount(html);
    const captured: string[] = [];
    bindBicameralCard(root, { onInstall: (mode: string) => captured.push(mode) });
    const btn = root.querySelector('[data-action="bicameral-install"][data-mode="solo"]') as HTMLButtonElement;
    btn.click();
    assert.deepEqual(captured, ['solo']);
  });

  test('Install (Team) button click fires onInstall with "team"', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'not-installed' });
    const { root } = mount(html);
    const captured: string[] = [];
    bindBicameralCard(root, { onInstall: (mode: string) => captured.push(mode) });
    const btn = root.querySelector('[data-action="bicameral-install"][data-mode="team"]') as HTMLButtonElement;
    btn.click();
    assert.deepEqual(captured, ['team']);
  });

  test('Setup (Solo) button click fires onSetup with "solo"', () => {
    const html = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'installed-not-configured' });
    const { root } = mount(html);
    const captured: string[] = [];
    bindBicameralCard(root, { onSetup: (mode: string) => captured.push(mode) });
    const btn = root.querySelector('[data-action="bicameral-setup"][data-mode="solo"]') as HTMLButtonElement;
    btn.click();
    assert.deepEqual(captured, ['solo']);
  });

  test('bindBicameralCard tolerates missing container gracefully', () => {
    assert.doesNotThrow(() => bindBicameralCard(null as unknown as Element, {}));
    assert.doesNotThrow(() => bindBicameralCard({} as Element, {}));
  });
});

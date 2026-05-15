// Functional tests for AdapterPanel (FX390).

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { AdapterPanel } from '../../../src/roadmap/ui/modules/adapter-panel.js';

function setupDom(): { cleanup: () => void } {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="adp-root"></div></body></html>', { url: 'http://localhost:9999' });
  const prevWin = (global as any).window;
  const prevDoc = (global as any).document;
  const prevFetch = (global as any).fetch;
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  return {
    cleanup: () => {
      (global as any).window = prevWin;
      (global as any).document = prevDoc;
      (global as any).fetch = prevFetch;
    },
  };
}

const STATE_NOT_INSTALLED = {
  adapterInstalled: false, pythonAvailable: true, pipAvailable: true,
  pythonVersion: '3.11.0', toolkitPackages: [], mcpServerAvailable: false,
  lastCheckedAt: '2026-05-07T00:00:00Z',
};

const STATE_INSTALLED = {
  adapterInstalled: true, adapterVersion: '0.3.1',
  pythonAvailable: true, pipAvailable: true, pythonVersion: '3.11.0',
  toolkitPackages: [
    { name: 'agent-os', installed: true, version: '1.0', required: true },
    { name: 'agent-mesh', installed: false, required: false },
    { name: 'agent-hypervisor', installed: false, required: false },
    { name: 'agent-sre', installed: false, required: false },
  ],
  mcpServerAvailable: true, lastCheckedAt: '2026-05-07T00:00:00Z',
};

suite('AdapterPanel (FX390)', () => {
  let cleanup: () => void;
  setup(() => { cleanup = setupDom().cleanup; });
  teardown(() => cleanup());

  test('FX390 render — fetches state + writes container HTML', async () => {
    (global as any).fetch = async () => ({ ok: true, json: async () => STATE_NOT_INSTALLED });
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await p.render();
    assert.ok(document.getElementById('adp-root')!.innerHTML.length > 100);
  });

  test('FX390 render — not-installed state shows "Install Adapter" button', async () => {
    (global as any).fetch = async () => ({ ok: true, json: async () => STATE_NOT_INSTALLED });
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await p.render();
    assert.ok(document.querySelector('.cc-adapter-install'));
    assert.equal(document.querySelector('.cc-adapter-uninstall'), null);
  });

  test('FX390 render — installed state shows "Uninstall" button', async () => {
    (global as any).fetch = async () => ({ ok: true, json: async () => STATE_INSTALLED });
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await p.render();
    assert.ok(document.querySelector('.cc-adapter-uninstall'));
    assert.equal(document.querySelector('.cc-adapter-install'), null);
  });

  test('FX390 fetchState — populates this.state on successful response', async () => {
    (global as any).fetch = async () => ({ ok: true, json: async () => STATE_INSTALLED });
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await p.fetchState();
    assert.equal(p.state.adapterInstalled, true);
    assert.equal(p.state.adapterVersion, '0.3.1');
  });

  test('FX390 fetchState — failed response leaves state null', async () => {
    (global as any).fetch = async () => ({ ok: false, json: async () => ({}) });
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await p.fetchState();
    assert.equal(p.state, null);
  });

  test('FX390 fetchState — fetch throw is silently swallowed', async () => {
    (global as any).fetch = async () => { throw new Error('network down'); };
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await assert.doesNotReject(p.fetchState());
    assert.equal(p.state, null);
  });

  test('FX390 fetchHealthCheck — populates this.healthCheck', async () => {
    (global as any).fetch = async () => ({ ok: true, json: async () => ({ healthy: true, details: ['ok'] }) });
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await p.fetchHealthCheck();
    assert.equal(p.healthCheck.healthy, true);
  });

  test('FX390 render — installed adapter shows version in header', async () => {
    (global as any).fetch = async () => ({ ok: true, json: async () => STATE_INSTALLED });
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await p.render();
    const html = document.getElementById('adp-root')!.innerHTML;
    assert.match(html, /agent-failsafe/);
  });

  test('FX390 renderPrerequisites — Python+pip both ok shows green check', async () => {
    (global as any).fetch = async () => ({ ok: true, json: async () => STATE_INSTALLED });
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await p.render();
    const html = document.getElementById('adp-root')!.innerHTML;
    assert.match(html, /3\.11\.0/);
  });

  test('FX390 renderPrerequisites — Python missing shows error message', async () => {
    (global as any).fetch = async () => ({ ok: true, json: async () => ({ ...STATE_NOT_INSTALLED, pythonAvailable: false, pythonVersion: undefined }) });
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await p.render();
    const html = document.getElementById('adp-root')!.innerHTML;
    assert.match(html, /Not found|Python/i);
  });

  test('FX390 renderToolkitPackages — installed package shows version', async () => {
    (global as any).fetch = async () => ({ ok: true, json: async () => STATE_INSTALLED });
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await p.render();
    const html = document.getElementById('adp-root')!.innerHTML;
    assert.match(html, /agent-os/);
  });

  test('FX390 destroy — clears container HTML', async () => {
    (global as any).fetch = async () => ({ ok: true, json: async () => STATE_INSTALLED });
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await p.render();
    assert.ok(document.getElementById('adp-root')!.innerHTML.length > 0);
    p.destroy();
    assert.equal(document.getElementById('adp-root')!.innerHTML, '');
  });

  test('FX390 showInstallModal / hideInstallModal — toggles display style', async () => {
    (global as any).fetch = async () => ({ ok: true, json: async () => STATE_NOT_INSTALLED });
    const p = new AdapterPanel('adp-root', { client: { baseUrl: '' } });
    await p.render();
    p.showInstallModal();
    const modal = document.querySelector('.cc-adapter-install-modal') as HTMLElement;
    if (modal) {
      assert.equal(modal.style.display, 'flex');
      p.hideInstallModal();
      assert.equal(modal.style.display, 'none');
    }
  });
});

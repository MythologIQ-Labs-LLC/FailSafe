// Functional tests for workspace-registry (FX185 + FX190).
// DOM + fetch stubs; sink: select element children + switchServer call capture.

import { strict as assert } from 'assert';
import {
  setWorkspaceRegistryClient,
  loadWorkspaceRegistry,
  initWorkspaceSelector,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/workspace-registry.js';

interface OptionStub { value: string; textContent: string; title: string; selected: boolean; disabled: boolean; }
interface SelectStub {
  innerHTML: string;
  children: OptionStub[];
  listeners: Array<{ type: string; handler: (e: { target: { value: string } }) => void }>;
  appendChild(opt: OptionStub): void;
  addEventListener(type: string, handler: (e: { target: { value: string } }) => void): void;
}

function makeSelect(): SelectStub {
  const stub: SelectStub = {
    innerHTML: '<option>placeholder</option>',
    children: [],
    listeners: [],
    appendChild(opt) { stub.children.push(opt); },
    addEventListener(type, handler) { stub.listeners.push({ type, handler }); },
  };
  return stub;
}

function installDom(select: SelectStub | null): { restore: () => void } {
  const original = (globalThis as { document?: unknown }).document;
  (globalThis as { document: unknown }).document = {
    getElementById: (id: string) => id === 'workspace-select' ? select : null,
    createElement: () => ({ value: '', textContent: '', title: '', selected: false, disabled: false }),
  };
  return {
    restore: () => { (globalThis as { document?: unknown }).document = original; },
  };
}

function installFetch(handler: (url: string) => { ok: boolean; body?: unknown }): () => void {
  const original = (globalThis as { fetch?: unknown }).fetch;
  (globalThis as { fetch: unknown }).fetch = async (url: string) => {
    const r = handler(url);
    return { ok: r.ok, json: async () => r.body ?? {} };
  };
  return () => { (globalThis as { fetch?: unknown }).fetch = original; };
}

suite('workspace-registry (FX185, FX190)', () => {
  let domR: { restore: () => void };
  let fetchR: () => void;

  teardown(() => {
    if (domR) domR.restore();
    if (fetchR) fetchR();
    setWorkspaceRegistryClient(null);
  });

  test('FX190 loadWorkspaceRegistry — fetches /api/v1/workspaces and populates select', async () => {
    const select = makeSelect();
    domR = installDom(select);
    fetchR = installFetch(() => ({
      ok: true,
      body: {
        workspaces: [
          { port: 9377, workspaceName: 'WS-A', workspacePath: '/path/a', status: 'connected' },
          { port: 9378, workspaceName: 'WS-B', workspacePath: '/path/b', status: 'connected' },
        ],
        current: '/path/a',
      },
    }));
    await loadWorkspaceRegistry();
    assert.equal(select.innerHTML, '');
    assert.equal(select.children.length, 2);
    assert.equal(select.children[0].textContent, 'WS-A');
    assert.equal(select.children[0].selected, true, 'current workspace should be selected');
    assert.equal(select.children[1].selected, false);
  });

  test('FX190 loadWorkspaceRegistry — disconnected workspace gets "(disconnected)" suffix + disabled', async () => {
    const select = makeSelect();
    domR = installDom(select);
    fetchR = installFetch(() => ({
      ok: true,
      body: {
        workspaces: [{ port: 9999, workspaceName: 'Lost', workspacePath: '/lost', status: 'disconnected' }],
        current: '/elsewhere',
      },
    }));
    await loadWorkspaceRegistry();
    assert.equal(select.children[0].disabled, true);
    assert.match(select.children[0].textContent, /\(disconnected\)/);
  });

  test('FX190 loadWorkspaceRegistry — no #workspace-select element is a no-op', async () => {
    domR = installDom(null);
    let fetchCalled = false;
    fetchR = installFetch(() => { fetchCalled = true; return { ok: true, body: {} }; });
    await loadWorkspaceRegistry();
    assert.equal(fetchCalled, false, 'no fetch when no element to populate');
  });

  test('FX190 loadWorkspaceRegistry — non-ok response is silent (no throw)', async () => {
    const select = makeSelect();
    domR = installDom(select);
    fetchR = installFetch(() => ({ ok: false }));
    await assert.doesNotReject(() => loadWorkspaceRegistry());
    // Select remains untouched
    assert.equal(select.children.length, 0);
  });

  test('FX190 loadWorkspaceRegistry — fetch throw is caught silently', async () => {
    const select = makeSelect();
    domR = installDom(select);
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch: unknown }).fetch = async () => { throw new Error('network'); };
    fetchR = () => { (globalThis as { fetch?: unknown }).fetch = original; };
    await assert.doesNotReject(() => loadWorkspaceRegistry());
  });

  test('FX185 initWorkspaceSelector — change event invokes switchServer with parsed port', () => {
    const select = makeSelect();
    domR = installDom(select);
    let switchedPort: number | null = null;
    setWorkspaceRegistryClient({
      switchServer: (port: number) => { switchedPort = port; },
    });
    initWorkspaceSelector();
    assert.equal(select.listeners.length, 1);
    const listener = select.listeners[0];
    listener.handler({ target: { value: '9378' } });
    assert.equal(switchedPort, 9378);
  });

  test('FX185 initWorkspaceSelector — invalid port (NaN) does not call switchServer', () => {
    const select = makeSelect();
    domR = installDom(select);
    let called = false;
    setWorkspaceRegistryClient({
      switchServer: () => { called = true; },
    });
    initWorkspaceSelector();
    select.listeners[0].handler({ target: { value: 'not-a-number' } });
    assert.equal(called, false);
  });

  test('FX185 initWorkspaceSelector — without registered client, change is no-op', () => {
    const select = makeSelect();
    domR = installDom(select);
    initWorkspaceSelector();
    assert.doesNotThrow(() => select.listeners[0].handler({ target: { value: '9378' } }));
  });

  test('FX185 initWorkspaceSelector — no #workspace-select element is a safe no-op', () => {
    domR = installDom(null);
    assert.doesNotThrow(() => initWorkspaceSelector());
  });
});

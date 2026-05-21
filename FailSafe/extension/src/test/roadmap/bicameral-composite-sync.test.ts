// FX562 — B-BIC-14: the bicameral Sync action. When the integration is in the
// `running` state, invoking the detect/sync handler composes a status fetch +
// a history fetch + a drift fetch (one per binding file path already in card
// state). When not running it triggers only the status probe. The header
// button label reads "Sync" when connected, "Detect again" when not.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error JS module import in TS test context
import { IntegrationsRenderer } from '../../../src/roadmap/ui/modules/integrations.js';
// @ts-expect-error JS module import in TS test context
import { renderBicameralCard, INITIAL_BICAMERAL_STATE } from '../../../src/roadmap/ui/modules/bicameral-card.js';

interface FetchCall { url: string; init?: RequestInit }

function installDom(): JSDOM {
  const dom = new JSDOM('<!DOCTYPE html><div id="integrations"></div>');
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  return dom;
}

function clearDom() {
  (globalThis as { document?: unknown }).document = undefined;
  (globalThis as { window?: unknown }).window = undefined;
  (globalThis as { fetch?: unknown }).fetch = undefined;
}

// Records every fetch URL and resolves a canned JSON body keyed by path.
function installFetch(responses: Record<string, unknown>): FetchCall[] {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = responses[url] ?? { ok: true };
    return Promise.resolve({
      ok: true,
      statusText: 'OK',
      json: () => Promise.resolve(body),
    });
  };
  return calls;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function countCalls(calls: FetchCall[], path: string): number {
  return calls.filter((c) => c.url === path).length;
}

suite('FX562 bicameral composite Sync (B-BIC-14)', () => {
  teardown(() => clearDom());

  test('Sync when running → triggers status AND history AND drift fetches', async () => {
    installDom();
    const features = [{
      feature: 'auth',
      decisions: [{
        id: 'd1', title: 't', source: 's', status: 'in-sync',
        bindings: [{ filePath: 'src/auth/session.ts', symbol: 'createSession' }],
      }],
    }];
    const calls = installFetch({
      '/api/integrations/bicameral/status': { ok: true, state: 'running', capabilities: [] },
      '/api/actions/bicameral-history': { ok: true, features },
      '/api/actions/bicameral-drift': { ok: true, drift: [] },
    });
    const renderer = new IntegrationsRenderer('integrations', {});
    renderer.render();
    await flush();             // initial _refreshStatus + history
    await flush();
    // Seed running state with a binding path so the drift fetch has a target.
    renderer.state.bicameral = { ...renderer.state.bicameral, installState: 'running', features };
    const before = calls.length;
    renderer.handlers.onDetect();
    await flush();
    await flush();
    await flush();
    const after = calls.slice(before);
    assert.ok(countCalls(after, '/api/integrations/bicameral/status') >= 1, 'status fetch fired');
    assert.ok(countCalls(after, '/api/actions/bicameral-history') >= 1, 'history fetch fired');
    assert.ok(countCalls(after, '/api/actions/bicameral-drift') >= 1, 'drift fetch fired');
  });

  test('Sync when disconnected → only the status probe fires', async () => {
    installDom();
    const calls = installFetch({
      '/api/integrations/bicameral/status': { ok: true, state: 'configured-not-running', capabilities: [] },
    });
    const renderer = new IntegrationsRenderer('integrations', {});
    renderer.render();
    await flush();
    renderer.state.bicameral = { ...renderer.state.bicameral, installState: 'configured-not-running' };
    const before = calls.length;
    renderer.handlers.onDetect();
    await flush();
    await flush();
    const after = calls.slice(before);
    assert.ok(countCalls(after, '/api/integrations/bicameral/status') >= 1, 'status probe fired');
    assert.equal(countCalls(after, '/api/actions/bicameral-history'), 0, 'no history when disconnected');
    assert.equal(countCalls(after, '/api/actions/bicameral-drift'), 0, 'no drift when disconnected');
  });

  test('header button label is "Sync" when running, "Detect again" otherwise', () => {
    installDom();
    const running = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'running', features: [] });
    assert.match(running, /data-action="bicameral-detect"[^>]*>Sync</);
    const notRunning = renderBicameralCard({ ...INITIAL_BICAMERAL_STATE, installState: 'configured-not-running' });
    assert.match(notRunning, /data-action="bicameral-detect"[^>]*>Detect again</);
  });
});

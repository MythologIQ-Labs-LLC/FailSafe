// Functional tests for the Integrations top-level Command Center tab.
// SG-035: assertions verify actual unit output, not artifact existence.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import {
  IntegrationsRenderer,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/integrations.js';

function setupDom(): JSDOM {
  const dom = new JSDOM(`<!DOCTYPE html><div id="integrations" class="tab-panel"></div>`);
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  return dom;
}

function teardownDom() {
  (globalThis as { document?: unknown }).document = undefined;
  (globalThis as { window?: unknown }).window = undefined;
}

suite('IntegrationsRenderer (Command Center tab)', () => {
  teardown(() => teardownDom());

  test('render — produces a Bicameral card slot inside the panel', () => {
    setupDom();
    const r = new IntegrationsRenderer('integrations', { client: null });
    r.render({});
    const card = document.querySelector('.cc-bicameral-card');
    assert.ok(card, 'Bicameral card must be rendered');
  });

  test('render — Bicameral is the only card in v1', () => {
    setupDom();
    const r = new IntegrationsRenderer('integrations', { client: null });
    r.render({});
    const cards = document.querySelectorAll('.cc-integrations > *');
    assert.equal(cards.length, 1);
  });

  test('render — uses unknown state by default → "Detecting" message', () => {
    setupDom();
    const r = new IntegrationsRenderer('integrations', { client: null });
    r.render({});
    const card = document.querySelector('.cc-bicameral-card');
    assert.ok(card?.textContent?.includes('Detecting Bicameral MCP'));
  });

  test('onEvent — does not throw on irrelevant event types', () => {
    setupDom();
    const r = new IntegrationsRenderer('integrations', { client: null });
    assert.doesNotThrow(() => r.onEvent({ type: 'unrelated' }));
    assert.doesNotThrow(() => r.onEvent(null as unknown as object));
    assert.doesNotThrow(() => r.onEvent(undefined as unknown as object));
  });

  test('render — silently no-ops when panel is missing from DOM', () => {
    const dom = new JSDOM(`<!DOCTYPE html><div></div>`);
    (globalThis as { document?: unknown }).document = dom.window.document;
    const r = new IntegrationsRenderer('integrations', { client: null });
    assert.doesNotThrow(() => r.render({}));
  });
});

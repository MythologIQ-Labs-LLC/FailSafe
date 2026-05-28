// Functional tests for the Integrations top-level Command Center tab.
// SG-035: assertions verify actual unit output, not artifact existence.
//
// B-INT-5: the Integrations tab moved from a single stacked-card panel to a
// TabGroup sub-tab switcher (one sub-view per integration). These tests build
// the same TabGroup composition that command-center.js wires and assert the
// pill switching surfaces exactly one integration sub-view at a time.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import {
  TabGroup,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/tab-group.js';
import {
  BicameralRenderer,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/bicameral-renderer.js';
import {
  OpenDesignRenderer,
// @ts-expect-error JS module import in TS test context
} from '../../../src/roadmap/ui/modules/open-design-renderer.js';

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

// Mirrors the command-center.js wiring (integrations: new TabGroup('integrations', [...])).
function buildIntegrationsTabs(): InstanceType<typeof TabGroup> {
  return new TabGroup('integrations', [
    { key: 'bicameral',  label: 'Bicameral',   renderer: new BicameralRenderer('integrations', { client: null }) },
    { key: 'opendesign', label: 'Open Design', renderer: new OpenDesignRenderer('integrations') },
  ]);
}

function pillByLabel(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.cc-subview-bar .cc-pill')).find(
    (p) => p.textContent === label,
  );
}

suite('Integrations tab sub-tab switcher (B-INT-5)', () => {
  teardown(() => teardownDom());

  test('T1 — renders Bicameral + Open Design sub-tab pills', () => {
    setupDom();
    buildIntegrationsTabs().render({});
    const pills = Array.from(document.querySelectorAll('.cc-subview-bar .cc-pill')).map((p) => p.textContent);
    assert.deepEqual(pills, ['Bicameral', 'Open Design'], 'expect exactly two integration pills in order');
  });

  test('T2 — Bicameral is the default active sub-view (its card shows on first render)', () => {
    setupDom();
    buildIntegrationsTabs().render({});
    assert.ok(document.querySelector('.cc-bicameral-card'), 'Bicameral card must render by default');
    assert.ok(!document.querySelector('.cc-open-design-card'), 'Open Design card must NOT render until selected');
    assert.equal(pillByLabel('Bicameral')?.classList.contains('active'), true, 'Bicameral pill is active');
  });

  test('T3 — clicking a pill swaps the visible integration sub-view', () => {
    setupDom();
    buildIntegrationsTabs().render({});

    pillByLabel('Open Design')!.click();
    assert.ok(document.querySelector('.cc-open-design-card'), 'Open Design card visible after selecting its pill');
    assert.ok(document.querySelector('.cc-open-design-card')?.textContent?.includes('Open Design MCP'));
    assert.ok(!document.querySelector('.cc-bicameral-card'), 'Bicameral card hidden when Open Design active');
    assert.equal(pillByLabel('Open Design')?.classList.contains('active'), true, 'Open Design pill is active');

    pillByLabel('Bicameral')!.click();
    assert.ok(document.querySelector('.cc-bicameral-card'), 'Bicameral card restored when reselected');
    assert.ok(!document.querySelector('.cc-open-design-card'), 'Open Design card hidden again');
  });

  test('T4 — onEvent fans bicameral.* events to sub-views without throwing', () => {
    setupDom();
    const tabs = buildIntegrationsTabs();
    tabs.render({});
    assert.doesNotThrow(() => tabs.onEvent({ type: 'bicameral.connected' }));
    assert.doesNotThrow(() => tabs.onEvent({ type: 'unrelated' }));
    assert.doesNotThrow(() => tabs.onEvent(null as unknown as object));
    assert.doesNotThrow(() => tabs.onEvent(undefined as unknown as object));
  });

  test('T5 — silently no-ops when the panel is missing from the DOM', () => {
    const dom = new JSDOM(`<!DOCTYPE html><div></div>`);
    (globalThis as { document?: unknown }).document = dom.window.document;
    (globalThis as { window?: unknown }).window = dom.window as unknown;
    const tabs = buildIntegrationsTabs();
    assert.doesNotThrow(() => tabs.render({}));
  });

  // T6 — qor-debug regression guard. TabGroup fans onEvent to EVERY sub-view
  // (tab-group.js), and BicameralRenderer reacts to bicameral.* events by
  // re-rendering. bootstrapBicameral.ts:244 broadcasts `bicameral.connected`
  // AUTONOMOUSLY at activation (background auto-connect) — not only on a
  // user click from the card. If that broadcast lands while the operator is
  // viewing the Open Design sub-tab, the inactive Bicameral sub-view must NOT
  // paint its card into the shared content element and clobber the live pane.
  test('T6 — autonomous bicameral.connected must not clobber the active Open Design pane', async () => {
    setupDom();
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const origFetch = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = (async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes('/status')
          ? { ok: true, state: 'running', capabilities: [] }
          : { ok: true, features: [] },
    })) as unknown;
    try {
      const tabs = buildIntegrationsTabs();
      tabs.render({});
      await flush();
      // Navigate to the Open Design sub-view — Bicameral is now inactive.
      pillByLabel('Open Design')!.click();
      assert.ok(document.querySelector('.cc-open-design-card'), 'precondition: Open Design pane is active');

      // Autonomous activation-time broadcast arrives while Open Design is showing.
      tabs.onEvent({ type: 'bicameral.connected' });
      await flush();
      await flush();

      assert.ok(
        document.querySelector('.cc-open-design-card'),
        'Open Design pane must survive an autonomous bicameral.connected broadcast',
      );
      assert.ok(
        !document.querySelector('.cc-bicameral-card'),
        'inactive Bicameral sub-view must NOT paint over the active pane',
      );
    } finally {
      (globalThis as { fetch?: unknown }).fetch = origFetch;
    }
  });
});

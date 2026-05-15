// Functional tests for the Risk Register UI source-pill renderer
// (FX420 — plan-qor-model-sourced-risks Phase 5).

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error JS module import in TS test context
import { RisksRenderer } from '../../../src/roadmap/ui/modules/risks.js';

function setupDom(): { dom: JSDOM; container: Element; restore: () => void } {
  const dom = new JSDOM('<!DOCTYPE html><div id="risks-root"></div>');
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  const container = dom.window.document.getElementById('risks-root')!;
  return {
    dom, container,
    restore: () => {
      (globalThis as { document?: unknown }).document = undefined;
      (globalThis as { window?: unknown }).window = undefined;
    },
  };
}

suite('risks.js RisksRenderer source pill (FX420)', () => {
  test('FX420 audit-veto risk with ledgerEntry renders "audit-veto · Entry #271"', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new RisksRenderer('risks-root');
      renderer.render({
        risks: [{
          id: 'r1', title: 'Audit gate failure', severity: 'critical',
          description: 'desc', source: 'audit-veto',
          derivedFrom: { ledgerEntry: 271 },
        }],
      });
      const pill = container.querySelector('.cc-source-pill');
      assert.ok(pill, 'expected a source pill element');
      assert.match(pill!.textContent!, /audit-veto.*Entry #271/);
    } finally { restore(); }
  });

  test('FX420 mcp risk with sourceAgent renders "mcp · claude-code"', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new RisksRenderer('risks-root');
      renderer.render({
        risks: [{
          id: 'r2', title: 'Tool-sourced risk', severity: 'high',
          description: 'desc', source: 'mcp', sourceAgent: 'claude-code',
        }],
      });
      const pill = container.querySelector('.cc-source-pill');
      assert.ok(pill);
      assert.match(pill!.textContent!, /mcp.*claude-code/);
    } finally { restore(); }
  });

  test('FX420 render emits no "+ Add Risk" affordance', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new RisksRenderer('risks-root');
      renderer.render({ risks: [] });
      const addBtn = container.querySelector('.cc-risk-add');
      assert.equal(addBtn, null, 'no add-risk affordance should be rendered');
      assert.doesNotMatch(container.innerHTML, /\+\s*Add Risk/i);
    } finally { restore(); }
  });

  test('FX420 manual-source risk renders bare "manual" pill without context', () => {
    const { container, restore } = setupDom();
    try {
      const renderer = new RisksRenderer('risks-root');
      renderer.render({
        risks: [{
          id: 'r3', title: 'Legacy risk', severity: 'low',
          description: 'desc', source: 'manual',
        }],
      });
      const pill = container.querySelector('.cc-source-pill');
      assert.ok(pill);
      assert.equal(pill!.textContent!.trim(), 'manual');
    } finally { restore(); }
  });
});

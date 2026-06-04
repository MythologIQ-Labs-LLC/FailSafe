// Structural (jsdom) tests for the shared install-progress component (GH #166).
// Verifies the step-list, status icons, inline errors, custom wrapper class, and
// the empty/starting state — the contract every integration relies on.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { renderInstallProgress, renderInstallStep } from '../../../src/roadmap/ui/modules/install-progress.js';

interface G { window?: unknown; document?: unknown }
function withDom<T>(fn: () => T): T {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const g = global as unknown as G;
  const prev = { window: g.window, document: g.document };
  g.window = dom.window;
  g.document = dom.window.document;
  try { return fn(); } finally { g.window = prev.window; g.document = prev.document; }
}

suite('shared install-progress component (GH #166)', () => {
  test('renders one li per step with the right status icon', () => {
    withDom(() => {
      const html = renderInstallProgress({
        mode: 'solo',
        steps: [
          { phase: 'pip-install', status: 'success' },
          { phase: 'setup', status: 'running' },
        ],
      });
      assert.equal((html.match(/<li/g) || []).length, 2);
      assert.ok(html.includes('✓'), 'success icon');
      assert.ok(html.includes('⏳'), 'running icon');
      assert.ok(/solo mode/.test(html), 'mode label');
    });
  });

  test('an error step shows the ✗ icon + inline error text', () => {
    withDom(() => {
      const li = renderInstallStep({ phase: 'setup', status: 'error', error: 'boom' });
      assert.ok(li.includes('✗'));
      assert.ok(li.includes('boom'));
    });
  });

  test('custom className is applied to the wrapper (back-compat for Bicameral)', () => {
    withDom(() => {
      const html = renderInstallProgress(
        { mode: 'team', steps: [{ phase: 'pip-install', status: 'success' }] },
        { className: 'cc-bicameral-install-progress' },
      );
      assert.ok(/cc-install-progress/.test(html), 'generic class present');
      assert.ok(/cc-bicameral-install-progress/.test(html), 'integration class preserved');
    });
  });

  test('empty/absent steps render a "starting" placeholder, not an empty list', () => {
    withDom(() => {
      assert.ok(/Starting solo install/.test(renderInstallProgress({ mode: 'solo', steps: [] })));
      assert.ok(/Starting/.test(renderInstallProgress(null as unknown as object)));
    });
  });

  test('error text is HTML-escaped (no injection through step.error)', () => {
    withDom(() => {
      const li = renderInstallStep({ phase: 'x', status: 'error', error: '<img src=x onerror=alert(1)>' });
      assert.ok(!li.includes('<img'), 'raw tag escaped');
      assert.ok(li.includes('&lt;img'), 'escaped form present');
    });
  });
});

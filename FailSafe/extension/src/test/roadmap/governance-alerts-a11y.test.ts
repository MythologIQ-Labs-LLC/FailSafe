// FX920 — governance-alert rows: keyboard operability + modal focus-return,
// including the V1 restore-by-selector fallback under destructive re-renders
// (rows are innerHTML-recreated on EVERY hub refresh; audit #570/#571).
//
// Harness: prototype-call over the exported WebPanelClient so no constructor
// (WebSocket, full element map) is needed — the methods under test only touch
// `this.elements.governanceAlerts`, `this.escapeHtml`, `this.showAlertDetails`.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error JS module import in TS test context
import { WebPanelClient } from '../../../src/roadmap/ui/roadmap.js';

const ALERTS = [
  { id: 'veto-548', type: 'VETO', message: 'Audit VETO on plan X', entry: 548 },
  { id: 'block-549', type: 'BLOCK', message: 'Write blocked by policy', entry: 549 },
];

function setup() {
  const dom = new JSDOM('<!DOCTYPE html><div id="governance-alerts"></div>', {
    url: 'http://localhost/index.html',
  });
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { window?: unknown }).window = dom.window as unknown;
  // N1 (audit #571): the fallback uses CSS.escape — wire the jsdom CSS global
  // exactly like the transparency-renderer setupDom pattern.
  (globalThis as { CSS?: unknown }).CSS = dom.window.CSS;
  const host = dom.window.document.getElementById('governance-alerts')!;
  const fake: any = {
    elements: { governanceAlerts: host },
    escapeHtml: WebPanelClient.prototype.escapeHtml,
  };
  fake.showAlertDetails = (alert: unknown) => WebPanelClient.prototype.showAlertDetails.call(fake, alert);
  const render = (alerts: unknown[]) => WebPanelClient.prototype.renderGovernanceAlerts.call(fake, alerts);
  return {
    dom, host, render,
    restore: () => {
      (globalThis as { document?: unknown }).document = undefined;
      (globalThis as { window?: unknown }).window = undefined;
      (globalThis as { CSS?: unknown }).CSS = undefined;
    },
  };
}

suite('governance-alert rows a11y (FX920)', () => {
  test('rows are focusable, named, device-neutral, and Enter opens the details modal', () => {
    const { dom, host, render, restore } = setup();
    try {
      render(ALERTS);
      const row = host.querySelector('[data-alert-id="veto-548"]') as HTMLElement;
      assert.ok(row, 'row rendered');
      assert.equal(row.getAttribute('tabindex'), '0', 'row must be in the tab order');
      assert.equal(row.getAttribute('role'), 'button', 'row must announce as actionable');
      const label = row.getAttribute('aria-label') || '';
      assert.ok(label.includes('VETO') && label.includes('Audit VETO on plan X'),
        `aria-label must carry type + message; got '${label}'`);
      assert.ok(!/click/i.test(row.getAttribute('title') || ''), 'title must be device-neutral');
      row.focus();
      row.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      const dialog = dom.window.document.querySelector('.cc-modal-overlay[role="dialog"]');
      assert.ok(dialog, 'Enter must open the alert details modal');
      assert.ok(dialog!.contains(dom.window.document.activeElement), 'focus must land inside the dialog');
    } finally { restore(); }
  });

  test('connected case — closing returns focus to the same row (helper restore; fallback is a no-op)', () => {
    const { dom, host, render, restore } = setup();
    try {
      render(ALERTS);
      const row = host.querySelector('[data-alert-id="veto-548"]') as HTMLElement;
      row.focus();
      row.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      assert.equal(dom.window.document.activeElement, row,
        'without a re-render, focus returns to the exact same element');
    } finally { restore(); }
  });

  test('V1 — re-render while open: closing focuses the RECREATED row with the same data-alert-id', () => {
    const { dom, host, render, restore } = setup();
    try {
      render(ALERTS);
      const original = host.querySelector('[data-alert-id="veto-548"]') as HTMLElement;
      original.focus();
      original.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      // Hub refresh mid-modal: every row destroyed and recreated.
      render(ALERTS);
      assert.ok(!original.isConnected, 'precondition: the invoking row was destroyed by the re-render');
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      const active = dom.window.document.activeElement as HTMLElement;
      assert.equal(active?.getAttribute?.('data-alert-id'), 'veto-548',
        'focus must re-anchor to the recreated row (anchor identity), not fall to body');
      assert.notEqual(active, original, 'it is the recreated element, not the destroyed one');
    } finally { restore(); }
  });

  test('click activates exactly once (observer finding 4 — no duplicate-binding regression)', () => {
    const { dom, host, render, restore } = setup();
    try {
      render(ALERTS);
      const row = host.querySelector('[data-alert-id="veto-548"]') as HTMLElement;
      row.click();
      const dialogs = dom.window.document.querySelectorAll('.cc-modal-overlay');
      assert.equal(dialogs.length, 1,
        'one click must open exactly one modal — a reintroduced duplicate listener double-opens');
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    } finally { restore(); }
  });

  test('fallback escaping arm — hostile id with backslash+quote cannot break the selector (CSS global absent)', () => {
    const { dom, host, render, restore } = setup();
    try {
      // Force the non-CSS.escape arm (previously untested — observer 5a; the
      // arm itself was then flagged by CodeQL for missing backslash escaping).
      (globalThis as { CSS?: unknown }).CSS = undefined;
      const hostile = [{ id: 'x\\"onmouseover="1', type: 'VETO', message: 'hostile id', entry: 1 }];
      render(hostile);
      const row = host.querySelector('.governance-alert') as HTMLElement;
      assert.ok(row, 'row rendered');
      row.focus();
      row.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      render(hostile); // destroy + recreate → fallback path must run on close
      assert.doesNotThrow(() => {
        dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      }, 'escaped selector must be syntactically valid');
      const active = dom.window.document.activeElement as HTMLElement;
      assert.equal(active?.classList?.contains('governance-alert'), true,
        'the re-anchor must still find the recreated row through complete escaping');
    } finally { restore(); }
  });

  test('resolved-while-open residual — selector miss leaves focus as-is (no throw)', () => {
    const { dom, host, render, restore } = setup();
    try {
      render(ALERTS);
      const row = host.querySelector('[data-alert-id="veto-548"]') as HTMLElement;
      row.focus();
      row.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      render([ALERTS[1]]); // veto-548 resolved while the modal was open
      assert.doesNotThrow(() => {
        dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
    } finally { restore(); }
  });
});

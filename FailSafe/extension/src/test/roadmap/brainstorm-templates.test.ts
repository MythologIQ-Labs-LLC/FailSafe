// Functional tests for brainstorm-templates (FX214). Pure HTML-string
// generators with no dependencies. Sink: returned HTML structure assertions.

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { escapeHtml, renderShell, renderRightPanel } from '../../../src/roadmap/ui/modules/brainstorm-templates.js';

suite('brainstorm-templates (FX214)', () => {
  test('FX214 escapeHtml — escapes the 5 HTML-significant characters', () => {
    assert.equal(escapeHtml('&'), '&amp;');
    assert.equal(escapeHtml('<'), '&lt;');
    assert.equal(escapeHtml('>'), '&gt;');
    assert.equal(escapeHtml('"'), '&quot;');
    assert.equal(escapeHtml("'"), '&#39;');
  });

  test('FX214 escapeHtml — returns empty string for empty input', () => {
    assert.equal(escapeHtml(''), '');
  });

  test('FX214 escapeHtml — coerces non-string input to string before escaping', () => {
    assert.equal(escapeHtml(42), '42');
    assert.equal(escapeHtml(null), 'null');
    assert.equal(escapeHtml(undefined), 'undefined');
  });

  test('FX214 escapeHtml — round-trips harmless ASCII unchanged', () => {
    assert.equal(escapeHtml('hello world 123'), 'hello world 123');
  });

  test('FX214 escapeHtml — neutralizes a script-injection payload', () => {
    const hostile = '<script>alert("xss")</script>';
    const escaped = escapeHtml(hostile);
    assert.ok(!escaped.includes('<script>'));
    assert.ok(escaped.includes('&lt;script&gt;'));
  });

  test('FX214 renderShell — returns HTML with the 3 layout buttons', () => {
    const html = renderShell();
    assert.match(html, /data-layout="FORCE"/);
    assert.match(html, /data-layout="TREE"/);
    assert.match(html, /data-layout="CIRCLE"/);
  });

  test('FX214 renderShell — returns HTML with the 2 view-mode buttons', () => {
    const html = renderShell();
    assert.match(html, /data-view="2D"/);
    assert.match(html, /data-view="3D"/);
    // The 2D button should be marked active by default
    assert.match(html, /class="cc-btn cc-bs-view active" data-view="2D"/);
  });

  test('FX214 renderShell — returns Undo/Redo/Export/Reset action buttons', () => {
    const html = renderShell();
    assert.match(html, /class="cc-btn cc-bs-undo"/);
    assert.match(html, /class="cc-btn cc-bs-redo"/);
    assert.match(html, /class="cc-btn cc-bs-export"/);
    assert.match(html, /class="cc-btn cc-btn--danger cc-bs-clear"/);
  });

  test('FX214 renderShell — includes brainstorm canvas mount point', () => {
    const html = renderShell();
    assert.match(html, /class="cc-canvas cc-brainstorm-canvas"/);
  });

  test('FX214 renderRightPanel — includes Topology Legend section', () => {
    const html = renderRightPanel();
    assert.match(html, /Topology Legend/);
  });

  test('FX214 renderRightPanel — includes AI Extraction Tiers status section', () => {
    const html = renderRightPanel();
    assert.match(html, /AI Extraction Tiers/);
    assert.match(html, /class="cc-bs-llm-indicator"/);
  });

  test('FX214 renderRightPanel — includes Ideation Prep Bay with input + record + send', () => {
    const html = renderRightPanel();
    assert.match(html, /Ideation Prep Bay/);
    assert.match(html, /class="cc-bs-prep-input"/);
    assert.match(html, /class="cc-btn cc-bs-voice"/);
    assert.match(html, /class="cc-btn cc-btn--primary cc-bs-prep-send"/);
  });

  test('FX214 renderRightPanel — includes wake-word toggle + history dropdown', () => {
    const html = renderRightPanel();
    assert.match(html, /class="cc-bs-wake-toggle"/);
    assert.match(html, /class="cc-bs-history"/);
  });
});

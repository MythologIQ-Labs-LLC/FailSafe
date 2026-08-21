// Functional tests for brainstorm-templates (FX214). Pure HTML-string
// generators with no dependencies. Sink: returned HTML structure assertions.

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { escapeHtml, renderShell, renderRightPanel, renderListView } from '../../../src/roadmap/ui/modules/brainstorm-templates.js';

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

  test('FX244 renderShell — includes the density-status disclosure element, starting blank not "0 nodes"', () => {
    const html = renderShell();
    assert.match(html, /class="cc-bs-density-status"/);
    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    // Must not assert a measured "0 nodes" before any measurement has run —
    // an aria-live reader should never announce a count that was never taken.
    const tag = html.match(/<span class="cc-bs-density-status"[^>]*>([^<]*)<\/span>/);
    assert.ok(tag, 'density-status span must exist in renderShell() output');
    assert.equal(tag?.[1], '');
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

// #325 (FX912) — accessible name + list-view alternative. Written FIRST per TDD.
suite('brainstorm-templates list view (FX912/#325)', () => {
  test('T1: renderShell carries the canvas accessible name and the LIST VIEW toggle', () => {
    const html = renderShell();
    assert.match(html, /cc-brainstorm-canvas"[^>]*role="img"/s);
    assert.match(html, /aria-label="Mind Map graph[^"]*"/);
    assert.match(html, /class="cc-btn cc-bs-list-toggle" aria-pressed="false"/);
    assert.match(html, /class="cc-bs-list-view" style="display:none;"/);
  });

  test('T2: renderListView renders captioned node/edge tables with degrees and escaped content', () => {
    const html = renderListView(
      [
        { id: 'a', label: 'Alpha <script>alert(1)</script>', level: 'core' },
        { id: 'b', label: 'Beta', level: 'idea' },
      ],
      [{ source: 'a', target: 'b', label: 'links' }],
    );
    assert.match(html, /<caption>Nodes<\/caption>/);
    assert.match(html, /<caption>Edges<\/caption>/);
    assert.ok(!html.includes('<script>alert(1)</script>'), 'labels must be escaped');
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /<td>Beta<\/td>/);
    // degree: both nodes touch the single edge once
    const degreeCells = html.match(/<td>1<\/td>/g) || [];
    assert.ok(degreeCells.length >= 2, 'each node shows its connection degree');
    assert.match(html, /<td>Alpha[\s\S]*?<td>links<\/td>[\s\S]*?<td>Beta/, 'edge row shows source/label/target');
  });
});


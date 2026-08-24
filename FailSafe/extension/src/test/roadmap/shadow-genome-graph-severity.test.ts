// FX935 — Shadow Genome node accessible name carries severity (#242 follow-up).
// nodeSvg() builds each node's aria-label from type+label only; a failure
// node's severity (conveyed elsewhere purely via stroke color) was never
// part of the accessible name. Table view and the inspector drawer already
// surface severity as text — this pins the graph's own primary nodes to the
// same parity, without changing color-coding or any other view.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { renderGenomeMode } from '../../roadmap/ui/modules/shadow-genome-graph.js';

function withDom<T>(fn: () => T): T {
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  const prev = (global as { document?: unknown }).document;
  (global as { document: unknown }).document = dom.window.document;
  try { return fn(); } finally { (global as { document: unknown }).document = prev; }
}

function ariaLabelFor(html: string, nodeId: string): string | null {
  const re = new RegExp(`data-node="${nodeId}"[^>]*aria-label="([^"]*)"`);
  const m = html.match(re);
  return m ? m[1] : null;
}

const graph = {
  nodes: [
    { id: 'g1', type: 'governance', label: 'Plan gate' },
    { id: 'f1', type: 'failure', label: 'Spec Drift' },
    { id: 'f2', type: 'failure', label: 'Unclassified Failure' },
    { id: 'o1', type: 'other', label: 'Something Else' },
  ],
  edges: [
    { id: 'e1', source: 'f1', target: 'g1', type: 'applies_to' },
  ],
};

suite('FX935 Shadow Genome node accessible name carries severity', () => {
  test('a classified failure node\'s aria-label ends ", severity {value}"', () => {
    const html = withDom(() => renderGenomeMode(
      { graph, incidents: [{ id: 'f1', severity: 'active' }] },
      { view: 'graph', zoom: 1, selectedId: null }
    ));
    assert.equal(ariaLabelFor(html, 'f1'), 'failure: Spec Drift, severity active');
  });

  test('a failure node absent from incidents reads "severity unclassified", not silently omitted', () => {
    const html = withDom(() => renderGenomeMode(
      { graph, incidents: [{ id: 'f1', severity: 'active' }] },
      { view: 'graph', zoom: 1, selectedId: null }
    ));
    assert.equal(ariaLabelFor(html, 'f2'), 'failure: Unclassified Failure, severity unclassified');
  });

  test('governance and non-failure nodes are unaffected — no severity suffix added', () => {
    const html = withDom(() => renderGenomeMode(
      { graph, incidents: [{ id: 'f1', severity: 'active' }] },
      { view: 'graph', zoom: 1, selectedId: null }
    ));
    assert.equal(ariaLabelFor(html, 'g1'), 'governance: Plan gate');
    assert.equal(ariaLabelFor(html, 'o1'), 'other: Something Else');
  });

  test('severity text is HTML-escaped like every other interpolated value', () => {
    const html = withDom(() => renderGenomeMode(
      { graph, incidents: [{ id: 'f1', severity: '<script>' }] },
      { view: 'graph', zoom: 1, selectedId: null }
    ));
    assert.equal(ariaLabelFor(html, 'f1'), 'failure: Spec Drift, severity &lt;script&gt;');
  });
});

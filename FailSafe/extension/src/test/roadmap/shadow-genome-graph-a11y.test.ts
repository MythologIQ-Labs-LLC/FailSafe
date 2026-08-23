// FX242 (accessibility audit #242, Shadow Genome populated-fixture walkthrough):
// each failure node's accessible name conveyed only type + label, never severity
// — severity was only distinguishable by stroke color (var(--accent-red|orange|
// gold|cyan)), set inline. The Table-view fallback and the incident ledger both
// already show severity as visible text, so this was a graph-view-only parity
// gap: a screen-reader or forced-colors/high-contrast user browsing the Genome
// Map itself (without switching to Table view) could not learn a failure node's
// severity from the node.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error JS module import in TS test context
import { renderGenomeMode } from '../../../src/roadmap/ui/modules/shadow-genome-graph.js';

const GRAPH = {
  nodes: [
    { id: 'g1', type: 'governance', label: 'Governance: plan gate' },
    { id: 'f1', type: 'failure', label: 'Spec Drift' },
    { id: 'f2', type: 'failure', label: 'Authority Leak' },
    { id: 'f3', type: 'failure', label: 'Untriaged Failure' },
  ],
  edges: [
    { id: 'e1', source: 'g1', target: 'f1', type: 'applies_to' },
    { id: 'e2', source: 'g1', target: 'f2', type: 'triggered_by' },
  ],
};

const INCIDENTS = [
  { id: 'f1', label: 'Spec Drift', severity: 'repeated' },
  { id: 'f2', label: 'Authority Leak', severity: 'emerging' },
  // f3 intentionally has no incident entry — exercises the 'unclassified' fallback.
];

function setup() {
  const dom = new JSDOM('<!DOCTYPE html><div id="host"></div>', { url: 'http://localhost/index.html' });
  (globalThis as { document?: unknown }).document = dom.window.document;
  const host = dom.window.document.getElementById('host')!;
  return {
    dom, host,
    restore: () => { (globalThis as { document?: unknown }).document = undefined; },
  };
}

suite('Shadow Genome graph node accessible names carry severity (#242)', () => {
  test('failure nodes announce severity in their aria-label, matching the Table view\'s Severity column', () => {
    const { host, restore } = setup();
    try {
      const html = renderGenomeMode({ graph: GRAPH, incidents: INCIDENTS }, { view: 'graph', zoom: 1, selectedId: null });
      host.innerHTML = html;

      const f1 = host.querySelector('[data-node="f1"]');
      assert.ok(f1, 'f1 node rendered');
      assert.equal(f1!.getAttribute('aria-label'), 'failure: Spec Drift (severity: repeated)');

      const f2 = host.querySelector('[data-node="f2"]');
      assert.ok(f2, 'f2 node rendered');
      assert.equal(f2!.getAttribute('aria-label'), 'failure: Authority Leak (severity: emerging)');

      const f3 = host.querySelector('[data-node="f3"]');
      assert.ok(f3, 'f3 node rendered');
      assert.equal(f3!.getAttribute('aria-label'), 'failure: Untriaged Failure (severity: unclassified)',
        'a failure node with no matching incident falls back to \'unclassified\', mirroring buildTable()');
    } finally { restore(); }
  });

  test('governance nodes are unaffected — no severity concept applies to them', () => {
    const { host, restore } = setup();
    try {
      const html = renderGenomeMode({ graph: GRAPH, incidents: INCIDENTS }, { view: 'graph', zoom: 1, selectedId: null });
      host.innerHTML = html;

      const g1 = host.querySelector('[data-node="g1"]');
      assert.ok(g1, 'g1 node rendered');
      assert.equal(g1!.getAttribute('aria-label'), 'governance: Governance: plan gate');
    } finally { restore(); }
  });

  test('Table view already exposes the same severity values as visible text (regression guard on the source of truth)', () => {
    const { host, restore } = setup();
    try {
      const html = renderGenomeMode({ graph: GRAPH, incidents: INCIDENTS }, { view: 'table', zoom: 1, selectedId: null });
      host.innerHTML = html;

      const rows = Array.from(host.querySelectorAll('.sg-data-table tbody tr'));
      const f1Row = rows.find((r) => r.querySelector('code')?.textContent === 'f1');
      assert.ok(f1Row, 'f1 row rendered in table view');
      const cells = f1Row!.querySelectorAll('td');
      assert.equal(cells[3].textContent, 'repeated');
    } finally { restore(); }
  });
});

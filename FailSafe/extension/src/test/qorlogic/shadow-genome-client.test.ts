// Functional tests for the shadow-genome client (#118, first slice — data layer).
// Pure parse/filter/summarize + an off-by-default live loader with an INJECTED
// RunCommand (no real Python in tests). Consumes qor-logic's
// shadow_genome_graph.to_json() contract: {nodes:[{id,type,label,metadata}],
// edges:[{id,source,target,type,metadata}]}.

import { strict as assert } from 'assert';
import {
  parseGenomeGraph, summarizeGenome, governanceSubgraph, loadShadowGenome,
} from '../../qorlogic/shadow-genome-client';
import type { RunCommand } from '../../qorlogic/PythonInterpreterResolver';

const SAMPLE = JSON.stringify({
  nodes: [
    { id: 'n1', type: 'governance', label: 'seal #424', metadata: { phase: 'DELIVER' } },
    { id: 'n2', type: 'failure', label: 'FX525 timeout', metadata: {} },
    { id: 'n3', type: 'checkpoint', label: 'ckpt-1', metadata: {} },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', type: 'triggered_by', metadata: {} },
    { id: 'e2', source: 'n3', target: 'n3', type: 'self', metadata: {} },
  ],
});

suite('qorlogic shadow-genome client (#118)', () => {
  test('parseGenomeGraph: parses the to_json contract into typed nodes/edges', () => {
    const g = parseGenomeGraph(SAMPLE);
    assert.equal(g.nodes.length, 3);
    assert.equal(g.edges.length, 2);
    assert.equal(g.nodes[0].type, 'governance');
    assert.equal(g.edges[0].source, 'n1');
    assert.equal(g.edges[0].target, 'n2');
  });

  test('parseGenomeGraph: tolerant — garbage/empty → empty graph, no throw', () => {
    assert.deepEqual(parseGenomeGraph('not json'), { nodes: [], edges: [] });
    assert.deepEqual(parseGenomeGraph(''), { nodes: [], edges: [] });
    assert.deepEqual(parseGenomeGraph('{"nodes":"x"}'), { nodes: [], edges: [] });
  });

  test('summarizeGenome: counts by node/edge type', () => {
    const s = summarizeGenome(parseGenomeGraph(SAMPLE));
    assert.equal(s.nodes, 3);
    assert.equal(s.edges, 2);
    assert.equal(s.nodeTypes.governance, 1);
    assert.equal(s.nodeTypes.failure, 1);
    assert.equal(s.edgeTypes.triggered_by, 1);
  });

  test('governanceSubgraph: governance nodes + incident edges + the neighbours they reach', () => {
    const sub = governanceSubgraph(parseGenomeGraph(SAMPLE));
    // n1 (governance) + n2 (reached by e1) — but NOT n3 (no governance link).
    const ids = sub.nodes.map((n) => n.id).sort();
    assert.deepEqual(ids, ['n1', 'n2']);
    assert.deepEqual(sub.edges.map((e) => e.id), ['e1'], 'only the governance-incident edge');
  });

  test('loadShadowGenome: OFF by default — enabled!==true ⇒ localOnly, RunCommand never called', async () => {
    let calls = 0;
    const run: RunCommand = async () => { calls += 1; return { stdout: '', stderr: '', code: 0 }; };
    const res = await loadShadowGenome({ run, python: 'python' });
    assert.equal(res.ok, true);
    assert.equal(res.localOnly, true);
    assert.equal(calls, 0, 'no Python subprocess unless explicitly enabled');
  });

  test('loadShadowGenome: enabled + stub Python ⇒ parsed graph + summary', async () => {
    const run: RunCommand = async (_cmd, args) => {
      assert.ok(args.includes('-c'), 'runs a python -c one-liner');
      return { stdout: SAMPLE, stderr: '', code: 0 };
    };
    const res = await loadShadowGenome({ run, python: 'python', enabled: true, genomePath: '.qor/genome.jsonl' });
    assert.equal(res.ok, true);
    assert.equal(res.localOnly, undefined);
    assert.equal(res.graph!.nodes.length, 3);
    assert.equal(res.summary!.nodeTypes.governance, 1);
  });

  test('loadShadowGenome: degrade-safe — Python exits non-zero ⇒ ok:false, no throw', async () => {
    const run: RunCommand = async () => ({ stdout: '', stderr: 'ModuleNotFoundError', code: 1 });
    const res = await loadShadowGenome({ run, python: 'python', enabled: true });
    assert.equal(res.ok, false);
    assert.ok(res.error && res.error.length > 0);
    assert.equal(res.graph, undefined);
  });
});

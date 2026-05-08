// Functional tests for BrainstormService (FX446 + FX212 orchestrator).

import { strict as assert } from 'assert';
import { BrainstormService } from '../../roadmap/services/BrainstormService';

const VALID_RESPONSE = JSON.stringify({
  nodes: [
    { id: 'n1', label: 'auth flow', type: 'Feature', confidence: 80 },
    { id: 'n2', label: 'JWT verify', type: 'Architecture', confidence: 70 },
  ],
  edges: [{ source: 'n1', target: 'n2', label: 'requires' }],
  verbalResponse: 'Two concepts extracted',
});

function makeLlm(responses: string[]): { calls: number; fn: any } {
  let calls = 0;
  return {
    get calls() { return calls; },
    fn: async (_p: string, _t: string) => {
      const r = responses[calls] ?? '{"nodes":[],"edges":[]}';
      calls++;
      return r;
    },
  };
}

suite('BrainstormService (FX446 + FX212)', () => {
  test('FX446 processTranscript — valid LLM response merges nodes + edges into graph', async () => {
    const llm = makeLlm([VALID_RESPONSE]);
    const s = new BrainstormService(llm.fn);
    const r = await s.processTranscript('Tell me about auth');
    assert.ok(r.extraction);
    assert.equal(r.extraction!.nodes.length, 2);
    assert.equal(r.extraction!.edges.length, 1);
    assert.equal(r.extraction!.verbalResponse, 'Two concepts extracted');
    const graph = s.getGraph();
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.edges.length, 1);
  });

  test('FX446 processTranscript — duplicate node id is not re-added', async () => {
    const llm = makeLlm([VALID_RESPONSE, VALID_RESPONSE]);
    const s = new BrainstormService(llm.fn);
    await s.processTranscript('first');
    await s.processTranscript('second');
    // Same node IDs (n1, n2) → should not duplicate
    assert.equal(s.getGraph().nodes.length, 2);
    // Edges accumulate (no dedup logic)
    assert.equal(s.getGraph().edges.length, 2);
  });

  test('FX446 processTranscript — invalid JSON triggers retry with strict prompt', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) return 'Sorry, I cannot extract that.'; // invalid
      return VALID_RESPONSE;
    };
    const s = new BrainstormService(fn);
    const r = await s.processTranscript('go');
    assert.ok(r.extraction);
    assert.equal(callCount, 2, 'should call LLM twice (initial + retry)');
  });

  test('FX446 processTranscript — both attempts fail → queues transcript', async () => {
    const fn = async () => 'permanently broken';
    const s = new BrainstormService(fn);
    const r = await s.processTranscript('broken');
    assert.equal(r.extraction, undefined);
    assert.ok(r.queued);
    assert.equal(r.queued!.transcript, 'broken');
  });

  test('FX446 processTranscript — LLM throw → queues transcript', async () => {
    const fn = async () => { throw new Error('rate limited'); };
    const s = new BrainstormService(fn);
    const r = await s.processTranscript('attempt');
    assert.ok(r.queued);
    assert.deepEqual(s.getGraph().nodes, []);
  });

  test('FX446 queueTranscript — adds entry with id + queuedAt timestamp', () => {
    const s = new BrainstormService(async () => '');
    const entry = s.queueTranscript('test transcript');
    assert.match(entry.id, /^q-/);
    assert.match(entry.queuedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(entry.transcript, 'test transcript');
    assert.equal(s.getPendingTranscripts().length, 1);
  });

  test('FX446 retryPending — re-processes all queued + clears queue', async () => {
    let calls = 0;
    const fn = async () => { calls++; return calls === 1 ? 'broken' : VALID_RESPONSE; };
    const s = new BrainstormService(fn);
    s.queueTranscript('first');
    s.queueTranscript('second');
    const results = await s.retryPending();
    assert.equal(results.length, 2);
    assert.equal(s.getPendingTranscripts().length, 0, 'queue should be cleared after retry');
  });

  test('FX446 addNode — creates node with truncated label (>200 chars)', () => {
    const s = new BrainstormService(async () => '');
    const longLabel = 'A'.repeat(300);
    const node = s.addNode(longLabel, 'Feature');
    assert.equal(node.label.length, 200);
    assert.equal(node.type, 'Feature');
    assert.equal(node.confidence, -1);
  });

  test('FX446 addNode — clientId reuse returns existing node', () => {
    const s = new BrainstormService(async () => '');
    const a = s.addNode('first', 'Feature', 'fixed-id');
    const b = s.addNode('second', 'Risk', 'fixed-id');
    assert.equal(a.id, b.id);
    assert.equal(a.label, 'first', 'label preserved on collision');
  });

  test('FX446 updateNode — known id mutates label + type', () => {
    const s = new BrainstormService(async () => '');
    const node = s.addNode('orig', 'Feature', 'n-1');
    const updated = s.updateNode('n-1', 'new label', 'Risk');
    assert.equal(updated?.label, 'new label');
    assert.equal(updated?.type, 'Risk');
  });

  test('FX446 updateNode — unknown id returns null', () => {
    const s = new BrainstormService(async () => '');
    assert.equal(s.updateNode('does-not-exist', 'x', 'Feature'), null);
  });

  test('FX446 removeNode — known id removes node + cascades edges', async () => {
    const llm = makeLlm([VALID_RESPONSE]);
    const s = new BrainstormService(llm.fn);
    await s.processTranscript('test');
    assert.equal(s.getGraph().edges.length, 1);
    assert.equal(s.removeNode('n1'), true);
    assert.equal(s.getGraph().nodes.length, 1);
    assert.equal(s.getGraph().edges.length, 0, 'edge cascade-deleted');
  });

  test('FX446 removeNode — unknown id returns false', () => {
    const s = new BrainstormService(async () => '');
    assert.equal(s.removeNode('does-not-exist'), false);
  });

  test('FX446 reset — clears all nodes + edges', async () => {
    const llm = makeLlm([VALID_RESPONSE]);
    const s = new BrainstormService(llm.fn);
    await s.processTranscript('test');
    assert.ok(s.getGraph().nodes.length > 0);
    s.reset();
    assert.deepEqual(s.getGraph().nodes, []);
    assert.deepEqual(s.getGraph().edges, []);
  });

  test('FX446 parseExtraction — missing nodes array → falls into queue path via processTranscript', async () => {
    const fn = async () => JSON.stringify({ edges: [] }); // no nodes
    const s = new BrainstormService(fn);
    const r = await s.processTranscript('bad');
    assert.ok(r.queued, 'malformed shape → queued not extraction');
  });
});

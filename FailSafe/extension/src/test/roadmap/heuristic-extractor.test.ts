// Functional tests for heuristic-extractor (FX217 + FX211).
// Pure-logic module: transcript → {nodes, edges, status, verbalResponse}.
// Sink: returned object structure + content.

import { strict as assert } from 'assert';
// @ts-expect-error JS module without .d.ts
import { heuristicExtract, TYPE_SIGNALS } from '../../../src/roadmap/ui/modules/heuristic-extractor.js';

interface ExtractedNode { id: string; label: string; type: string; confidence: number; }
interface ExtractedEdge { source: string; target: string; label: string; }
interface ExtractResult {
  status: string;
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
  verbalResponse: string;
}

suite('heuristic-extractor (FX217, FX211)', () => {
  test('TYPE_SIGNALS — every type maps to a regex; Idea is the catch-all', () => {
    const types = Object.keys(TYPE_SIGNALS);
    for (const t of types) {
      assert.ok(TYPE_SIGNALS[t] instanceof RegExp, `${t} should be a RegExp`);
    }
    // Idea matches everything (catch-all)
    assert.ok(TYPE_SIGNALS.Idea.test('xyz'));
    // Risk matches risk language
    assert.ok(TYPE_SIGNALS.Risk.test('this is a critical risk'));
    assert.equal(TYPE_SIGNALS.Risk.test('we should celebrate'), false);
  });

  test('empty transcript → single fallback Idea node, no edges', () => {
    const got = heuristicExtract('') as ExtractResult;
    assert.equal(got.status, 'heuristic-extracted');
    assert.equal(got.nodes.length, 1);
    assert.equal(got.nodes[0].type, 'Idea');
    assert.equal(got.nodes[0].label, 'Brainstorm idea');
    assert.deepEqual(got.edges, []);
    assert.match(got.verbalResponse, /no LLM available/);
  });

  test('whitespace-only transcript → single fallback Idea node', () => {
    const got = heuristicExtract('     \n\t   ') as ExtractResult;
    assert.equal(got.nodes.length, 1);
    assert.equal(got.nodes[0].label, 'Brainstorm idea');
  });

  test('single-sentence transcript → single node, no edges', () => {
    const got = heuristicExtract('We need to ship the new login screen.') as ExtractResult;
    assert.equal(got.status, 'heuristic-extracted');
    assert.equal(got.nodes.length, 1);
    assert.equal(got.nodes[0].type, 'Task'); // "need to" matches Task
    assert.deepEqual(got.edges, []);
  });

  test('multi-sentence transcript → multiple nodes + sequential chain edges', () => {
    const got = heuristicExtract(
      'We need to fix the login bug. There is a security risk in the cookie handler. Maybe we choose a different framework.',
    ) as ExtractResult;
    assert.equal(got.nodes.length, 3);
    // Sequential chain: 2 edges connecting 3 nodes
    assert.equal(got.edges.length, 2);
    assert.equal(got.edges[0].source, got.nodes[0].id);
    assert.equal(got.edges[0].target, got.nodes[1].id);
    assert.equal(got.edges[1].source, got.nodes[1].id);
    assert.equal(got.edges[1].target, got.nodes[2].id);
    assert.equal(got.edges[0].label, 'relates to');
  });

  test('type inference — Risk takes precedence over generic Idea', () => {
    const got = heuristicExtract('There is a critical security risk in the auth flow.') as ExtractResult;
    assert.equal(got.nodes[0].type, 'Risk');
  });

  test('type inference — Decision keyword maps to Decision', () => {
    const got = heuristicExtract('We agreed to ship Friday.') as ExtractResult;
    assert.equal(got.nodes[0].type, 'Decision');
  });

  test('type inference — Question keyword maps to Question (when Task signals absent)', () => {
    // First-match-wins ordering: Risk > Decision > Task > Question > Constraint > Idea.
    // Use "how" / "why" without "should/must/need to" so Task doesn't win first.
    const got = heuristicExtract('How can we handle the offline case?') as ExtractResult;
    assert.equal(got.nodes[0].type, 'Question');
  });

  test('type inference — Task wins over Question when both signals present (priority order)', () => {
    // Confirms the documented first-match-wins behavior: Task before Question.
    const got = heuristicExtract('How should we handle the offline case?') as ExtractResult;
    assert.equal(got.nodes[0].type, 'Task');
  });

  test('type inference — Constraint keyword maps to Constraint', () => {
    const got = heuristicExtract('We cannot exceed the marketplace 50 MB limit.') as ExtractResult;
    assert.equal(got.nodes[0].type, 'Constraint');
  });

  test('extraction caps at 8 sentences max', () => {
    const transcript = Array.from({ length: 12 }, (_, i) =>
      `Sentence number ${i + 1} contains an interesting concept.`,
    ).join(' ');
    const got = heuristicExtract(transcript) as ExtractResult;
    assert.ok(got.nodes.length <= 8, `Expected <= 8 nodes; got ${got.nodes.length}`);
    // Sequential chain: edges = nodes - 1
    assert.equal(got.edges.length, got.nodes.length - 1);
  });

  test('label truncation — long sentences truncate to 30 chars', () => {
    const long = 'This is an extremely long sentence with many words that should definitely truncate.';
    const got = heuristicExtract(long) as ExtractResult;
    assert.ok(got.nodes[0].label.length <= 30, `Label "${got.nodes[0].label}" should be <= 30 chars`);
  });

  test('label dedup — duplicate sentences produce a single node', () => {
    const got = heuristicExtract('Ship the login fix. Ship the login fix. Ship the login fix.') as ExtractResult;
    assert.equal(got.nodes.length, 1);
  });

  test('preamble stripping — common conversational filler is removed', () => {
    const got = heuristicExtract("I think we should add rate limiting.") as ExtractResult;
    assert.equal(got.nodes.length, 1);
    // Stripped "I think " then ".", normalized → "we should add rate limiting"
    assert.match(got.nodes[0].label, /add rate limiting/);
    assert.equal(got.nodes[0].label.startsWith('I think'), false);
  });

  test('all returned nodes have positive confidence + non-empty id/label/type', () => {
    const got = heuristicExtract(
      'We need to ship Friday. There is a risk of cache invalidation bugs.',
    ) as ExtractResult;
    for (const n of got.nodes) {
      assert.ok(n.confidence > 0, 'confidence should be > 0');
      assert.ok(n.id.length > 0);
      assert.ok(n.label.length > 0);
      assert.ok(n.type.length > 0);
    }
  });

  test('verbalResponse mentions extracted concept count when nodes > 0', () => {
    const got = heuristicExtract('Ship the login fix. Add rate limiting.') as ExtractResult;
    assert.match(got.verbalResponse, new RegExp(`${got.nodes.length}.*concept`));
  });
});

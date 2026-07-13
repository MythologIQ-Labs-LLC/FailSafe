// FX895 — Prep Bay failure recovery UX (#238). A transcription failure must
// (a) never commit interim text to the ideation buffer, (b) never let
// placeholder failure text reach the POST tier or the local webLlm fallback,
// and (c) surface a visible retry/type-instead status.

import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { PrepBayController } from "../../../src/roadmap/ui/modules/prep-bay.js";

interface Calls {
  submitTranscript: string[];
  extractGraph: string[];
  appendTranscript: string[];
  applyExtraction: number;
  statuses: Array<{ text: string; color?: string }>;
}

function makeHarness(submitResult: unknown = null) {
  const calls: Calls = {
    submitTranscript: [], extractGraph: [], appendTranscript: [], applyExtraction: 0, statuses: [],
  };
  const buffer = {
    currentText: "",
    appendTranscript(t: string) { calls.appendTranscript.push(t); },
    setText() { /* noop */ },
    commit() { return { thought: null, dropped: false }; },
    getHistory() { return []; },
  };
  const graph = {
    submitTranscript: async (t: string) => { calls.submitTranscript.push(t); return submitResult; },
    applyExtraction() { calls.applyExtraction++; },
  };
  const webLlm = {
    extractGraph: async (t: string) => { calls.extractGraph.push(t); return null; },
  };
  const voice = { tts: { speak: async () => { /* noop */ } } };
  const textarea = { value: "", scrollTop: 0, scrollHeight: 0 };
  const getEl = () => textarea;
  const showStatus = (text: string, color?: string) => { calls.statuses.push({ text, color }); };
  const bay: any = new PrepBayController(graph, webLlm, buffer, voice, getEl, showStatus, null);
  return { bay, calls, buffer, textarea };
}

suite("PrepBay failure isolation (FX895)", () => {
  let origDocument: unknown;

  setup(() => {
    origDocument = (globalThis as any).document;
    (globalThis as any).document = { querySelector: () => null };
  });

  teardown(() => {
    (globalThis as any).document = origDocument;
  });

  test("interim onTranscript then onTranscriptError -> buffer untouched, interim text kept, status shown", () => {
    const { bay, calls, buffer, textarea } = makeHarness();
    bay.onTranscript("partial idea", false);
    bay.onTranscriptError("decode_failed");
    assert.deepStrictEqual(calls.appendTranscript, [], "appendTranscript must never be called");
    assert.strictEqual(buffer.currentText, "", "ideation buffer must be unchanged");
    assert.strictEqual(textarea.value, "partial idea", "interim text stays editable in the textarea");
    assert.ok(
      calls.statuses.some((s) => /retry or type instead/i.test(s.text)),
      "actionable failure status must be shown"
    );
  });

  test("submit('[transcription failed]') -> no POST, no webLlm tier, terminal status", async () => {
    const { bay, calls } = makeHarness();
    await bay.submit("[transcription failed]");
    assert.deepStrictEqual(calls.submitTranscript, [], "no fetch/POST may be issued for placeholder text");
    assert.deepStrictEqual(calls.extractGraph, [], "webLlm.extractGraph must not be invoked");
    assert.strictEqual(calls.applyExtraction, 0, "nothing may reach the graph");
    assert.ok(
      calls.statuses.some((s) => /retry or type instead/i.test(s.text)),
      "terminal rejection status must be shown"
    );
  });

  test("submit result carrying rejected -> terminal, webLlm fallback tier skipped", async () => {
    const rejected = { status: "rejected", reason: "placeholder_rejected" };
    const { bay, calls } = makeHarness(rejected);
    await bay.submit("the auth service needs a cache layer");
    assert.deepStrictEqual(calls.submitTranscript, ["the auth service needs a cache layer"]);
    assert.deepStrictEqual(calls.extractGraph, [], "server rejection is terminal — no local fallback");
    assert.strictEqual(calls.applyExtraction, 0, "rejected result must not mutate the graph");
    assert.ok(
      calls.statuses.some((s) => /rejected/i.test(s.text)),
      "server rejection must be visible to the operator"
    );
  });
});

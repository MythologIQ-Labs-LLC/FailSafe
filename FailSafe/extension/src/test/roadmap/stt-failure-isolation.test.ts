// FX895 — STT failure isolation (#238). Decoder/pipeline failures must emit
// a typed onTranscriptError reason and NEVER surface diagnostic text through
// onTranscript. Lives in its own file (not stt-engine-transcription.test.ts)
// per plan LD5 contingency: adding the suite there would exceed the 250-line
// razor cap (file is 226 lines today).

import * as assert from "assert";
// stt-engine.js resolves via the src/types/shims.d.ts wildcard declaration.
import { SttEngine } from "../../../src/roadmap/ui/modules/stt-engine.js";
// @ts-expect-error JS module import in TS test context
import { decodeAndTranscribe, TranscribeError } from "../../../src/roadmap/ui/modules/whisper-decode.js";

type PipelineResult = { text?: string } | Record<string, never>;

function installFakeAudioContext(decodeThrows: boolean): () => void {
  const orig = (globalThis as any).AudioContext;
  class FakeAudioContext {
    async decodeAudioData(_buf: ArrayBuffer): Promise<{ getChannelData: () => Float32Array }> {
      if (decodeThrows) throw new Error("EncodingError: unable to decode audio data");
      return { getChannelData: () => new Float32Array(16) };
    }
    async close(): Promise<void> { /* noop */ }
  }
  (globalThis as any).AudioContext = FakeAudioContext;
  return () => { (globalThis as any).AudioContext = orig; };
}

function makeStore() {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

interface Harness {
  engine: any;
  transcripts: Array<{ text: string; isFinal: boolean }>;
  errors: string[];
}

function makeHarness(pipelineFn: (samples: unknown, opts: unknown) => Promise<PipelineResult>): Harness {
  const engine: any = new SttEngine(makeStore());
  engine._pipeline = {
    isReady: () => true,
    pipeline: () => pipelineFn,
    teardown() { /* noop */ },
    status: () => "ready",
    load: async () => { /* noop */ },
  };
  // Minimal recorder double: stop() fires the 'stop' listener synchronously.
  engine._recorder = {
    _stopCb: null as ((e: unknown) => void) | null,
    addEventListener(name: string, cb: (e: unknown) => void) { if (name === "stop") this._stopCb = cb; },
    stop() { this._stopCb?.({}); },
  };
  engine._chunks = [];
  engine.language = "en-US";
  const transcripts: Array<{ text: string; isFinal: boolean }> = [];
  const errors: string[] = [];
  engine.onTranscript = (text: string, isFinal: boolean) => { transcripts.push({ text, isFinal }); };
  engine.onTranscriptError = (reason: string) => { errors.push(reason); };
  return { engine, transcripts, errors };
}

suite("FX895 failure isolation", () => {
  test("decode throw -> onTranscriptError('decode_failed') exactly once, onTranscript never, state idle", async () => {
    const restore = installFakeAudioContext(true);
    try {
      const { engine, transcripts, errors } = makeHarness(async () => ({ text: "never reached" }));
      engine._setState("processing");
      await engine._stopWhisper();
      assert.deepStrictEqual(errors, ["decode_failed"], "typed error emitted exactly once");
      assert.deepStrictEqual(transcripts, [], "onTranscript must never fire on failure");
      assert.strictEqual(engine.state, "idle", "engine must return to idle after failure");
    } finally { restore(); }
  });

  test("pipeline throw -> onTranscriptError('pipeline_failed'), onTranscript never", async () => {
    const restore = installFakeAudioContext(false);
    try {
      const { engine, transcripts, errors } = makeHarness(async () => { throw new Error("shape mismatch"); });
      await engine._stopWhisper();
      assert.deepStrictEqual(errors, ["pipeline_failed"]);
      assert.deepStrictEqual(transcripts, []);
    } finally { restore(); }
  });

  test("pipeline returns whitespace-only text -> onTranscriptError('empty_result'), onTranscript never", async () => {
    const restore = installFakeAudioContext(false);
    try {
      const { engine, transcripts, errors } = makeHarness(async () => ({ text: "   " }));
      await engine._stopWhisper();
      assert.deepStrictEqual(errors, ["empty_result"]);
      assert.deepStrictEqual(transcripts, []);
    } finally { restore(); }
  });

  test("pipeline returns malformed result (no .text) -> 'empty_result', no throw escapes", async () => {
    const restore = installFakeAudioContext(false);
    try {
      const { engine, transcripts, errors } = makeHarness(async () => ({}));
      await assert.doesNotReject(async () => engine._stopWhisper(), "malformed result must not escape");
      assert.deepStrictEqual(errors, ["empty_result"]);
      assert.deepStrictEqual(transcripts, []);
    } finally { restore(); }
  });

  test("successful decode -> onTranscript(trimmed text, true), onTranscriptError never (regression)", async () => {
    const restore = installFakeAudioContext(false);
    try {
      const { engine, transcripts, errors } = makeHarness(async () => ({ text: " hello world " }));
      await engine._stopWhisper();
      assert.deepStrictEqual(transcripts, [{ text: "hello world", isFinal: true }]);
      assert.deepStrictEqual(errors, [], "no error channel activity on success");
    } finally { restore(); }
  });

  test("decodeAndTranscribe throws typed TranscribeError with reason on decode failure", async () => {
    const restore = installFakeAudioContext(true);
    try {
      const blob = new Blob([], { type: "audio/webm" });
      await assert.rejects(
        () => decodeAndTranscribe(blob, async () => ({ text: "x" }), "en-US"),
        (err: unknown) => {
          assert.ok(err instanceof Error, "Error subclass preserves stack semantics");
          assert.ok(err instanceof TranscribeError, "typed TranscribeError expected");
          assert.strictEqual((err as { reason?: string }).reason, "decode_failed");
          return true;
        }
      );
    } finally { restore(); }
  });
});

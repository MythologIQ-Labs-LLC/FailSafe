import * as assert from "assert";

// IMPORTANT: SpeechRecognitionCtor in whisper-loader.js is captured at module
// import time. Install fakes on globalThis BEFORE importing SttEngine.
const recognitionInstances: FakeRecognition[] = [];

class FakeRecognition {
  public continuous = false;
  public interimResults = false;
  public lang = "";
  public started = false;
  public stopped = false;
  private listeners: Record<string, ((e: unknown) => void)[]> = {};

  constructor() {
    recognitionInstances.push(this);
  }
  addEventListener(name: string, cb: (e: unknown) => void) {
    (this.listeners[name] ||= []).push(cb);
  }
  removeEventListener(name: string, cb: (e: unknown) => void) {
    const arr = this.listeners[name];
    if (!arr) return;
    const i = arr.indexOf(cb);
    if (i !== -1) arr.splice(i, 1);
  }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  fire(name: string, event: unknown) {
    (this.listeners[name] || []).forEach((cb) => cb(event));
  }
}

// JS module import in TS test context. whisper-loader's getSpeechRecognitionCtor()
// now resolves at call time, so suiteSetup-time global install is sufficient —
// no module-level assignment needed (which previously leaked into adjacent
// suites' Node-env assumptions — broke FX228 WakeWordListener test).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { SttEngine } from "../../../src/roadmap/ui/modules/stt-engine.js";

function makeStore(initial: Record<string, unknown> = {}) {
  const m = new Map<string, unknown>(Object.entries(initial));
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

function makeResultsEvent(chunks: string[]): { results: { 0: { transcript: string } }[] } {
  // Mimic SpeechRecognitionResultList: index-accessible items whose [0].transcript
  // is the alternative transcript string. LiveTranscriber iterates by length.
  const results = chunks.map((t) => ({ 0: { transcript: t } }));
  // Attach length so for-loop with e.results.length works on a plain array.
  return { results };
}

function makePipelineStub(cannedText: string) {
  const fakePipeline = async (
    _samples: unknown,
    opts: { language: string }
  ): Promise<{ text: string; language?: string }> => {
    return { text: cannedText, language: opts?.language };
  };
  return {
    isReady: () => true,
    pipeline: () => fakePipeline,
    teardown() { /* noop */ },
    status: () => "ready",
    load: async () => { /* noop */ },
  };
}

function installRecorderShim(engine: any) {
  // Replace mic/recorder acquisition so startListening() does not touch real
  // browser audio APIs. Each override is the smallest possible passthrough.
  engine._acquireStream = async () => true;
  engine._createRecorder = function () {
    this._recorder = {
      _listeners: {} as Record<string, ((e: unknown) => void)[]>,
      start() { /* noop */ },
      stop() {
        const arr = (this as any)._listeners["stop"] || [];
        arr.forEach((cb: (e: unknown) => void) => cb({}));
      },
      addEventListener(name: string, cb: (e: unknown) => void) {
        ((this as any)._listeners[name] ||= []).push(cb);
      },
    };
    return true;
  };
}

suite("SttEngine transcription lifecycle (FX221)", () => {
  suiteSetup(() => {
    (globalThis as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
    (globalThis as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = FakeRecognition;
  });

  suiteTeardown(() => {
    // FX221 + FX228 isolation: clean the FakeRecognition stub so adjacent
    // suites (WakeWordListener FX228) see the bare Node env they assume.
    delete (globalThis as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (globalThis as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  setup(() => {
    recognitionInstances.length = 0;
  });

  test("startListening wires onTranscript to live recognition events with canned text", async () => {
    const engine: any = new SttEngine(makeStore());
    engine._pipeline = makePipelineStub("hello world");
    installRecorderShim(engine);
    engine.language = "en-US";

    const received: { text: string; isFinal: boolean }[] = [];
    engine.onTranscript = (text: string, isFinal: boolean) => {
      received.push({ text, isFinal });
    };

    await engine.startListening();
    assert.strictEqual(engine.state, "listening", "state must transition to listening");
    assert.strictEqual(recognitionInstances.length, 1, "exactly one recognition instance created");

    const recog = recognitionInstances[0];
    assert.strictEqual(recog.started, true, "recognition.start() called");

    // Fire a deterministic interim result and assert exact propagation.
    recog.fire("result", makeResultsEvent(["hello world"]));

    assert.strictEqual(received.length, 1, "onTranscript fired exactly once for one result event");
    assert.strictEqual(received[0].text, "hello world", "text delivered exactly as canned");
    assert.strictEqual(received[0].isFinal, false, "live transcripts are interim (isFinal=false)");
  });

  test("language assignment propagates to recognition.lang when startListening runs", async () => {
    const engine: any = new SttEngine(makeStore());
    engine._pipeline = makePipelineStub("bonjour");
    installRecorderShim(engine);

    // Engine has no public setLanguage(); language is read from store at
    // _loadSettings() or assigned before _startWhisper(). Assign directly to
    // exercise the propagation path through LiveTranscriber -> recognition.lang.
    engine.language = "fr-FR";
    engine.onTranscript = () => { /* noop */ };

    await engine.startListening();

    assert.strictEqual(recognitionInstances.length, 1);
    assert.strictEqual(
      recognitionInstances[0].lang,
      "fr-FR",
      "recognition.lang must reflect engine.language at start"
    );
    assert.strictEqual(recognitionInstances[0].continuous, true, "continuous flag must be set");
    assert.strictEqual(recognitionInstances[0].interimResults, true, "interimResults flag must be set");
  });

  test("multiple result chunks accumulate into single concatenated transcript", async () => {
    const engine: any = new SttEngine(makeStore());
    engine._pipeline = makePipelineStub("ignored-final");
    installRecorderShim(engine);
    engine.language = "en-US";

    const received: string[] = [];
    engine.onTranscript = (text: string) => { received.push(text); };

    await engine.startListening();
    const recog = recognitionInstances[0];

    // LiveTranscriber concatenates ALL e.results[i][0].transcript on each
    // event. Verify deterministic concatenation across multiple chunks.
    recog.fire("result", makeResultsEvent(["hello ", "world"]));
    recog.fire("result", makeResultsEvent(["hello ", "world", " again"]));

    assert.deepStrictEqual(
      received,
      ["hello world", "hello world again"],
      "each result event yields the concatenation of all chunks present"
    );
  });

  test("empty result chunk does NOT invoke onTranscript", async () => {
    const engine: any = new SttEngine(makeStore());
    engine._pipeline = makePipelineStub("x");
    installRecorderShim(engine);
    engine.language = "en-US";

    let calls = 0;
    engine.onTranscript = () => { calls++; };

    await engine.startListening();
    const recog = recognitionInstances[0];

    // Empty current string -> LiveTranscriber's `if (current)` guard short-circuits.
    recog.fire("result", makeResultsEvent([""]));
    assert.strictEqual(calls, 0, "empty transcript must not invoke onTranscript");

    // Non-empty chunk after empty still works.
    recog.fire("result", makeResultsEvent(["resumed"]));
    assert.strictEqual(calls, 1, "non-empty transcript after empty must invoke onTranscript once");
  });

  test("startListening short-circuits to idle when pipeline is not ready", async () => {
    const engine: any = new SttEngine(makeStore());
    engine._pipeline = {
      ...makePipelineStub("x"),
      isReady: () => false,
    };
    installRecorderShim(engine);
    engine.language = "en-US";

    const progress: { status: string; msg?: string }[] = [];
    engine.onModelProgress = (status: string, msg?: string) => {
      progress.push({ status, msg });
    };
    engine.onTranscript = () => { /* noop */ };

    await engine.startListening();

    assert.strictEqual(engine.state, "idle", "state must fall back to idle when pipeline not ready");
    assert.strictEqual(recognitionInstances.length, 0, "no recognition created when pipeline not ready");
    assert.ok(
      progress.some((p) => p.status === "error"),
      "operator must be notified via onModelProgress(error, ...)"
    );
  });
});

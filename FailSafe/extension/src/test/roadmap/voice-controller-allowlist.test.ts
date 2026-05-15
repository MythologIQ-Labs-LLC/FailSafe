import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { VoiceController } from "../../../src/roadmap/ui/modules/voice-controller.js";
// @ts-expect-error JS module import in TS test context
import { ALLOWED_WHISPER_MODELS } from "../../../src/roadmap/ui/modules/voice-catalog.js";

function makeStt(): any {
  return {
    onTranscript: null, onStateChange: null, onAutoStop: null,
    onWakeWordTriggered: null, onModelProgress: null,
    onAnalyserCreated: null, onAudioCaptured: null,
    state: 'idle', modelReady: true, loadingStatus: 'ready', modelId: 'Xenova/whisper-tiny',
    setSilenceTimeout() {}, startWakeWordListener() {}, destroy() {},
    teardownPipelineCalled: 0, initCalled: 0, setModelIdArg: null,
    teardownPipeline() { this.teardownPipelineCalled++; },
    setModelId(id: string) { this.modelId = id; this.setModelIdArg = id; },
    init() { this.initCalled++; return Promise.resolve(); },
  };
}
function makeTts(): any { return { onStateChange: null, destroy() {} }; }
function makeStore(): any {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v), _map: m };
}

suite("VoiceController.swapWhisperModel allowlist (D-5)", () => {
  test("ALLOWED_WHISPER_MODELS catalog exists and contains the 3 supported ids", () => {
    assert.ok(ALLOWED_WHISPER_MODELS instanceof Set);
    assert.ok(ALLOWED_WHISPER_MODELS.has('Xenova/whisper-tiny'));
    assert.ok(ALLOWED_WHISPER_MODELS.has('Xenova/whisper-base'));
    assert.ok(ALLOWED_WHISPER_MODELS.has('Xenova/whisper-small'));
  });

  test("swapWhisperModel rejects ids not on the allowlist", async () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    await ctrl.swapWhisperModel('attacker/malicious-model');
    assert.strictEqual(stt.teardownPipelineCalled, 0, 'must NOT teardown pipeline for disallowed id');
    assert.strictEqual(stt.initCalled, 0, 'must NOT call init for disallowed id');
  });

  test("swapWhisperModel accepts allowlisted ids", async () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    await ctrl.swapWhisperModel('Xenova/whisper-base');
    assert.strictEqual(stt.teardownPipelineCalled, 1);
    assert.strictEqual(stt.initCalled, 1);
  });
});

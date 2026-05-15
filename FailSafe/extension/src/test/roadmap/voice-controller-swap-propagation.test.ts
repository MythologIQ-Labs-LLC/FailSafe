import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { VoiceController } from "../../../src/roadmap/ui/modules/voice-controller.js";

function makeStt(): any {
  return {
    onTranscript: null, onStateChange: null, onAutoStop: null,
    onWakeWordTriggered: null, onModelProgress: null,
    onAnalyserCreated: null, onAudioCaptured: null,
    state: 'idle', modelReady: true, loadingStatus: 'ready', modelId: 'Xenova/whisper-tiny',
    setSilenceTimeout() {}, startWakeWordListener() {}, destroy() {},
    teardownPipeline() {},
    setModelId(id: string) { this.modelId = id; },
    init() { return Promise.resolve(); },
  };
}
function makeTts(): any { return { onStateChange: null, destroy() {} }; }
function makeStore(): any {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

suite("VoiceController.swapWhisperModel id propagation + reentry (D-6)", () => {
  test("post-swap stt.modelId reflects the new id (not the constructor-time id)", async () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    assert.strictEqual(stt.modelId, 'Xenova/whisper-tiny', 'precondition');
    await ctrl.swapWhisperModel('Xenova/whisper-base');
    assert.strictEqual(stt.modelId, 'Xenova/whisper-base',
      'swapWhisperModel must propagate id into stt.modelId, not just the store');
  });

  test("concurrent swapWhisperModel calls: second call is rejected by reentry guard", async () => {
    const stt = makeStt();
    let initCount = 0;
    let resolveFirst: () => void = () => {};
    stt.init = () => {
      initCount++;
      return new Promise<void>(r => { resolveFirst = r; });
    };
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    const p1 = ctrl.swapWhisperModel('Xenova/whisper-base');
    const p2 = ctrl.swapWhisperModel('Xenova/whisper-small'); // should be no-op while p1 in flight
    resolveFirst();
    await Promise.all([p1, p2]);
    assert.strictEqual(initCount, 1, 'reentry guard must collapse concurrent calls into one init');
  });
});

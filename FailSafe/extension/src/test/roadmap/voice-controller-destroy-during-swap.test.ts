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
    init() { return new Promise<void>(() => { /* never resolves */ }); },
  };
}
function makeTts(): any { return { onStateChange: null, destroy() {} }; }
function makeStore(): any {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

suite("VoiceController destroy clears _swapping (R-5)", () => {
  test("destroy() clears in-flight _swapping flag", () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    ctrl.swapWhisperModel('Xenova/whisper-base'); // never resolves
    assert.strictEqual(ctrl._swapping, true, 'swap is in flight');
    ctrl.destroy();
    assert.strictEqual(ctrl._swapping, false,
      'destroy must clear _swapping so a re-attached controller is not stuck');
  });
});

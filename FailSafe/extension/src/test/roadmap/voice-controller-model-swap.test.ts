import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { VoiceController } from "../../../src/roadmap/ui/modules/voice-controller.js";

function makeStt(): any {
  return {
    onTranscript: null, onStateChange: null, onAutoStop: null,
    onWakeWordTriggered: null, onModelProgress: null,
    onAnalyserCreated: null, onAudioCaptured: null,
    state: 'idle', modelReady: true, loadingStatus: 'ready',
    setSilenceTimeout() {}, startWakeWordListener() {}, destroy() {},
    teardownPipelineCalled: 0, initCalled: 0,
    teardownPipeline() { this.teardownPipelineCalled++; },
    init() { this.initCalled++; return Promise.resolve(); },
  };
}
function makeTts(): any { return { onStateChange: null, destroy() {} }; }
function makeStore() {
  const m = new Map<string, unknown>();
  return {
    get: (k: string) => m.get(k),
    set: (k: string, v: unknown) => { m.set(k, v); },
    _map: m,
  };
}

suite("VoiceController.swapWhisperModel", () => {
  test("swap persists new model id to store", async () => {
    const stt = makeStt();
    const store = makeStore();
    const ctrl = new VoiceController(stt, makeTts(), store);
    await ctrl.swapWhisperModel('Xenova/whisper-base');
    assert.strictEqual(store._map.get('whisper-model'), 'Xenova/whisper-base');
  });

  test("swap calls stt.teardownPipeline and stt.init", async () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    await ctrl.swapWhisperModel('Xenova/whisper-small');
    assert.strictEqual(stt.teardownPipelineCalled, 1);
    assert.strictEqual(stt.initCalled, 1);
  });

  test("swap emits idle state to subscribers", async () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    const seen: string[] = [];
    ctrl.addStateListener((s: string) => seen.push(s));
    stt.onStateChange('listening');
    await ctrl.swapWhisperModel('Xenova/whisper-base');
    assert.ok(seen.includes('idle'));
  });

  test("swap is no-op when newModelId is empty", async () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    await ctrl.swapWhisperModel('');
    assert.strictEqual(stt.teardownPipelineCalled, 0);
  });
});

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
  };
}
function makeTts(): any { return { onStateChange: null, destroy() {} }; }
function makeStore(): any {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

suite("VoiceController TTS error routing (D-9)", () => {
  test("error:* states from tts surface through _emitState", () => {
    const stt = makeStt();
    const tts = makeTts();
    const ctrl = new VoiceController(stt, tts, makeStore());
    const seen: string[] = [];
    ctrl.addStateListener((s: string) => seen.push(s));
    tts.onStateChange('error:piper_not_vendored');
    assert.ok(seen.includes('error:piper_not_vendored'),
      'TTS error states must reach state listeners; previously dropped at controller');
  });

  test("speaking → idle still routes through normal state transitions", () => {
    const stt = makeStt();
    const tts = makeTts();
    const ctrl = new VoiceController(stt, tts, makeStore());
    const seen: string[] = [];
    ctrl.addStateListener((s: string) => seen.push(s));
    tts.onStateChange('speaking');
    tts.onStateChange('idle');
    // Listener gets cached 'idle' on subscribe, then 'speaking', then 'idle' again.
    assert.ok(seen.includes('speaking'));
    assert.ok(seen.lastIndexOf('idle') > seen.indexOf('speaking'),
      'final idle must come after speaking');
  });
});

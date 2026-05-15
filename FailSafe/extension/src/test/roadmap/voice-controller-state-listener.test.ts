import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { VoiceController } from "../../../src/roadmap/ui/modules/voice-controller.js";

function makeStt(): any {
  return {
    onTranscript: null, onStateChange: null, onAutoStop: null,
    onWakeWordTriggered: null, onModelProgress: null,
    onAnalyserCreated: null, onAudioCaptured: null,
    state: 'idle', modelReady: false, loadingStatus: 'idle',
    setSilenceTimeout() {},
    startWakeWordListener() {},
    destroy() {},
  };
}

function makeTts(): any {
  return { onStateChange: null, voiceId: 'en_US-hfc_female-medium', destroy() {} };
}

function makeStore() {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

suite("VoiceController state listener fan-out", () => {
  test("addStateListener replays cached state immediately", () => {
    const ctrl = new VoiceController(makeStt(), makeTts(), makeStore());
    const seen: string[] = [];
    ctrl.addStateListener((s: string) => seen.push(s));
    assert.deepStrictEqual(seen, ['idle']);
  });

  test("multiple subscribers all receive emits", () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    const a: string[] = []; const b: string[] = [];
    ctrl.addStateListener((s: string) => a.push(s));
    ctrl.addStateListener((s: string) => b.push(s));
    stt.onStateChange('listening');
    stt.onStateChange('processing');
    assert.deepStrictEqual(a, ['idle', 'listening', 'processing']);
    assert.deepStrictEqual(b, ['idle', 'listening', 'processing']);
  });

  test("unsubscribe stops further notifications", () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    const seen: string[] = [];
    const off = ctrl.addStateListener((s: string) => seen.push(s));
    off();
    stt.onStateChange('listening');
    assert.deepStrictEqual(seen, ['idle']);
  });

  test("duplicate state emits collapse (no replay of same value)", () => {
    const stt = makeStt();
    const ctrl = new VoiceController(stt, makeTts(), makeStore());
    const seen: string[] = [];
    ctrl.addStateListener((s: string) => seen.push(s));
    stt.onStateChange('listening');
    stt.onStateChange('listening');
    assert.deepStrictEqual(seen, ['idle', 'listening']);
  });

  test("tts speaking emits speaking through unified state", () => {
    const stt = makeStt();
    const tts = makeTts();
    const ctrl = new VoiceController(stt, tts, makeStore());
    const seen: string[] = [];
    ctrl.addStateListener((s: string) => seen.push(s));
    tts.onStateChange('speaking');
    assert.ok(seen.includes('speaking'));
  });
});

// #237 FX898 — Voice capability presenter (pure signal→presentation mappers).
// Written FIRST (plan-voice-capability-237.md Phase 1). The LD4 matrix asserts
// the FULL presentation tuple per class: denied ≠ mic-absent ≠ tts-error — the
// single NO-MIC conflation (voice-controller.js:114-117 pre-change) dies here.

import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { presentModelProgress, presentVoicePackState, deriveCapabilitySummary, buildVoiceDiagnostics, WHISPER_MODEL_SIZES } from "../../../src/roadmap/ui/modules/voice-capability-presenter.js";
// @ts-expect-error JS module import in TS test context
import { VoiceController } from "../../../src/roadmap/ui/modules/voice-controller.js";

const RED = 'var(--accent-red)';

suite("voice-capability-presenter — presentModelProgress LD4 matrix", () => {
  test("downloading includes the approximate model size for each allowed whisper id", () => {
    const ids = Object.keys(WHISPER_MODEL_SIZES);
    assert.strictEqual(ids.length, 3, 'sizes keyed by the 3 ALLOWED whisper ids');
    for (const id of ids) {
      const p = presentModelProgress('downloading', 42, id);
      assert.strictEqual(p.micHtml, '🎙️ PREPARING');
      assert.strictEqual(p.disabled, true);
      assert.ok(p.title.startsWith('Preparing security model'), `parity title prefix for ${id}`);
      assert.ok(p.title.includes(WHISPER_MODEL_SIZES[id]), `storage impact (${WHISPER_MODEL_SIZES[id]}) in title`);
      assert.strictEqual(p.statusMsg, null);
    }
  });

  test("downloading without a known model id keeps today's exact title", () => {
    const p = presentModelProgress('downloading', 42, undefined);
    assert.strictEqual(p.title, 'Preparing security model...');
  });

  test("loading -> today's exact tuple", () => {
    assert.deepStrictEqual(presentModelProgress('loading', undefined, 'Xenova/whisper-tiny'),
      { micHtml: '⏳ LOADING', disabled: true, title: 'Loading Whisper model...', statusMsg: null, statusColor: null });
  });

  test("ready -> today's exact tuple", () => {
    assert.deepStrictEqual(presentModelProgress('ready', undefined, 'Xenova/whisper-tiny'),
      { micHtml: '🎙️ LISTEN', disabled: false, title: 'Click to speak', statusMsg: null, statusColor: null });
  });

  test("error:mic_unavailable -> NO MIC (today's exact tuple — parity)", () => {
    assert.deepStrictEqual(presentModelProgress('error:mic_unavailable', undefined, 'Xenova/whisper-tiny'), {
      micHtml: '❌ NO MIC', disabled: true,
      title: 'Whisper unavailable — check permissions',
      statusMsg: 'Whisper unavailable — check permissions', statusColor: RED,
    });
  });

  test("msg containing 'denied' -> MIC BLOCKED permission class (NOT NO MIC)", () => {
    const p = presentModelProgress('error', 'Microphone access denied', 'Xenova/whisper-tiny');
    assert.strictEqual(p.micHtml, '🚫 MIC BLOCKED');
    assert.strictEqual(p.disabled, true);
    assert.match(p.title, /denied/);
    assert.match(p.title, /permission/i);
    assert.match(String(p.statusMsg), /denied/);
    assert.strictEqual(p.statusColor, RED);
  });

  test("msg 'No microphone detected' -> NO MIC with the mic-absent message as title", () => {
    const p = presentModelProgress('error', 'No microphone detected', 'Xenova/whisper-tiny');
    assert.strictEqual(p.micHtml, '❌ NO MIC');
    assert.strictEqual(p.title, 'No microphone detected');
    assert.strictEqual(p.statusMsg, 'No microphone detected');
    assert.strictEqual(p.statusColor, RED);
  });

  test("error:piper_not_vendored -> VOICE ERROR with the typed detail", () => {
    const p = presentModelProgress('error:piper_not_vendored', undefined, 'Xenova/whisper-tiny');
    assert.strictEqual(p.micHtml, '⚠️ VOICE ERROR');
    assert.match(p.title, /piper_not_vendored/);
    assert.strictEqual(p.statusColor, RED);
  });

  test("conflation is dead: denied / mic-absent / generic error present pairwise differently", () => {
    const denied = presentModelProgress('error', 'Microphone access denied', 'x');
    const noMic = presentModelProgress('error', 'No microphone detected', 'x');
    const generic = presentModelProgress('error:timeout_after_retry', undefined, 'x');
    assert.notStrictEqual(denied.micHtml, noMic.micHtml);
    assert.notStrictEqual(denied.micHtml, generic.micHtml);
    assert.notStrictEqual(noMic.micHtml, generic.micHtml);
  });

  test("un-presented statuses return null (parity: those were no-ops today)", () => {
    assert.strictEqual(presentModelProgress('initiate', 0, 'Xenova/whisper-tiny'), null);
  });
});

suite("voice-capability-presenter — deriveCapabilitySummary", () => {
  const base = { sttLoadingStatus: 'ready', sttState: 'idle', ttsState: 'ready', packState: 'installed' };
  test("stt ready + tts ready -> full", () => {
    assert.strictEqual(deriveCapabilitySummary(base), 'full');
  });
  test("stt ready + tts error -> stt-only (missing TTS never disables STT)", () => {
    assert.strictEqual(deriveCapabilitySummary({ ...base, ttsState: 'error' }), 'stt-only');
  });
  test("stt not ready + tts ready -> tts-only (missing STT never disables TTS)", () => {
    assert.strictEqual(deriveCapabilitySummary({ ...base, sttLoadingStatus: 'idle' }), 'tts-only');
  });
  test("stt error-class state -> tts-only even when loadingStatus is ready", () => {
    assert.strictEqual(deriveCapabilitySummary({ ...base, sttState: 'error:mic_unavailable' }), 'tts-only');
  });
  test("both unavailable -> explicit text-only", () => {
    assert.strictEqual(deriveCapabilitySummary({ sttLoadingStatus: 'idle', sttState: 'idle', ttsState: 'unknown', packState: 'absent' }), 'text-only');
  });
  test("PINNED: ttsState 'unknown' counts as not-ready -> stt-only when STT is up", () => {
    assert.strictEqual(deriveCapabilitySummary({ ...base, ttsState: 'unknown' }), 'stt-only');
  });
  test("non-installed pack gates TTS but NEVER STT -> stt-only", () => {
    assert.strictEqual(deriveCapabilitySummary({ ...base, packState: 'absent' }), 'stt-only');
  });
});

suite("voice-capability-presenter — presentVoicePackState", () => {
  test("'absent' -> install pointer (Settings), non-error color", () => {
    const p = presentVoicePackState('absent');
    assert.match(p.text, /install/i);
    assert.match(p.text, /settings/i);
    assert.ok(!/accent-red/.test(p.color), 'absent is a pointer, not an error');
  });
  test("'stale' -> update pointer", () => {
    const p = presentVoicePackState('stale');
    assert.match(p.text, /update/i);
    assert.ok(!/accent-red/.test(p.color));
  });
  test("'corrupt' -> reinstall pointer", () => {
    assert.match(presentVoicePackState('corrupt').text, /reinstall/i);
  });
  test("'installed' -> null (no badge override; setCapabilityNote(null) no-ops)", () => {
    assert.strictEqual(presentVoicePackState('installed'), null);
  });
});

suite("voice-capability-presenter — buildVoiceDiagnostics", () => {
  const ALLOW_LIST = ['language', 'lastFailure', 'micDeviceLabel', 'packState', 'packVersion', 'sttLoadingStatus', 'ttsVoice', 'whisperModelId'];
  test("returns EXACTLY the allow-listed keys — never transcript/audio/token fields", () => {
    const diag = buildVoiceDiagnostics({
      micDeviceLabel: 'USB Mic', whisperModelId: 'Xenova/whisper-tiny', sttLoadingStatus: 'ready',
      language: 'en-US', ttsVoice: 'en_US-hfc_female-medium', packState: 'installed', packVersion: '5.2.0',
      lastFailure: null, transcript: 'SECRET WORDS', audio: new Uint8Array(4), token: 'ghp_x', url: 'https://x',
    });
    assert.deepStrictEqual(Object.keys(diag).sort(), ALLOW_LIST);
    assert.strictEqual(JSON.stringify(diag).includes('SECRET WORDS'), false);
    assert.strictEqual(JSON.stringify(diag).includes('ghp_x'), false);
  });
  test("missing deps degrade to nulls, keys still exact", () => {
    assert.deepStrictEqual(Object.keys(buildVoiceDiagnostics({})).sort(), ALLOW_LIST);
    assert.strictEqual(buildVoiceDiagnostics({}).micDeviceLabel, null);
  });
});

suite("voice-controller — wireModelProgress delegates to the presenter", () => {
  function makeController() {
    const stt: any = { modelId: 'Xenova/whisper-tiny', onAutoStop: null };
    const ctrl: any = new VoiceController(stt, {} as any, null);
    const mic: any[] = []; const statuses: any[] = [];
    ctrl.onMicButton = (...a: unknown[]) => mic.push(a);
    ctrl.onStatus = (...a: unknown[]) => statuses.push(a);
    ctrl.wireModelProgress();
    return { stt, mic, statuses };
  }

  test("RED-TODAY regression: ('error','Microphone access denied') -> MIC BLOCKED, not NO MIC", () => {
    const { stt, mic, statuses } = makeController();
    stt.onModelProgress('error', 'Microphone access denied');
    const [html, active, disabled, title] = mic[0];
    assert.strictEqual(html, '🚫 MIC BLOCKED'); // live :114-117 rendered ❌ NO MIC for this input
    assert.strictEqual(active, false);
    assert.strictEqual(disabled, true);
    assert.match(String(title), /denied/);
    assert.match(String(statuses[0][0]), /denied/);
    assert.strictEqual(statuses[0][1], RED);
  });

  test("parity: downloading / ready / error:mic_unavailable drive today's mic tuples", () => {
    const { stt, mic, statuses } = makeController();
    stt.onModelProgress('downloading', 10);
    assert.strictEqual(mic[0][0], '🎙️ PREPARING');
    assert.deepStrictEqual([mic[0][1], mic[0][2]], [false, true]);
    assert.ok(String(mic[0][3]).startsWith('Preparing security model'));
    stt.onModelProgress('ready');
    assert.deepStrictEqual(mic[1], ['🎙️ LISTEN', true, false, 'Click to speak']);
    stt.onModelProgress('error:mic_unavailable');
    assert.deepStrictEqual(mic[2], ['❌ NO MIC', false, true, 'Whisper unavailable — check permissions']);
    assert.deepStrictEqual(statuses[0], ['Whisper unavailable — check permissions', RED]);
  });
});

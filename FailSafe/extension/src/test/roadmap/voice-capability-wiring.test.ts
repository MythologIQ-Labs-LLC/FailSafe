// #237 FX898/FX197/FX198 — wiring: probeVoicePack consumption (LD2), badge
// setCapabilityNote (LD5), capability summary production call-site (LD4),
// tts_init_rejected routing (LD3). Written FIRST per plan-voice-capability-237.md.
// Sibling suite voice-capability-settings-seam.test.ts owns the settings.js
// onEvent forward + card Copy-diagnostics tests (split to keep files ≤250).

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import in TS test context
import { wireVoiceCallbacks } from "../../../src/roadmap/ui/modules/brainstorm-voice-wiring.js";
// @ts-expect-error JS module import in TS test context
import { VoiceStatusBadge } from "../../../src/roadmap/ui/modules/voice-status-badge.js";
// @ts-expect-error JS module import in TS test context
import { presentVoicePackState } from "../../../src/roadmap/ui/modules/voice-capability-presenter.js";
// @ts-expect-error JS module import in TS test context
import { VoiceController } from "../../../src/roadmap/ui/modules/voice-controller.js";

const MODULES_DIR = path.join(__dirname, "../../../src/roadmap/ui/modules");
const tick = () => new Promise((r) => setTimeout(r, 0));

interface WiredHarness {
  renderer: any;
  badgeEl: HTMLElement;
  statusCalls: Array<[string, string]>;
  probeCalls: () => number;
  emit: (s: string) => void;
}

function makeWiredRenderer(probeState: string, opts: { sttLoading?: string; sttState?: string; ttsReady?: boolean } = {}): WiredHarness {
  const dom = new JSDOM('<!DOCTYPE html><div id="host"><div class="cc-bs-voice-status"></div></div>');
  const badgeEl = dom.window.document.querySelector('.cc-bs-voice-status') as HTMLElement;
  const statusCalls: Array<[string, string]> = [];
  const listeners: Array<(s: string) => void> = [];
  let probeCount = 0;
  const renderer: any = {
    _getEl: (sel: string) => (sel === '.cc-bs-voice-status' ? badgeEl : null),
    showStatus: (t: string, c: string) => statusCalls.push([t, c]),
    prepBay: { onTranscript: () => {}, onTranscriptError: () => {} },
    keyboard: {},
    voice: {
      wireModelProgress: () => {},
      probeVoicePack: () => { probeCount += 1; return Promise.resolve(probeState); },
      addStateListener: (fn: (s: string) => void) => { listeners.push(fn); fn('idle'); return () => {}; },
      startPtt: () => {}, stopPtt: () => {},
      stt: { state: opts.sttState ?? 'idle', loadingStatus: opts.sttLoading ?? 'idle' },
      tts: { tts: opts.ttsReady ? {} : null },
    },
  };
  return { renderer, badgeEl, statusCalls, probeCalls: () => probeCount, emit: (s) => listeners.forEach((f) => f(s)) };
}

suite("voice capability wiring — probeVoicePack consumption (LD2)", () => {
  test("wireVoiceCallbacks invokes probeVoicePack exactly once AND routes a resolved 'stale' through the presenter into the badge", async () => {
    const h = makeWiredRenderer('stale');
    wireVoiceCallbacks(h.renderer);
    await tick();
    assert.strictEqual(h.probeCalls(), 1, 'probe called exactly once (RED today: zero UI callers)');
    assert.match(h.badgeEl.textContent || '', /update/i, 'stale renders the update-pointer presentation');
    assert.match(h.badgeEl.textContent || '', /settings/i, 'pointer targets the existing Settings card flow');
  });

  test("probe 'absent' + engines unavailable -> summary text-only routed to showStatus (muted)", async () => {
    const h = makeWiredRenderer('absent');
    wireVoiceCallbacks(h.renderer);
    await tick();
    const hit = h.statusCalls.find(([t]) => t === 'voice off — text brainstorming available');
    assert.ok(hit, `text-only status shown; got: ${JSON.stringify(h.statusCalls)}`);
    assert.match(hit![1], /text-muted/, 'muted color');
  });

  test("'installed' pack -> setCapabilityNote(null) is a NO-OP; non-full summary lands in the badge title", async () => {
    const h = makeWiredRenderer('installed', { sttLoading: 'ready' });
    wireVoiceCallbacks(h.renderer);
    await tick();
    assert.strictEqual(h.badgeEl.textContent, 'Idle', 'state presentation untouched by the null note (A7)');
    assert.strictEqual(h.badgeEl.title, 'voice: stt-only', 'non-full summary routed to the badge title');
  });

  test("summary recomputes on controller state changes (addStateListener surface)", async () => {
    const h = makeWiredRenderer('installed', { sttLoading: 'ready' });
    wireVoiceCallbacks(h.renderer);
    await tick();
    h.renderer.voice.tts.tts = {}; // TTS init completes (tts-engine.js:47 assigns .tts)
    h.emit('idle');
    assert.notStrictEqual(h.badgeEl.title, 'voice: stt-only', 'full summary no longer overrides the title');
  });
});

suite("voice capability wiring — badge setCapabilityNote (LD5)", () => {
  function makeBadge() {
    const dom = new JSDOM('<!DOCTYPE html><span class="b"></span>');
    const el = dom.window.document.querySelector('.b') as HTMLElement;
    const badge: any = new VoiceStatusBadge(el, { addStateListener: () => () => {} });
    return { el, badge };
  }

  test("renders the presenter's pack-state presentations with non-error colors; null is a strict no-op", () => {
    const { el, badge } = makeBadge();
    badge.setCapabilityNote(presentVoicePackState('absent'));
    assert.match(el.textContent || '', /install/i, 'absent install-pointer');
    assert.ok(!/accent-red/.test(el.style.color), 'absent uses a non-error color');
    badge.setCapabilityNote(presentVoicePackState('stale'));
    assert.match(el.textContent || '', /update/i, 'stale update-pointer');
    const before = el.textContent;
    badge.setCapabilityNote(null); // presenter returns null for 'installed' — MUST be a no-op (A7)
    assert.strictEqual(el.textContent, before, 'setCapabilityNote(null) changed nothing');
  });

  test("the literal token 'voicePackAbsent' is NEVER the badge textContent; the controller no longer emits it", async () => {
    for (const state of ['absent', 'stale', 'corrupt', 'installed']) {
      const h = makeWiredRenderer(state);
      wireVoiceCallbacks(h.renderer);
      await tick();
      assert.ok(!(h.badgeEl.textContent || '').includes('voicePackAbsent'), `raw token leaked for '${state}'`);
    }
    const src = fs.readFileSync(path.join(MODULES_DIR, 'voice-controller.js'), 'utf8');
    assert.ok(!src.includes('voicePackAbsent'), "emission deleted (RED today: _emitState('voicePackAbsent') at voice-controller.js:49)");
  });
});

suite("voice capability wiring — tts init rejection (LD3, FX198)", () => {
  // Harness disclosure: there is no existing BrainstormRenderer mocha harness,
  // and its ctor transitively imports canvas/web-llm modules unsuited to this
  // jsdom suite — so LD3 is verified as a source contract on the exact
  // brainstorm.js:50 line PLUS a behavioral proof that the emitted state
  // reaches state-channel subscribers through the real VoiceController.
  test("brainstorm.js routes tts.init() rejection to _emitState('error:tts_init_rejected') instead of swallowing it", () => {
    const src = fs.readFileSync(path.join(MODULES_DIR, 'brainstorm.js'), 'utf8');
    assert.ok(
      src.includes(".catch(() => this.voice._emitState?.('error:tts_init_rejected'))"),
      "LD3 catch body present (RED today: bare `.catch(() => {})` swallow at brainstorm.js:50)"
    );
    assert.ok(!src.includes('this.voice.tts.init().catch(() => {})'), 'bare swallow removed');
  });

  test("error:tts_init_rejected reaches state-channel subscribers (badge class renders it as an error)", () => {
    const ctrl: any = new VoiceController({ onAutoStop: null } as any, {} as any, null);
    const seen: string[] = [];
    ctrl.addStateListener((s: string) => seen.push(s));
    ctrl._emitState('error:tts_init_rejected');
    assert.ok(seen.includes('error:tts_init_rejected'));
    const dom = new JSDOM('<!DOCTYPE html><span class="b"></span>');
    const el = dom.window.document.querySelector('.b') as HTMLElement;
    const badge: any = new VoiceStatusBadge(el, ctrl);
    badge.attach();
    assert.match(el.textContent || '', /tts_init_rejected/, 'typed detail rendered by the badge error path');
  });
});

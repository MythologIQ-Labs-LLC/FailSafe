// #237 FX898 (LD6 + V2-F2 delivery seam) — SettingsRenderer.onEvent forwards
// voicePack.install.progress/.error (A8 NARROW: never .complete) to the card,
// which renders non-error progress as an installing line; plus Copy diagnostics
// (allow-listed JSON, clipboard with degrade-safe visible fallback).
// Sibling of voice-capability-wiring.test.ts (split to keep both files ≤250).

import * as assert from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error untyped JS module — resolved from the compiled out/ tree so
// settings.js's transitive `education-lesson.js → education/lessons.js` import
// chain resolves at runtime (no .js sibling exists under src/); same pattern
// as settings-renderer.test.ts:5-8.
import { SettingsRenderer } from "../../roadmap/ui/modules/settings.js";
// @ts-expect-error untyped JS module (out/ tree, same instance family as settings.js)
import { renderVoicePackSettingsCard } from "../../roadmap/ui/modules/voice-pack-settings-card.js";

const tick = () => new Promise((r) => setTimeout(r, 5));

function stubFetch(handlers: Record<string, () => unknown>) {
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    void init;
    const handler = handlers[url];
    if (!handler) return { ok: false, status: 404, json: async () => ({ ok: false }) };
    return { ok: true, status: 200, json: async () => handler() };
  };
}

function cleanup() {
  delete (globalThis as any).fetch;
  delete (globalThis as any).navigator;
  (globalThis as any).document = undefined;
  (globalThis as any).window = undefined;
}

async function mountSeam(status: Record<string, unknown>, cardOpts: Record<string, unknown> = {}) {
  const dom = new JSDOM('<!DOCTYPE html><div id="settings-host"></div>');
  (globalThis as any).document = dom.window.document;
  (globalThis as any).window = dom.window;
  stubFetch({ '/api/integrations/voice-pack/status': () => status });
  const settings: any = new SettingsRenderer('settings-host', {});
  settings.container.innerHTML = '<div class="cc-card" id="cc-voice-pack-settings-slot"></div>';
  const slot = settings.container.querySelector('#cc-voice-pack-settings-slot') as HTMLElement;
  const bindOnce = (node: Element | null, evt: string, handler: (e: Event) => void) => {
    if (node) node.addEventListener(evt, handler);
  };
  await renderVoicePackSettingsCard(slot, { bindOnce, ...cardOpts });
  return { settings, slot, dom };
}

suite("settings seam — onEvent forwards voicePack.install events to the card (V2-F2)", () => {
  test("WS-shaped voicePack.install.progress -> card renders an installing line (RED today: nothing forwards the event)", async () => {
    try {
      const { settings, slot } = await mountSeam({ ok: true, state: 'absent' });
      settings.onEvent({
        type: 'voicePack.install.progress',
        invocation: { phase: 'download', status: 'running', bytesTransferred: 1_048_576, totalBytes: 89_478_485 },
      });
      assert.ok(slot.querySelector('[data-role="voice-pack-installing"]'), 'installing line element');
      assert.match(slot.textContent || '', /installing/i);
      assert.match(slot.textContent || '', /download/i, 'phase surfaced');
    } finally { cleanup(); }
  });

  test("WS-shaped voicePack.install.error reaches the card's error body (revived injection path)", async () => {
    try {
      const { settings, slot } = await mountSeam({ ok: true, state: 'absent' });
      settings.onEvent({
        type: 'voicePack.install.error',
        invocation: { phase: 'verify', status: 'error', error: 'sha256 mismatch' },
      });
      assert.match(slot.textContent || '', /sha256 mismatch/, 'error text rendered');
      assert.ok(slot.querySelector('[data-action="retry-voice-pack-install"]'), 'retry affordance');
    } finally { cleanup(); }
  });

  test("route-catch error shape ({ type, error } without invocation) still renders the error body", async () => {
    try { // VoicePackRoute.ts:74 broadcasts { type: 'voicePack.install.error', error }
      const { settings, slot } = await mountSeam({ ok: true, state: 'absent' });
      settings.onEvent({ type: 'voicePack.install.error', error: 'ECONNRESET' });
      assert.match(slot.textContent || '', /ECONNRESET/);
    } finally { cleanup(); }
  });

  test("A8 narrow-forward: .complete is NOT forwarded; .progress and .error are", async () => {
    try {
      const { settings, slot } = await mountSeam({ ok: true, state: 'absent' });
      const calls: unknown[] = [];
      (slot as any)._voicePackRenderer.onInstallProgress = (e: unknown) => calls.push(e);
      settings.onEvent({ type: 'voicePack.install.complete', report: { version: '5.2.0' } });
      assert.strictEqual(calls.length, 0, 'complete never reaches the card');
      settings.onEvent({ type: 'voicePack.install.progress', invocation: { phase: 'download', status: 'running' } });
      settings.onEvent({ type: 'voicePack.install.error', invocation: { phase: 'verify', status: 'error', error: 'x' } });
      assert.strictEqual(calls.length, 2, 'progress + error both forwarded');
    } finally { cleanup(); }
  });
});

suite("settings card — Copy diagnostics (LD6)", () => {
  const DEPS = () => ({
    micDeviceLabel: 'USB Mic', whisperModelId: 'Xenova/whisper-tiny', sttLoadingStatus: 'ready',
    language: 'en-US', ttsVoice: 'en_US-hfc_female-medium',
  });
  const ALLOW_LIST = ['language', 'lastFailure', 'micDeviceLabel', 'packState', 'packVersion', 'sttLoadingStatus', 'ttsVoice', 'whisperModelId'];

  test("writes allow-listed diagnostics JSON to the clipboard and shows a confirmation", async () => {
    try {
      const { slot, dom } = await mountSeam({ ok: true, state: 'installed', version: '5.2.0' }, { diagnosticsDeps: DEPS });
      let written = '';
      (globalThis as any).navigator = { clipboard: { writeText: async (t: string) => { written = t; } } };
      const btn = slot.querySelector('[data-action="copy-voice-diagnostics"]') as HTMLElement;
      assert.ok(btn, 'Copy diagnostics button rendered');
      btn.dispatchEvent(new dom.window.Event('click'));
      await tick();
      const diag = JSON.parse(written);
      assert.deepStrictEqual(Object.keys(diag).sort(), ALLOW_LIST, 'exact allow-list keys');
      assert.strictEqual(diag.packState, 'installed');
      assert.strictEqual(diag.packVersion, '5.2.0');
      assert.strictEqual(diag.whisperModelId, 'Xenova/whisper-tiny');
      const note = slot.querySelector('[data-role="voice-pack-diagnostics-note"]') as HTMLElement;
      assert.match(note.textContent || '', /copied/i, 'confirmation shown');
    } finally { cleanup(); }
  });

  test("clipboard-unavailable degrades to a visible fallback carrying the JSON", async () => {
    try {
      const { slot, dom } = await mountSeam({ ok: true, state: 'absent' }, { diagnosticsDeps: DEPS });
      delete (globalThis as any).navigator; // no clipboard surface at all
      const btn = slot.querySelector('[data-action="copy-voice-diagnostics"]') as HTMLElement;
      btn.dispatchEvent(new dom.window.Event('click'));
      await tick();
      const note = slot.querySelector('[data-role="voice-pack-diagnostics-note"]') as HTMLElement;
      assert.match(note.textContent || '', /clipboard unavailable/i, 'degrade message visible');
      assert.match(note.textContent || '', /whisperModelId/, 'JSON visible for manual copy');
    } finally { cleanup(); }
  });
});

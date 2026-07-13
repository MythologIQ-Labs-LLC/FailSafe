import * as assert from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import in TS test context
import { renderVoicePackSettingsCard } from "../../../src/roadmap/ui/modules/voice-pack-settings-card.js";

function bindOnce(node: Element | null, event: string, handler: EventListener): void {
  node?.addEventListener(event, handler);
}

suite("FX898 voice-pack completion", () => {
  test("completion refetches authoritative installed status", async () => {
    const dom = new JSDOM("<!DOCTYPE html><div id='slot'></div>");
    const slot = dom.window.document.getElementById("slot")!;
    (globalThis as any).document = dom.window.document;
    let statusCalls = 0;
    (globalThis as any).fetch = async (url: string) => {
      if (url.includes("/status")) {
        statusCalls += 1;
        const state = statusCalls === 1 ? "absent" : "installed";
        return { ok: true, status: 200, json: async () => ({ state, version: "5.2.0" }) };
      }
      return { ok: true, status: 202, json: async () => ({ ok: true }) };
    };
    try {
      await renderVoicePackSettingsCard(slot, { bindOnce });
      const renderer = (slot as any)._voicePackRenderer;
      renderer.onInstallProgress({ phase: "download", status: "running" });
      await renderer.onInstallComplete();
      assert.strictEqual(statusCalls, 2, "completion performs a fresh status request");
      assert.match(slot.textContent || "", /Installed/);
    } finally {
      delete (globalThis as any).fetch;
      delete (globalThis as any).document;
    }
  });
});

suite("FX898 voice-pack completion", () => {
  test("non-2xx action response renders retryable terminal error", async () => {
    const dom = new JSDOM("<!DOCTYPE html><div id='slot'></div>");
    const slot = dom.window.document.getElementById("slot")!;
    (globalThis as any).document = dom.window.document;
    (globalThis as any).fetch = async (url: string) => {
      if (url.includes("/status")) {
        return { ok: true, status: 200, json: async () => ({ state: "absent" }) };
      }
      return { ok: false, status: 503, json: async () => ({ error: "offline" }) };
    };
    try {
      await renderVoicePackSettingsCard(slot, { bindOnce });
      await (slot as any)._voicePackRenderer.postAction("install-voice-pack");
      assert.match(slot.textContent || "", /503/);
      assert.ok(slot.querySelector('[data-action="retry-voice-pack-install"]'));
    } finally {
      delete (globalThis as any).fetch;
      delete (globalThis as any).document;
    }
  });
});

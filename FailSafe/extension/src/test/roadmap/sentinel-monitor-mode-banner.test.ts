/**
 * FX507: SentinelMonitor.renderModeBanner — observe-mode advisory banner.
 *
 * Asserts the banner is visible iff `governanceModeState.mode === 'observe'`;
 * hidden in assist/enforce; click handler opens the Settings tab in a new
 * window (matching the established '_blank' pattern in the same module).
 */

import { strict as assert } from "assert";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SentinelMonitor } = require("../../roadmap/ui/modules/sentinel-monitor.js");

function makeSlot() {
  return {
    classList: { _set: new Set<string>(), add(c: string) { this._set.add(c); }, remove(c: string) { this._set.delete(c); }, contains(c: string) { return this._set.has(c); } },
    textContent: "",
    title: "",
    onclick: null as null | (() => void),
  };
}

suite("FX507 SentinelMonitor.renderModeBanner", () => {
  test("mode='observe' (defaulted: false) → banner visible with switch CTA", () => {
    const slot = makeSlot();
    slot.classList.add("hidden"); // initial state
    const monitor = new SentinelMonitor({ modeBanner: slot });
    monitor.renderModeBanner({ mode: "observe", defaulted: false });
    assert.equal(slot.classList.contains("hidden"), false);
    assert.match(String(slot.textContent), /Observe mode/);
    assert.match(String(slot.textContent), /Switch to assist or enforce/);
    assert.ok(typeof slot.onclick === "function");
  });

  test("mode='assist' → banner hidden, no text, no handler", () => {
    const slot = makeSlot();
    const monitor = new SentinelMonitor({ modeBanner: slot });
    monitor.renderModeBanner({ mode: "assist", defaulted: false });
    assert.equal(slot.classList.contains("hidden"), true);
    assert.equal(slot.textContent, "");
    assert.equal(slot.onclick, null);
  });

  test("mode='enforce' → banner hidden", () => {
    const slot = makeSlot();
    const monitor = new SentinelMonitor({ modeBanner: slot });
    monitor.renderModeBanner({ mode: "enforce", defaulted: false });
    assert.equal(slot.classList.contains("hidden"), true);
    assert.equal(slot.textContent, "");
  });

  test("undefined governanceModeState → banner hidden (no throw)", () => {
    const slot = makeSlot();
    const monitor = new SentinelMonitor({ modeBanner: slot });
    monitor.renderModeBanner(undefined);
    assert.equal(slot.classList.contains("hidden"), true);
  });

  test("click handler opens /command-center.html#settings in _blank target", () => {
    const slot = makeSlot();
    const monitor = new SentinelMonitor({ modeBanner: slot });
    monitor.renderModeBanner({ mode: "observe", defaulted: true });
    const calls: Array<{ url: string; target: string }> = [];
    (global as any).window = {
      open: (url: string, target: string) => { calls.push({ url, target }); },
    };
    slot.onclick?.();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/command-center.html#settings");
    assert.equal(calls[0].target, "_blank");
  });
});

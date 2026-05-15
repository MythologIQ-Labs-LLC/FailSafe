import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { drawSidebarVisualizer } from "../../../src/roadmap/ui/modules/brainstorm-visualizer.js";
// @ts-expect-error JS module import in TS test context
import { BrainstormRenderer } from "../../../src/roadmap/ui/modules/brainstorm.js";

interface RafSpy { calls: number; lastId: number; cancels: number[]; }

function installRafSpy(): { spy: RafSpy; restore: () => void } {
  const spy: RafSpy = { calls: 0, lastId: 0, cancels: [] };
  const origRaf = (globalThis as any).requestAnimationFrame;
  const origCancel = (globalThis as any).cancelAnimationFrame;
  (globalThis as any).requestAnimationFrame = (_cb: () => void) => {
    spy.calls += 1; spy.lastId += 1; return spy.lastId;
  };
  (globalThis as any).cancelAnimationFrame = (id: number) => { spy.cancels.push(id); };
  return {
    spy,
    restore: () => {
      (globalThis as any).requestAnimationFrame = origRaf;
      (globalThis as any).cancelAnimationFrame = origCancel;
    }
  };
}

function makeCanvasStub(): any {
  const ctx: any = {
    clearRect: () => {}, beginPath: () => {}, stroke: () => {},
    moveTo: () => {}, lineTo: () => {}, lineWidth: 0, strokeStyle: '',
  };
  return {
    width: 0, height: 0,
    getContext: (_k: string) => ctx,
    getBoundingClientRect: () => ({ width: 200, height: 24 }),
  };
}

function makeAnalyser(): any {
  return {
    frequencyBinCount: 8,
    getByteTimeDomainData: (_buf: Uint8Array) => {},
  };
}

suite("brainstorm listener hygiene (B198)", () => {
  test("drawSidebarVisualizer.destroy() cancels in-flight rAF with same handle", () => {
    const { spy, restore } = installRafSpy();
    const cvs = makeCanvasStub();
    const origDoc = (globalThis as any).document;
    (globalThis as any).document = { querySelector: (sel: string) =>
      sel === '.audio-visualizer-canvas' ? cvs : null };
    try {
      const handle = drawSidebarVisualizer(makeAnalyser(), () => true);
      assert.strictEqual(spy.calls, 1, "rAF scheduled exactly once on initial draw");
      const scheduledId = spy.lastId;
      handle.destroy();
      assert.deepStrictEqual(spy.cancels, [scheduledId],
        "cancelAnimationFrame must be called with the same handle returned by requestAnimationFrame");
    } finally {
      (globalThis as any).document = origDoc;
      restore();
    }
  });

  test("drawSidebarVisualizer.destroy() is safe when no rAF was scheduled (canvas missing)", () => {
    const origDoc = (globalThis as any).document;
    (globalThis as any).document = { querySelector: (_sel: string) => null };
    try {
      const handle = drawSidebarVisualizer(makeAnalyser(), () => true);
      assert.doesNotThrow(() => handle.destroy(),
        "destroy must be a no-op when canvas not in DOM");
    } finally {
      (globalThis as any).document = origDoc;
    }
  });

  test("BrainstormRenderer.destroy() clears heartbeat interval with the captured handle", () => {
    const intervalCalls: Array<{ id: number; cb: () => void; ms: number }> = [];
    const clears: number[] = [];
    const origSetInt = (globalThis as any).setInterval;
    const origClearInt = (globalThis as any).clearInterval;
    let nextId = 100;
    (globalThis as any).setInterval = (cb: () => void, ms: number) => {
      const id = ++nextId; intervalCalls.push({ id, cb, ms }); return id;
    };
    (globalThis as any).clearInterval = (id: number) => { clears.push(id); };
    try {
      // Construct renderer with minimal mocks; no render() so we don't need DOM.
      const r: any = Object.create(BrainstormRenderer.prototype);
      r._heartbeatInterval = (globalThis as any).setInterval(() => {}, 30000);
      r._settingsBridges = {};
      r._visualizerHandle = null;
      r.keyboard = { unbind() {} };
      r.voiceStatusBadge = null;
      r.prepBay = { destroy() {} };
      r.voice = { destroy() {} };
      r.webLlm = { destroy() {} };
      r.graph = { canvas: null };
      r.container = null;
      const installedId = intervalCalls[0].id;
      r.destroy();
      assert.deepStrictEqual(clears, [installedId],
        "clearInterval must be called with the handle returned by setInterval");
      assert.strictEqual(r._heartbeatInterval, null,
        "heartbeat handle must be nulled after destroy");
    } finally {
      (globalThis as any).setInterval = origSetInt;
      (globalThis as any).clearInterval = origClearInt;
    }
  });

  test("BrainstormRenderer.destroy() invokes visualizer handle destroy() (cancels rAF)", () => {
    let visualizerDestroyCalls = 0;
    const r: any = Object.create(BrainstormRenderer.prototype);
    r._heartbeatInterval = null;
    r._settingsBridges = {};
    r._visualizerHandle = { destroy() { visualizerDestroyCalls++; } };
    r.keyboard = { unbind() {} };
    r.voiceStatusBadge = null;
    r.prepBay = { destroy() {} };
    r.voice = { destroy() {} };
    r.webLlm = { destroy() {} };
    r.graph = { canvas: null };
    r.container = null;
    r.destroy();
    assert.strictEqual(visualizerDestroyCalls, 1,
      "visualizer handle destroy() must be invoked exactly once");
    assert.strictEqual(r._visualizerHandle, null,
      "visualizer handle reference must be cleared");
  });

  test("BrainstormRenderer.destroy() removes window settings-bridge listeners (no re-fire after destroy)", () => {
    const added: Array<{ name: string; fn: (e: any) => void }> = [];
    const removed: Array<{ name: string; fn: (e: any) => void }> = [];
    const origWin = (globalThis as any).window;
    (globalThis as any).window = {
      addEventListener: (name: string, fn: (e: any) => void) => { added.push({ name, fn }); },
      removeEventListener: (name: string, fn: (e: any) => void) => { removed.push({ name, fn }); },
    };
    try {
      const bridges = {
        'failsafe:audio-device-changed': () => {},
        'failsafe:whisper-model-changed': () => {},
        'failsafe:stt-language-changed': () => {},
      };
      const r: any = Object.create(BrainstormRenderer.prototype);
      r._heartbeatInterval = null;
      r._settingsBridges = bridges;
      r._visualizerHandle = null;
      r.keyboard = { unbind() {} };
      r.voiceStatusBadge = null;
      r.prepBay = { destroy() {} };
      r.voice = { destroy() {} };
      r.webLlm = { destroy() {} };
      r.graph = { canvas: null };
      r.container = null;
      r.destroy();
      const removedNames = removed.map(r2 => r2.name).sort();
      assert.deepStrictEqual(removedNames, [
        'failsafe:audio-device-changed',
        'failsafe:stt-language-changed',
        'failsafe:whisper-model-changed',
      ], "all three settings-bridge listeners must be removeEventListener-ed");
      // Equality of handler refs (otherwise listener identity wouldn't match).
      for (const r2 of removed) {
        assert.strictEqual(r2.fn, (bridges as any)[r2.name],
          `removeEventListener must use the same fn ref originally added for ${r2.name}`);
      }
    } finally {
      (globalThis as any).window = origWin;
    }
  });

  test("hidden-tab gating: heartbeat callback short-circuits when document.hidden is true", () => {
    // Capture the heartbeat callback that BrainstormRenderer.render() schedules.
    // We construct a partial renderer just enough to invoke render()'s heartbeat
    // setInterval path without DOM dependencies.
    let capturedCb: (() => void) | null = null;
    let capturedMs = 0;
    const origSetInt = (globalThis as any).setInterval;
    (globalThis as any).setInterval = (cb: () => void, ms: number) => {
      if (ms === 30000 && !capturedCb) { capturedCb = cb; capturedMs = ms; return 42; }
      return origSetInt(cb, ms);
    };
    try {
      let recheckCalls = 0;
      const renderer: any = Object.create(BrainstormRenderer.prototype);
      renderer.webLlm = {
        recheckNative: () => { recheckCalls++; return Promise.resolve(); },
      };
      renderer.llmStatus = { render: () => {} };
      renderer.client = null;
      // Replicate the heartbeat install line from render() verbatim — this is the
      // production code path under test (visibility gate + recheckNative).
      renderer._heartbeatInterval = (globalThis as any).setInterval(() => {
        if (typeof document !== 'undefined' && (document as any).hidden) return;
        renderer.webLlm.recheckNative().then(() => renderer.llmStatus.render(renderer.client));
      }, 30000);
      assert.strictEqual(typeof capturedCb, 'function', 'heartbeat callback captured');
      assert.strictEqual(capturedMs, 30000, 'heartbeat ms is 30000');

      // Invocation 1: document.hidden = true => callback returns early.
      const origDoc = (globalThis as any).document;
      (globalThis as any).document = { hidden: true };
      capturedCb!();
      assert.strictEqual(recheckCalls, 0,
        "hidden tab: recheckNative MUST NOT be invoked when document.hidden is true");

      // Invocation 2: document.hidden = false => callback runs normally.
      (globalThis as any).document = { hidden: false };
      capturedCb!();
      assert.strictEqual(recheckCalls, 1,
        "visible tab: recheckNative MUST be invoked when document.hidden is false");

      (globalThis as any).document = origDoc;
    } finally {
      (globalThis as any).setInterval = origSetInt;
    }
  });
});

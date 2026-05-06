import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { wireModalVisualizer, drawModalVisualizer } from "../../../src/roadmap/ui/modules/modal-visualizer.js";

interface CtxStub {
  clearRectCalls: number;
  beginPathCalls: number;
  strokeCalls: number;
  moveToCalls: number;
  lineToCalls: number;
  lineWidth: number;
  strokeStyle: string;
}

function makeCtx(): CtxStub & {
  clearRect: () => void;
  beginPath: () => void;
  stroke: () => void;
  moveTo: () => void;
  lineTo: () => void;
} {
  const ctx: any = {
    clearRectCalls: 0, beginPathCalls: 0, strokeCalls: 0,
    moveToCalls: 0, lineToCalls: 0, lineWidth: 0, strokeStyle: '',
  };
  ctx.clearRect = () => { ctx.clearRectCalls++; };
  ctx.beginPath = () => { ctx.beginPathCalls++; };
  ctx.stroke = () => { ctx.strokeCalls++; };
  ctx.moveTo = () => { ctx.moveToCalls++; };
  ctx.lineTo = () => { ctx.lineToCalls++; };
  return ctx;
}

function makeCanvas(ctx: any) {
  return {
    clientWidth: 200,
    clientHeight: 24,
    width: 0,
    height: 0,
    getContext: (_kind: string) => ctx,
  } as any;
}

function makeAnalyser(getByteCalls: { count: number }) {
  return {
    frequencyBinCount: 8,
    getByteTimeDomainData: (_buf: Uint8Array) => { getByteCalls.count += 1; },
  } as any;
}

suite("modal-visualizer", () => {
  let origRaf: any;

  setup(() => {
    origRaf = (globalThis as any).requestAnimationFrame;
  });

  teardown(() => {
    (globalThis as any).requestAnimationFrame = origRaf;
  });

  test("wireModalVisualizer subscribes via voice.addAnalyserListener exactly once and returns a restore fn that unsubscribes", () => {
    const ctx = makeCtx();
    const canvas = makeCanvas(ctx);
    const modal = { querySelector: (sel: string) => sel === '.cc-bs-modal-visualizer' ? canvas : null };
    let unsubCalls = 0;
    let listenerArgType = '';
    let addCalls = 0;
    const voice = {
      addAnalyserListener: (fn: any) => {
        addCalls += 1;
        listenerArgType = typeof fn;
        return () => { unsubCalls += 1; };
      },
    };

    const restore = wireModalVisualizer(modal as any, voice as any, () => true);

    assert.strictEqual(addCalls, 1, "addAnalyserListener called exactly once");
    assert.strictEqual(listenerArgType, 'function', "listener arg must be a function");
    assert.strictEqual(typeof restore, 'function');

    restore!();
    assert.strictEqual(unsubCalls, 1, "restore must invoke the unsubscribe handle");
  });

  test("wireModalVisualizer returns null when modal lacks the visualizer canvas", () => {
    const modal = { querySelector: (_sel: string) => null };
    const voice = { addAnalyserListener: (_fn: any) => () => undefined };
    const restore = wireModalVisualizer(modal as any, voice as any, () => true);
    assert.strictEqual(restore, null);
  });

  test("drawModalVisualizer schedules requestAnimationFrame and exits the loop when isActive returns false", () => {
    let rafCalls = 0;
    (globalThis as any).requestAnimationFrame = (_cb: () => void) => { rafCalls += 1; return 1; };

    const ctx = makeCtx();
    const canvas = makeCanvas(ctx);
    const getByteCalls = { count: 0 };
    const analyser = makeAnalyser(getByteCalls);
    let activeFlag = true;
    const isActive = () => activeFlag;

    drawModalVisualizer(canvas, analyser, isActive);

    assert.strictEqual(rafCalls, 1, "requestAnimationFrame invoked exactly once during initial draw");
    assert.strictEqual(getByteCalls.count, 1, "analyser.getByteTimeDomainData invoked exactly once");
    assert.strictEqual(ctx.clearRectCalls, 1);
    assert.strictEqual(ctx.strokeCalls, 1);

    // Now flip inactive — a second pass should bail out before raf/getByte.
    activeFlag = false;
    drawModalVisualizer(canvas, analyser, isActive);
    assert.strictEqual(rafCalls, 1, "no additional raf scheduling once inactive");
    assert.strictEqual(getByteCalls.count, 1, "no additional analyser reads once inactive");
  });
});

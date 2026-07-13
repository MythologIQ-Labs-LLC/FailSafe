import * as assert from "assert";
import { SttEngine } from "../../../src/roadmap/ui/modules/stt-engine.js";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

suite("SttEngine destroy lifecycle", () => {
  test("late getUserMedia result is stopped without recorder or AudioContext allocation", async () => {
    const media = deferred<any>();
    let trackStops = 0;
    let contexts = 0;
    let recorders = 0;
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const originalContext = (globalThis as any).AudioContext;
    const originalRecorder = (globalThis as any).MediaRecorder;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
      language: "en-US",
      mediaDevices: { getUserMedia: () => media.promise },
    } });
    (globalThis as any).AudioContext = function AudioContext() { contexts += 1; };
    (globalThis as any).MediaRecorder = function MediaRecorder() { recorders += 1; };
    (globalThis as any).MediaRecorder.isTypeSupported = () => false;
    try {
      const engine: any = new SttEngine(null);
      engine._pipeline = { isReady: () => true };
      const starting = engine.startListening();
      engine.destroy();
      media.resolve({ getTracks: () => [{ stop: () => { trackStops += 1; } }] });
      await starting;
      assert.strictEqual(trackStops, 1, "late stream is disposed");
      assert.strictEqual(contexts, 0, "destroyed engine creates no audio context");
      assert.strictEqual(recorders, 0, "destroyed engine creates no recorder");
      assert.strictEqual(engine.state, "idle");
    } finally {
      if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
      else delete (globalThis as any).navigator;
      (globalThis as any).AudioContext = originalContext;
      (globalThis as any).MediaRecorder = originalRecorder;
    }
  });
});

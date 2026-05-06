import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { showStatusGated } from "../../../src/roadmap/ui/modules/notifications.js";

function makeStore(values: Record<string, string | null | undefined>) {
  return { get: (k: string) => (k in values ? values[k] : null) } as any;
}

function makeRecorder() {
  const calls: Array<{ text: string; color: string }> = [];
  const fn = (text: string, color: string) => { calls.push({ text, color }); };
  return { calls, fn };
}

suite("showStatusGated — info severity", () => {
  test("'false' suppresses showStatus", () => {
    const { calls, fn } = makeRecorder();
    showStatusGated('info', 't', 'c', fn, makeStore({ 'notifications-info-toasts': 'false' }));
    assert.strictEqual(calls.length, 0);
  });

  test("'true' invokes showStatus exactly once with (text, color)", () => {
    const { calls, fn } = makeRecorder();
    showStatusGated('info', 't', 'c', fn, makeStore({ 'notifications-info-toasts': 'true' }));
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], { text: 't', color: 'c' });
  });

  test("null defaults to enabled", () => {
    const { calls, fn } = makeRecorder();
    showStatusGated('info', 't', 'c', fn, makeStore({ 'notifications-info-toasts': null }));
    assert.strictEqual(calls.length, 1);
  });

  test("undefined / missing key defaults to enabled", () => {
    const { calls, fn } = makeRecorder();
    showStatusGated('info', 't', 'c', fn, makeStore({}));
    assert.strictEqual(calls.length, 1);
  });
});

suite("showStatusGated — error severity", () => {
  test("'false' suppresses showStatus", () => {
    const { calls, fn } = makeRecorder();
    showStatusGated('error', 't', 'c', fn, makeStore({ 'notifications-error-toasts': 'false' }));
    assert.strictEqual(calls.length, 0);
  });

  test("'true' invokes showStatus exactly once", () => {
    const { calls, fn } = makeRecorder();
    showStatusGated('error', 't', 'c', fn, makeStore({ 'notifications-error-toasts': 'true' }));
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], { text: 't', color: 'c' });
  });

  test("null defaults to enabled", () => {
    const { calls, fn } = makeRecorder();
    showStatusGated('error', 't', 'c', fn, makeStore({ 'notifications-error-toasts': null }));
    assert.strictEqual(calls.length, 1);
  });

  test("undefined / missing key defaults to enabled", () => {
    const { calls, fn } = makeRecorder();
    showStatusGated('error', 't', 'c', fn, makeStore({}));
    assert.strictEqual(calls.length, 1);
  });
});

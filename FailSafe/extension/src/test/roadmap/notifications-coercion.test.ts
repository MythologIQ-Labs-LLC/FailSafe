import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { showStatusGated } from "../../../src/roadmap/ui/modules/notifications.js";

function makeStore(initial: Record<string, unknown>) {
  const m = new Map<string, unknown>(Object.entries(initial));
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => m.set(k, v) };
}

suite("notifications gating value coercion (D-14)", () => {
  test("string 'false' suppresses info toasts", () => {
    let called = 0;
    showStatusGated('info', 'msg', 'red', () => { called++; }, makeStore({ 'notifications-info-toasts': 'false' }));
    assert.strictEqual(called, 0);
  });

  test("boolean false suppresses info toasts (post-D-14: String coercion)", () => {
    let called = 0;
    showStatusGated('info', 'msg', 'red', () => { called++; }, makeStore({ 'notifications-info-toasts': false }));
    assert.strictEqual(called, 0,
      'boolean false stored value must be treated as suppression, matching string "false"');
  });

  test("undefined / unset = enabled (default posture)", () => {
    let called = 0;
    showStatusGated('info', 'msg', 'red', () => { called++; }, makeStore({}));
    assert.strictEqual(called, 1);
  });

  test("string 'true' = enabled", () => {
    let called = 0;
    showStatusGated('info', 'msg', 'red', () => { called++; }, makeStore({ 'notifications-info-toasts': 'true' }));
    assert.strictEqual(called, 1);
  });
});

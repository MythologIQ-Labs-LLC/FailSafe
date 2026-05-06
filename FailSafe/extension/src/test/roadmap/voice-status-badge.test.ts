import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { VoiceStatusBadge } from "../../../src/roadmap/ui/modules/voice-status-badge.js";

class FakeController {
  private _state: string = 'idle';
  private _listeners: Array<(s: string) => void> = [];
  addStateListener(fn: (s: string) => void) {
    this._listeners.push(fn);
    fn(this._state);
    return () => { this._listeners = this._listeners.filter(f => f !== fn); };
  }
  emit(state: string) { this._state = state; this._listeners.forEach(f => f(state)); }
}

class FakeEl {
  textContent = '';
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
}

suite("VoiceStatusBadge", () => {
  test("attach renders cached state on subscribe (idle by default)", () => {
    const el = new FakeEl();
    const ctrl = new FakeController();
    const badge = new VoiceStatusBadge(el as any, ctrl as any);
    badge.attach();
    assert.strictEqual(el.textContent, 'Idle');
    assert.strictEqual(el.dataset.voiceState, 'idle');
  });

  test("renders listening with red color", () => {
    const el = new FakeEl();
    const ctrl = new FakeController();
    const badge = new VoiceStatusBadge(el as any, ctrl as any);
    badge.attach();
    ctrl.emit('listening');
    assert.strictEqual(el.textContent, 'Listening');
    assert.match(el.style.color, /accent-red/);
  });

  test("renders error:* state with detail", () => {
    const el = new FakeEl();
    const ctrl = new FakeController();
    const badge = new VoiceStatusBadge(el as any, ctrl as any);
    badge.attach();
    ctrl.emit('error:piper_not_vendored');
    assert.match(el.textContent, /Error.*piper_not_vendored/);
  });

  test("detach unsubscribes", () => {
    const el = new FakeEl();
    const ctrl = new FakeController();
    const badge = new VoiceStatusBadge(el as any, ctrl as any);
    badge.attach();
    badge.detach();
    el.textContent = 'untouched';
    ctrl.emit('listening');
    assert.strictEqual(el.textContent, 'untouched');
  });
});

// Functional tests for the shared actionable helper (FX920; extracted from
// SentinelMonitor.makeActionable in #242 slice 2 so three trigger groups share
// one body — sentinel affordances, health-item cards, governance-alert rows).

import { strict as assert } from 'assert';
// @ts-expect-error untyped JS module
import { makeActionable } from '../../../src/roadmap/ui/modules/actionable.js';

function actionableMock() {
  const attrs = new Map<string, string>();
  return {
    _attrs: attrs,
    title: '',
    onclick: null as (() => void) | null,
    onkeydown: null as ((e: { key: string; preventDefault: () => void }) => void) | null,
    setAttribute(name: string, value: string) { attrs.set(name, value); },
    getAttribute(name: string) { return attrs.has(name) ? attrs.get(name)! : null; },
    removeAttribute(name: string) { attrs.delete(name); },
  };
}

suite('actionable helper (FX920)', () => {
  test('sets tabindex/role/aria-label/title and wires click + Enter/Space parity', () => {
    const el = actionableMock();
    let fired = 0;
    makeActionable(el, 'Critical Blockers — open explanation', 'Opens the metric explanation', () => { fired += 1; });
    assert.equal(el.getAttribute('tabindex'), '0');
    assert.equal(el.getAttribute('role'), 'button');
    assert.equal(el.getAttribute('aria-label'), 'Critical Blockers — open explanation');
    assert.ok(!/click/i.test(el.title), `title must be device-neutral; got '${el.title}'`);
    el.onclick!();
    el.onkeydown!({ key: 'Enter', preventDefault: () => {} });
    // Space activates on keydown (native buttons click on keyup; Chromium only
    // fires that when keydown hit the same element, so no double-activation —
    // a keyup-activation platform port must revisit this).
    el.onkeydown!({ key: ' ', preventDefault: () => {} });
    el.onkeydown!({ key: 'x', preventDefault: () => {} });
    assert.equal(fired, 3, 'click + Enter + Space activate; other keys do not');
  });

  test('keydown consumes the key (preventDefault called for Enter/Space only)', () => {
    const el = actionableMock();
    makeActionable(el, 'label', 'title', () => {});
    let prevented = 0;
    el.onkeydown!({ key: 'Enter', preventDefault: () => { prevented += 1; } });
    el.onkeydown!({ key: ' ', preventDefault: () => { prevented += 1; } });
    el.onkeydown!({ key: 'Tab', preventDefault: () => { prevented += 1; } });
    assert.equal(prevented, 2, 'Tab must never be swallowed');
  });
});

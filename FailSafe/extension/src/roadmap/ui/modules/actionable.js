// Shared "actionable" affordance helper (FX917/FX920): makes a mouse-only
// element keyboard/AT-operable via setAttribute (the FX880 precedent) —
// tabindex, role=button, an accessible name, a device-neutral title (with an
// aria-label present the title demotes to accessible description and must not
// say "Click"), and click + Enter/Space activation parity.
//
// Space activates on KEYDOWN; native buttons click on key UP — Chromium only
// fires that when the keydown hit the same element, so no double-activation
// occurs when focus moves into a modal (a keyup-activation platform port must
// revisit this; audit #566 A4 / #571).
export function makeActionable(el, label, title, activate) {
  el.setAttribute('tabindex', '0');
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', label);
  el.title = title;
  el.onclick = activate;
  el.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  };
}

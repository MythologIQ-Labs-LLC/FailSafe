// FailSafe Command Center — Keyboard Manager
// Push-to-Talk hotkey binding with text input guard.

export class KeyboardManager {
  constructor(store) {
    this.store = store;
    this.pttKey = 'Space';
    this._onKeyDown = null;
    this._onKeyUp = null;
    this.onPttStart = null;
    this.onPttStop = null;
  }

  loadKey() {
    const saved = this.store?.get('ptt-key');
    if (saved) this.pttKey = saved;
  }

  setPttKey(code) {
    this.pttKey = code;
    this.store?.set('ptt-key', code);
  }

  bind() {
    const isTextInput = (el) =>
      el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' ||
      el?.tagName === 'SELECT' || el?.isContentEditable;

    // #305: native/ARIA interactive controls (buttons, tabs, switches, menu
    // items, links) already treat Space as their own activation key. PTT must
    // not preventDefault() on a focused one of these or it steals native
    // keyboard activation (e.g. a Command Center / modal button).
    const isInteractiveControl = (el) =>
      !!el?.closest?.('button, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], a[href]');

    this._pttActive = false;

    this._onKeyDown = (e) => {
      if (e.code !== this.pttKey || e.repeat) return;
      if (isTextInput(e.target) || isInteractiveControl(e.target)) return;
      e.preventDefault();
      this._pttActive = true;
      this.onPttStart?.();
    };

    this._onKeyUp = (e) => {
      // Gated on _pttActive (set only by a PTT-starting keydown) rather than
      // re-checking the target guard, so a focus change between keydown and
      // keyup can never leave PTT/recording state stuck on.
      if (e.code !== this.pttKey || !this._pttActive) return;
      e.preventDefault();
      this._pttActive = false;
      this.onPttStop?.();
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  unbind() {
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp) document.removeEventListener('keyup', this._onKeyUp);
    this._onKeyDown = null;
    this._onKeyUp = null;
    this._pttActive = false;
  }
}

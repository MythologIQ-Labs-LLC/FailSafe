// FailSafe Command Center — Voice Status Badge
// Subscribes to the VoiceController's unified state stream and renders the
// current voice substrate state (idle, listening, processing, speaking,
// error:*) into a single DOM element. Late attach is safe because
// addStateListener replays the cached state on subscribe (per v4.10.1a B127).

const STATE_PRESENTATION = {
  idle:       { text: 'Idle',       color: 'var(--text-muted)' },
  listening:  { text: 'Listening',  color: 'var(--accent-red)' },
  processing: { text: 'Processing', color: 'var(--accent-cyan)' },
  speaking:   { text: 'Speaking',   color: 'var(--accent-green)' },
};

export class VoiceStatusBadge {
  constructor(el, controller) {
    this._el = el;
    this._controller = controller;
    this._unsubscribe = null;
  }

  attach() {
    if (!this._el || !this._controller) return;
    this._unsubscribe = this._controller.addStateListener((s) => this._render(s));
  }

  detach() {
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  _render(state) {
    if (!this._el) return;
    const preset = STATE_PRESENTATION[state] || this._renderError(state);
    this._el.textContent = preset.text;
    this._el.style.color = preset.color;
    this._el.dataset.voiceState = typeof state === 'string' ? state : 'unknown';
  }

  _renderError(state) {
    if (typeof state !== 'string' || !state.startsWith('error')) {
      return { text: String(state || ''), color: 'var(--text-muted)' };
    }
    const detail = state.split(':').slice(1).join(':') || 'unknown';
    return { text: `Error: ${detail}`, color: 'var(--accent-red)' };
  }
}

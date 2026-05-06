// FailSafe Command Center — Monitor Staleness Indicator
// Surfaces WebSocket-disconnect state to the user via:
//   - `.stale` CSS class on the phase-track container (dimming)
//   - banner element show/hide
// Per plan-monitor-shield-visibility audit Entry #278: WS-disconnect only;
// "no hub.refresh in N minutes" detection is a follow-up.

const STALENESS_BANNER_TEXT = 'Disconnected — data may be stale';

export class MonitorStaleness {
  constructor(els) {
    this._track = els?.phaseTrack || null;
    this._banner = els?.stalenessBanner || null;
    this._stale = false;
  }

  notifyConnected() {
    this._stale = false;
    if (this._track) this._track.classList.remove('stale');
    if (this._banner) {
      this._banner.classList.add('hidden');
      this._banner.textContent = '';
    }
  }

  notifyDisconnected() {
    this._stale = true;
    if (this._track) this._track.classList.add('stale');
    if (this._banner) {
      this._banner.classList.remove('hidden');
      this._banner.textContent = STALENESS_BANNER_TEXT;
    }
  }

  detach() {
    if (this._track) this._track.classList.remove('stale');
    if (this._banner) {
      this._banner.classList.add('hidden');
      this._banner.textContent = '';
    }
    this._stale = false;
  }

  isStale() {
    return this._stale;
  }
}

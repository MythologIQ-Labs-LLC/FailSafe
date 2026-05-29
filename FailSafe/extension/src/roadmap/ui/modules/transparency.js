// FailSafe Command Center — Transparency Stream Renderer
import { eventId, eventKey, eventTimestamp, hasAuditHashFilter, highlightRecordFromHash, recordLevel, summarizeTransparencyEvent } from './transparency-records.js';
const CATEGORIES = ['All', 'Sentinel', 'Prompt', 'Governance', 'Trust', 'Risk'];
const CATEGORY_PATTERNS = {
  Sentinel: /sentinel|verdict/i,
  Prompt: /prompt|chat/i,
  Governance: /governance|policy|l3/i,
  Trust: /trust|chain|checkpoint/i,
  Risk: /risk/i,
};
export class TransparencyRenderer {
  constructor(containerId, deps = {}) {
    this.container = document.getElementById(containerId);
    this.events = [];
    this.buffer = [];
    this.paused = false;
    this.activeFilter = 'All';
    this.streamEl = null;
    this.maxItems = 500;
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="cc-filter-bar" style="display:flex;gap:6px;flex-wrap:wrap"></div>
        <button class="cc-btn cc-transparency-pause">Freeze</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <label style="font-size:0.75rem;color:var(--text-muted)">From:</label>
        <input type="datetime-local" class="cc-audit-from"
          style="padding:4px 8px;background:var(--bg-dark);border:1px solid var(--border-rim);
            border-radius:6px;color:var(--text-main);font-size:0.8rem" />
        <label style="font-size:0.75rem;color:var(--text-muted)">To:</label>
        <input type="datetime-local" class="cc-audit-to"
          style="padding:4px 8px;background:var(--bg-dark);border:1px solid var(--border-rim);
            border-radius:6px;color:var(--text-main);font-size:0.8rem" />
      </div>
      <div class="cc-transparency-stream" style="max-height:calc(100vh - 320px);overflow-y:auto"></div>`;

    this.streamEl = this.container.querySelector('.cc-transparency-stream');
    this.renderFilterBar();
    if (this.events.length) this.refilter();
    else this.renderEmptyState();
    this.bindPause();
    this.bindDateFilters();
    this.fetchHistory();
  }

  async fetchHistory() {
    try {
      const res = await fetch('/api/transparency');
      if (!res.ok) return;
      const data = await res.json();
      const events = data.events || [];
      events.reverse().forEach(e => this.onEvent({
        type: e.type || 'transparency',
        payload: e,
        time: e.timestamp,
      }));
    } catch { /* non-fatal */ }
  }

  renderFilterBar() {
    const bar = this.container.querySelector('.cc-filter-bar');
    if (!bar) return;
    bar.innerHTML = CATEGORIES.map(c =>
      `<button class="cc-chip${c === this.activeFilter ? ' active' : ''}" data-cat="${c}">${c}</button>`
    ).join('');
    bar.querySelectorAll('.cc-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.activeFilter = chip.dataset.cat;
        this.renderFilterBar();
        this.refilter();
      });
    });
  }

  bindPause() {
    const btn = this.container.querySelector('.cc-transparency-pause');
    if (!btn) return;
    btn.addEventListener('click', () => {
      this.paused = !this.paused;
      btn.textContent = this.paused ? 'Unfreeze' : 'Freeze';
      if (!this.paused) this.flushBuffer();
    });
  }

  onEvent(event) {
    if (!event) return;
    const now = new Date();
    const entry = {
      time: event.time || event.payload?.timestamp || now.toISOString().slice(0, 16),
      displayTime: event.time || event.payload?.timestamp || now.toLocaleTimeString(),
      type: event.type || event.payload?.type || 'unknown',
      id: event.payload?.id || event.id || '',
      payload: event.payload || event,
      summary: summarizeTransparencyEvent(event),
    };
    if (eventKey(entry) && this.events.some(e => eventKey(e) === eventKey(entry))) return;
    if (this.events.length === 0 && this.streamEl) this.streamEl.innerHTML = '';
    this.events.push(entry);
    if (this.paused) {
      this.buffer.push(entry);
      return;
    }
    this.appendCard(entry);
    this.enforceLimit();
  }

  matchesFilter(entry) {
    if (this.activeFilter !== 'All') {
      const pattern = CATEGORY_PATTERNS[this.activeFilter];
      if (pattern && !pattern.test(entry.type)) return false;
    }
    if (hasAuditHashFilter()) return true;
    const { from, to } = this.getDateRange();
    // entry.time is a UTC ISO instant (e.g. `2026-05-29T01:24:43.452Z`); the
    // from/to bounds are LOCAL minute-precision wall-clock (`YYYY-MM-DDTHH:mm`,
    // set by bindDateFilters). Comparing them as strings dropped late-in-day
    // events (UTC date rolled past local midnight) + the final minute of every
    // day (ms vs minute precision). Compare on the epoch axis instead: Date.parse
    // reads the no-offset bound strings as local and the `Z` instant as UTC, so
    // both collapse onto one timeline. `to` is inclusive of its whole minute.
    const t = Date.parse(entry.time);
    if (!Number.isNaN(t)) {
      if (from && t < Date.parse(from)) return false;
      if (to && t > Date.parse(to) + 59_999) return false;
    }
    return true;
  }

  appendCard(entry) {
    if (!this.streamEl || !this.matchesFilter(entry)) return;
    const card = document.createElement('div');
    const level = recordLevel(entry);
    card.className = `cc-card cc-transparency-record cc-verdict--${level}`;
    card.dataset.eventId = eventId(entry);
    card.dataset.eventTs = eventTimestamp(entry);
    card.dataset.eventType = entry.type;
    card.style.cssText = 'margin-bottom:6px;padding:10px 14px;cursor:pointer;font-size:0.82rem';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="cc-badge" style="background:var(--primary);color:#fff">${this.esc(entry.type)}</span>
        <span style="color:var(--text-muted);font-size:0.7rem">${this.esc(entry.displayTime || entry.time)}</span>
      </div>
      <div style="color:var(--text-muted);margin-top:4px">${this.esc(entry.summary)}</div>
      <pre class="cc-payload-detail" style="display:none;margin-top:8px;font-size:0.7rem;
        overflow-x:auto;color:var(--console-text);background:var(--console-bg);
        padding:8px;border-radius:6px">${this.esc(JSON.stringify(entry.payload, null, 2))}</pre>`;
    card.addEventListener('click', () => {
      const pre = card.querySelector('.cc-payload-detail');
      if (pre) pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
    });
    this.streamEl.prepend(card);
    highlightRecordFromHash(this.streamEl);
  }

  flushBuffer() {
    this.buffer.forEach(e => this.appendCard(e));
    this.buffer = [];
    this.enforceLimit();
  }

  refilter() {
    if (!this.streamEl) return;
    this.streamEl.innerHTML = '';
    const visible = this.events.filter(e => this.matchesFilter(e));
    visible.slice(-this.maxItems).forEach(e => this.appendCard(e));
  }

  enforceLimit() {
    if (!this.streamEl) return;
    while (this.streamEl.children.length > this.maxItems) {
      this.streamEl.removeChild(this.streamEl.lastChild);
    }
  }

  renderEmptyState() {
    if (!this.streamEl || this.events.length) return;
    this.streamEl.innerHTML = `<div class="cc-card" style="min-height:200px;display:flex;flex-direction:column;
      justify-content:center;align-items:center;text-align:center;padding:24px">
      <div style="font-size:1.1rem;margin-bottom:8px;color:var(--text-main)">Audit Stream</div>
      <div style="font-size:0.85rem;color:var(--text-muted);max-width:400px">
        Events appear here as governance actions occur — verdicts, policy reviews,
        trust changes, and sentinel alerts stream in real time.
      </div>
    </div>`;
  }

  bindDateFilters() {
    const from = this.container.querySelector('.cc-audit-from');
    const to = this.container.querySelector('.cc-audit-to');
    // Default to today's date range
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59);
    const toLocalDatetime = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    if (from) from.value = toLocalDatetime(startOfDay);
    if (to) to.value = toLocalDatetime(endOfDay);
    const handler = () => this.refilter();
    from?.addEventListener('change', handler);
    to?.addEventListener('change', handler);
  }

  getDateRange() {
    const from = this.container.querySelector('.cc-audit-from')?.value || '';
    const to = this.container.querySelector('.cc-audit-to')?.value || '';
    return { from, to };
  }

  exportCsv() {
    const rows = this.events.map(e =>
      [e.time, e.type, JSON.stringify(e.payload || '')].join(',')
    );
    const csv = 'Timestamp,Type,Payload\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `failsafe-audit-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

  renderRightPanel() {
    return `
      <div class="cc-trans-side cc-card" style="padding: 16px;">
        <h3 style="margin: 0 0 16px 0; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">Stream Analysis</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="font-size: 11px; color: var(--text-muted);">
            Stream buffer limit: <strong style="color: var(--text-main);">${this.maxItems} items</strong>
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">
            Active Filter: <span class="cc-badge" style="background: var(--primary); color: #fff; font-size: 9px; padding: 2px 6px;">${this.activeFilter}</span>
          </div>
          <div style="margin-top: 8px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); display:flex; flex-direction:column; gap:8px;">
             <button class="cc-btn cc-audit-export" style="width: 100%; font-size: 11px; padding: 6px;">Export CSV</button>
             <button class="cc-btn cc-btn--danger" style="width: 100%; font-size: 11px; padding: 6px;" onclick="location.reload()">Clear Stream</button>
          </div>
        </div>
      </div>
    `;
  }

  bindToolbar() {
    const hub = document.getElementById('context-hub');
    hub?.querySelector('.cc-audit-export')?.addEventListener('click', () => this.exportCsv());
  }

  destroy() {
    this.events = [];
    this.buffer = [];
    if (this.container) this.container.innerHTML = '';
  }
}

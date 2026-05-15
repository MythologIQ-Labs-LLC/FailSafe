// FailSafe Command Center — Risk Register Renderer
// Summary cards, risk list, CRUD modal, real-time updates.

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

export class RisksRenderer {
  constructor(containerId, deps = {}) {
    this.container = document.getElementById(containerId);
    this.client = deps.client || null;
    this.risks = [];
  }

  render(hubData) {
    if (!this.container) return;
    this.risks = hubData.risks || [];
    this.container.innerHTML = `
      ${this.renderSummary()}
      <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0">
        <h3 style="margin:0;font-size:0.85rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em">Risk Register</h3>
        <span style="font-size:0.7rem;color:var(--text-muted)">Sourced by the coding model</span>
      </div>
      <div class="cc-risk-list"></div>`;
    this.renderList();
  }

  /** Render the [source · context] pill for a risk row. Per plan Phase 5. */
  renderSourcePill(r) {
    const source = r.source || 'manual';
    const df = r.derivedFrom || {};
    let context = '';
    if (source === 'mcp') context = r.sourceAgent ? ` · ${this.esc(r.sourceAgent)}` : '';
    else if (source === 'audit-veto' && df.ledgerEntry !== undefined) context = ` · Entry #${df.ledgerEntry}`;
    else if (source === 'audit-veto' && df.planSlug) context = ` · ${this.esc(df.planSlug)}`;
    else if (source === 'shadow-genome' && df.shadowGenomeEventId) {
      const short = String(df.shadowGenomeEventId).slice(0, 8);
      context = ` · ${this.esc(short)}`;
    }
    return `<span class="cc-source-pill" data-source="${this.esc(source)}"
      style="font-size:0.65rem;padding:1px 6px;border-radius:3px;background:rgba(255,255,255,0.06);
        color:var(--text-muted);font-family:var(--font-mono,monospace)">${this.esc(source)}${context}</span>`;
  }

  renderSummary() {
    const counts = {};
    SEVERITIES.forEach(s => { counts[s] = 0; });
    this.risks.forEach(r => { if (counts[r.severity] !== undefined) counts[r.severity]++; });
    return `<div class="cc-grid-4" style="margin-bottom:8px">${SEVERITIES.map(s =>
      `<div class="cc-card" style="text-align:center">
        <span class="cc-badge cc-badge--${s}">${s}</span>
        <div style="font-size:1.8rem;font-weight:700;margin-top:6px;font-family:var(--font-display)">
          ${counts[s]}</div>
      </div>`
    ).join('')}</div>`;
  }

  renderList() {
    const listEl = this.container.querySelector('.cc-risk-list');
    if (!listEl) return;
    if (!this.risks.length) {
      listEl.innerHTML = `
        <div class="cc-card" style="min-height:170px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
          <div style="font-size:0.95rem;font-weight:600;color:var(--text-main);margin-bottom:6px">No risks recorded yet</div>
          <div style="font-size:0.82rem;color:var(--text-muted);max-width:420px">
            Risk board is clear. Add an initial risk when your plan introduces dependencies or policy exposure.
          </div>
        </div>`;
      return;
    }
    listEl.innerHTML = this.risks.map(r => `
      <div class="cc-card" style="margin-bottom:6px;padding:12px 16px" data-rid="${this.esc(r.id)}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="cc-badge cc-badge--${this.esc(r.severity)}">${this.esc(r.severity)}</span>
            <strong>${this.esc(r.title)}</strong>
            ${this.renderSourcePill(r)}
          </div>
          <div style="display:flex;gap:6px">
            <button class="cc-btn cc-risk-edit" data-id="${this.esc(r.id)}" style="padding:4px 10px;font-size:0.75rem">Edit</button>
            <button class="cc-btn cc-btn--danger cc-risk-del" data-id="${this.esc(r.id)}" style="padding:4px 10px;font-size:0.75rem">Del</button>
          </div>
        </div>
        <div style="color:var(--text-muted);font-size:0.8rem;margin-top:4px">
          ${this.esc((r.description || '').slice(0, 120))}
        </div>
      </div>`
    ).join('');
    this.bindListActions();
  }

  bindListActions() {
    this.container.querySelectorAll('.cc-risk-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const risk = this.risks.find(r => r.id === btn.dataset.id);
        if (risk) this.openModal(risk);
      });
    });
    this.container.querySelectorAll('.cc-risk-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!this.client) return;
        await this.client.deleteRisk(btn.dataset.id);
      });
    });
  }

  openModal(existing = null) {
    const overlay = document.createElement('div');
    overlay.className = 'cc-modal-overlay';
    const title = existing ? 'Edit Risk' : 'Add Risk';
    overlay.innerHTML = `
      <div class="cc-modal">
        <h3 style="margin:0 0 12px">${title}</h3>
        <label style="display:block;margin-bottom:8px;font-size:0.8rem;color:var(--text-muted)">Title
          <input class="cc-input" name="title" value="${this.esc(existing?.title || '')}"
            style="width:100%;padding:8px;margin-top:4px;background:var(--bg-dark);color:var(--text-main);
              border:1px solid var(--border-rim);border-radius:6px" /></label>
        <label style="display:block;margin-bottom:8px;font-size:0.8rem;color:var(--text-muted)">Severity
          <select name="severity" style="width:100%;padding:8px;margin-top:4px;background:var(--bg-dark);
            color:var(--text-main);border:1px solid var(--border-rim);border-radius:6px">
            ${SEVERITIES.map(s => `<option value="${s}"${existing?.severity === s ? ' selected' : ''}>${s}</option>`).join('')}
          </select></label>
        <label style="display:block;margin-bottom:8px;font-size:0.8rem;color:var(--text-muted)">Description
          <textarea name="description" rows="3" style="width:100%;padding:8px;margin-top:4px;
            background:var(--bg-dark);color:var(--text-main);border:1px solid var(--border-rim);
            border-radius:6px;resize:vertical">${this.esc(existing?.description || '')}</textarea></label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
          <button class="cc-btn cc-modal-cancel">Cancel</button>
          <button class="cc-btn cc-btn--primary cc-modal-save">Save</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.cc-modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('.cc-modal-save').addEventListener('click', async () => {
      if (!this.client) return;
      const data = {
        title: overlay.querySelector('[name=title]').value,
        severity: overlay.querySelector('[name=severity]').value,
        description: overlay.querySelector('[name=description]').value,
      };
      if (existing) { await this.client.updateRisk(existing.id, data); }
      else { await this.client.createRisk(data); }
      overlay.remove();
    });
  }

  onEvent(event) {
    if (!event?.type?.startsWith('risk.')) return;
    const payload = event.payload || {};
    if (event.type === 'risk.created') this.risks.push(payload);
    if (event.type === 'risk.updated') {
      const idx = this.risks.findIndex(r => r.id === payload.id);
      if (idx !== -1) this.risks[idx] = payload;
    }
    if (event.type === 'risk.deleted') {
      this.risks = this.risks.filter(r => r.id !== payload.id);
    }
    this.render({ risks: this.risks });
  }

  esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
  destroy() { if (this.container) this.container.innerHTML = ''; }
}

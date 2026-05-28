// FailSafe Command Center — Sub-view pill switcher for tab consolidation
export class TabGroup {
  constructor(containerId, subViews) {
    this.container = document.getElementById(containerId);
    this.subViews = subViews;
    this.activeKey = subViews[0]?.key || '';
    this.contentEl = null;
  }

  render(hubData) {
    if (!this.container) return;
    this.container.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'cc-subview-bar';
    bar.style.cssText = 'display:flex;gap:4px;margin-bottom:12px;border-bottom:1px solid var(--border-rim);padding-bottom:8px';
    for (const sv of this.subViews) {
      const pill = document.createElement('button');
      pill.className = `cc-pill${sv.key === this.activeKey ? ' active' : ''}`;
      pill.textContent = sv.label;
      pill.dataset.key = sv.key;
      pill.addEventListener('click', () => this.switchTo(sv.key, hubData));
      bar.appendChild(pill);
    }
    this.container.appendChild(bar);
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'cc-subview-content';
    this.container.appendChild(this.contentEl);
    this.renderActive(hubData);
  }

  renderRightPanel() {
    const sv = this.subViews.find(s => s.key === this.activeKey);
    if (!sv?.renderer.renderRightPanel) return null;
    return sv.renderer.renderRightPanel();
  }

  bindToolbar() {
    const sv = this.subViews.find(s => s.key === this.activeKey);
    sv?.renderer.bindToolbar?.();
  }

  switchTo(key, hubData) {
    // B198 Phase 3 (RD-3): tear down the OUTGOING sub-view's renderer before
    // rendering the incoming one so its listeners / modal nodes do not leak
    // across navigation. Optional-chained — sub-views without destroy() are
    // unaffected; switching to the same key is a no-op teardown-wise.
    if (key !== this.activeKey) {
      const outgoing = this.subViews.find(s => s.key === this.activeKey);
      outgoing?.renderer.destroy?.();
    }
    this.activeKey = key;
    this.container.querySelector('.cc-subview-bar')?.querySelectorAll('.cc-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.key === key);
    });
    this.renderActive(hubData);
    this.onSubViewSwitch?.();
  }

  renderActive(hubData) {
    const sv = this.subViews.find(s => s.key === this.activeKey);
    if (!sv || !this.contentEl) return;
    // B-INT-5 regression guard: onEvent() fans to every sub-view, but only the
    // active one owns the shared contentEl. Tag each renderer with its mounted
    // state so an event-driven re-render of an INACTIVE sub-view can no-op
    // instead of clobbering the live pane (e.g. an autonomous bicameral.connected
    // broadcast arriving while another sub-tab is showing). Additive flag —
    // renderers that don't read it are unaffected.
    for (const other of this.subViews) other.renderer._tgMounted = other === sv;
    sv.renderer.container = this.contentEl;
    sv.renderer.render(hubData);
  }

  onEvent(evt) {
    for (const sv of this.subViews) sv.renderer.onEvent?.(evt);
  }

  destroy() {
    for (const sv of this.subViews) sv.renderer.destroy?.();
    if (this.container) this.container.innerHTML = '';
  }
}

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
    // B-INT-5 / B-INT-12: onEvent() fans to EVERY sub-view, but only the active
    // one owns the shared contentEl. Two coordinated guards keep an inactive
    // sub-view's event-driven render from clobbering the live pane:
    //   - `_tgMounted` flag (B-INT-5): the opt-in early-return BicameralRenderer reads.
    //   - detached scratch container (B-INT-12): every INACTIVE sub-view renders
    //     into its own persistent off-DOM `<div>`, so any sub-view whose onEvent
    //     calls render() writes harmlessly off-screen and is reconstructed into
    //     the live contentEl on re-activation. No per-renderer change required.
    for (const other of this.subViews) {
      const isActive = other === sv;
      other.renderer._tgMounted = isActive;
      if (isActive) {
        other.renderer.container = this.contentEl;
      } else {
        if (!other.renderer._tgDetached) other.renderer._tgDetached = document.createElement('div');
        other.renderer.container = other.renderer._tgDetached;
      }
    }
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

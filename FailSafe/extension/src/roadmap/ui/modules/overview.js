// FailSafe Unified Command Center — Overview Tab Module

import { renderLatestAudit } from './latest-audit.js';
import { renderRecentReleases } from './recent-releases.js';
import { navigationHash } from './command-center-deeplink.js';

function esc(value) {
  const d = document.createElement('div');
  d.textContent = String(value ?? '');
  return d.innerHTML;
}

export class OverviewRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(hubData) {
    this.lastHubData = hubData;
    if (!this.container || !hubData) return;
    const { sentinelStatus, runState, recentCheckpoints: checkpoints } = hubData;
    const isLive = sentinelStatus?.running;


    const hasChainSignal = hubData?.chainValid === true || hubData?.chainValid === false;
    const chainLabel = hubData?.chainValid === true ? 'VALID' : (hubData?.chainValid === false ? 'BROKEN' : 'READY');
    const chainColor = hubData?.chainValid === true
      ? 'var(--accent-green)'
      : (hubData?.chainValid === false ? 'var(--accent-red)' : 'var(--accent-cyan)');

    const health = hubData.agentHealth;
    const healthLevel = health?.level || 'healthy';
    const levelColors = {
      healthy: 'var(--accent-green)',
      elevated: 'var(--accent-gold)',
      warning: 'var(--accent-orange)',
      critical: 'var(--accent-red)',
    };
    const healthColor = levelColors[healthLevel] || 'var(--text-muted)';

    let html = `
      <div class="overview-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">

        <div class="card" style="background: var(--bg-panel); border: 1px solid var(--border-rim); border-radius: 12px; padding: 16px;">
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Sentinel Events</div>
          <div style="font-size: 1.8rem; font-weight: 700; color: var(--text-main); font-family: var(--font-display); margin-top: 8px;">
            ${sentinelStatus?.eventsProcessed || 0}
          </div>
        </div>

        <div class="card clickable-card" data-nav="governance:risks?severity=high" style="background: var(--bg-panel); border: 1px solid var(--border-rim); border-radius: 12px; padding: 16px; cursor: pointer; transition: border-color 0.15s, transform 0.1s;" title="View Active Threats">
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Active Threats</div>
          <div style="font-size: 1.8rem; font-weight: 700; color: ${hubData?.riskSummary?.high > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}; font-family: var(--font-display); margin-top: 8px;">
            ${hubData?.riskSummary?.high || 0}
          </div>
        </div>

        <div class="card clickable-card" data-nav="governance:compliance?section=l3-chain" style="background: var(--bg-panel); border: 1px solid var(--border-rim); border-radius: 12px; padding: 16px; cursor: pointer; transition: border-color 0.15s, transform 0.1s;" title="View Chain Integrity">
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">L3 Chain</div>
          <div style="font-size: 1.8rem; font-weight: 700; color: ${chainColor}; font-family: var(--font-display); margin-top: 8px;">
            ${chainLabel}
          </div>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">${hasChainSignal ? 'Verification state' : 'No chain verdict yet'}</div>
        </div>

        <div class="card" style="background: var(--bg-panel); border: 1px solid var(--border-rim); border-radius: 12px; padding: 16px;">
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Agent Health</div>
          <div style="font-size: 1.8rem; font-weight: 700; color: ${healthColor}; font-family: var(--font-display); margin-top: 8px;">
            ${healthLevel.charAt(0).toUpperCase() + healthLevel.slice(1)}
          </div>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">${health ? `${health.openCritical || 0} critical, ${health.openHigh || 0} high` : 'No health data'}</div>
        </div>
      </div>

      ${this.renderVerdictAlert(hubData)}

      <div class="split-grid" style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;">

        <div class="card panel-section" style="background: var(--bg-panel); border: 1px solid var(--border-rim); border-radius: 12px; padding: 20px;">
          <h3 style="margin: 0 0 16px 0; font-family: var(--font-display); font-size: 1rem; color: var(--text-main);">Recent Operations Stream</h3>
          ${this.renderOperationalStream(checkpoints)}
        </div>

        <div class="card panel-section" style="display: flex; flex-direction: column; gap: 16px;">
          <div style="background: var(--bg-panel); border: 1px solid var(--border-rim); border-radius: 12px; padding: 20px; flex: 1;">
            <h3 style="margin: 0 0 16px 0; font-family: var(--font-display); font-size: 1rem; color: var(--text-main);">Network Activity</h3>
            ${this.renderActivityLive(hubData)}
          </div>
        </div>

      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
        <div id="cc-latest-audit-slot">${renderLatestAudit(hubData.latestAudit)}</div>
        <div id="cc-recent-releases-slot">${renderRecentReleases(hubData.recentReleases)}</div>
      </div>
    `;

    this.container.innerHTML = html;
    this.bindClickableCards();
  }

  bindClickableCards() {
    const cards = this.container.querySelectorAll('.clickable-card[data-nav]');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const nav = card.dataset.nav;
        if (!nav) return;
        const [target] = nav.split('?');
        const [tab, subTab] = target.split(':');
        const nextHash = navigationHash(nav);
        window.location.hash = nextHash;
        const tabBtn = document.querySelector(`.tab-btn[data-target="${tab}"]`);
        if (tabBtn) tabBtn.click();
        setTimeout(() => {
          const subTabBtn = document.querySelector(`#${tab} .cc-pill[data-key="${subTab}"]`);
          if (subTabBtn) subTabBtn.click();
        }, 0);
      });
      // Hover effects
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'var(--primary)';
        card.style.transform = 'translateY(-1px)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = '';
        card.style.transform = '';
      });
    });
  }

  renderOperationalStream(checkpoints) {
    if (!checkpoints || Object.keys(checkpoints).length === 0) {
      return `
        <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:180px;
          border:1px dashed var(--border-rim);border-radius:10px;background:rgba(255,255,255,0.02);padding:18px">
          <div style="font-size:0.95rem;font-weight:600;color:var(--text-main);margin-bottom:6px">Ready to plan and run</div>
          <div style="font-size:0.82rem;color:var(--text-muted);text-align:center;max-width:360px">
            Monitoring is active and stable. Kick off your first plan step to populate the operations stream.
          </div>
        </div>`;
    }

    const items = Object.values(checkpoints)
      .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 8); // Show only top 8

    let html = `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    for (const c of items) {
      const verdictColors = { VIOLATION: 'var(--accent-red)', WARN: 'var(--accent-gold)' };
      const color = verdictColors[c.policyVerdict] || 'var(--accent-green)';
      
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(0,0,0,0.15); border-left: 3px solid ${color}; border-radius: 4px;">
          <div>
            <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">${esc(c.checkpointType)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Phase: ${esc(c.phase || 'N/A')}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--text-muted);">${esc(new Date(c.timestamp).toLocaleTimeString())}</div>
            <div style="font-size: 0.7rem; color: ${color}; font-weight: 700; margin-top: 2px;">${esc(c.policyVerdict)}</div>
          </div>
        </div>
      `;
    }
    html += `</div>`;
    return html;
  }

  renderActivityLive(hubData) {
    const evts = hubData?.sentinelStatus?.eventsProcessed || 0;
    const qd = hubData?.sentinelStatus?.queueDepth || 0;
    const l3 = hubData?.l3Queue?.length || 0;
    const evtPct = Math.min(evts, 100);
    const qdPct = Math.min(qd * 10, 100);
    return `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:0.8rem;color:var(--text-muted)">
        <span>Events Processed</span> <span>${evts}</span>
      </div>
      <div style="height:6px;background:rgba(0,0,0,0.3);border-radius:3px;overflow:hidden;margin-bottom:16px">
        <div style="height:100%;width:${evtPct}%;background:var(--primary)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:0.8rem;color:var(--text-muted)">
        <span>Queue Depth</span> <span>${qd}</span>
      </div>
      <div style="height:6px;background:rgba(0,0,0,0.3);border-radius:3px;overflow:hidden;margin-bottom:16px">
        <div style="height:100%;width:${qdPct}%;background:var(--accent-cyan)"></div>
      </div>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">
        L3 Queue: ${l3} pending
      </div>
    `;
  }

  renderVerdictAlert(hubData) {
    const verdicts = hubData?.recentVerdicts || [];
    const critical = verdicts.filter(
      (v) => ['BLOCK', 'ESCALATE', 'QUARANTINE'].includes(v.decision),
    );
    if (critical.length === 0) return '';
    const latest = critical[critical.length - 1];
    return `
      <div class="clickable-card" data-nav="governance:audit?verdict=${encodeURIComponent(String(latest.timestamp || ''))}" style="background:rgba(255,60,60,0.12);border:1px solid var(--accent-red);
        border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:background 0.15s,transform 0.1s" title="View in Audit Log">
        <span style="font-size:1.2rem">!</span>
        <div style="flex:1">
          <div style="font-weight:700;color:var(--accent-red);font-size:0.9rem">
            ${esc(latest.decision)}: ${critical.length} critical verdict(s)
          </div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">
            Latest: ${esc(latest.riskGrade)} risk at ${esc(new Date(latest.timestamp).toLocaleTimeString())}
          </div>
        </div>
        <span style="font-size:0.75rem;color:var(--text-muted);opacity:0.7">View →</span>
      </div>`;
  }

  renderRightPanel() {
    if (!this.lastHubData) return '';
    const { trustSummary, sentinelStatus } = this.lastHubData;
    
    return `
      <div class="cc-overview-side cc-card" style="padding: 16px;">
        <h3 style="margin: 0 0 16px 0; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">Intelligence Hub</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 2px solid var(--accent-cyan);">
            <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Session Throughput</div>
            <div style="font-size: 14px; font-weight: bold; color: var(--text-main); font-family: var(--font-mono);">${sentinelStatus?.eventsProcessed || 0} events</div>
          </div>
          <div style="margin-top: 12px; font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); opacity: 0.5;">
            SYSTEM_UPTIME: 142ms <br>
            REGISTRY: ACTIVE
          </div>
        </div>
      </div>
    `;
  }
}

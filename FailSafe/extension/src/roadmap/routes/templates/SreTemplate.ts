import { escapeHtml } from "../../../shared/utils/htmlSanitizer";
import type { AgtSreSnapshot, AsiControl, SreViewModel } from "./SreTypes";

export type { AsiControl, AgtSreSnapshot, SreViewModel } from "./SreTypes";

export async function fetchAgtSnapshot(baseUrl: string): Promise<SreViewModel> {
  try {
    const resp = await fetch(`${baseUrl}/sre/snapshot`);
    if (!resp.ok) { throw new Error(`adapter ${resp.status}`); }
    return { connected: true, snapshot: await resp.json() as AgtSreSnapshot };
  } catch {
    return { connected: false, snapshot: null };
  }
}

function thresholdColor(pct: number): string {
  if (pct >= 80) return "#3dd68c";
  if (pct >= 50) return "#f0b840";
  return "#f06868";
}

const SRE_STYLES = `
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;
  background:#071539;color:#e4ecff;font-size:12px;line-height:1.4;overflow-y:auto;}
.sre-panel{padding:10px 12px;display:flex;flex-direction:column;gap:12px;}
.sre-header{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
  color:#7ba3f0;border-bottom:1px solid rgba(95,150,255,0.25);padding-bottom:4px;}
.sre-section{display:flex;flex-direction:column;gap:4px;}
.sre-card{background:rgba(15,35,85,0.7);border:1px solid rgba(95,150,255,0.2);
  border-radius:6px;padding:8px 10px;}
.sre-row{display:flex;justify-content:space-between;align-items:center;padding:3px 0;
  border-bottom:1px solid rgba(95,150,255,0.08);}
.sre-row:last-child{border-bottom:none;}
.sre-label{color:#a0b8e8;font-size:11px;}
.sre-value{font-size:11px;font-weight:600;}
.on{color:#3dd68c;}.off{color:#f06868;}
.warn{color:#f0b840;}
.sre-badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;}
.sre-badge.on{background:rgba(61,214,140,0.15);color:#3dd68c;}
.sre-badge.off{background:rgba(240,104,104,0.15);color:#f06868;}
.sre-meter{height:4px;background:rgba(95,150,255,0.15);border-radius:2px;overflow:hidden;margin-top:2px;}
.sre-meter-fill{height:100%;border-radius:2px;transition:width 0.3s;}
.sre-empty{color:#6b82b0;font-style:italic;font-size:11px;padding:6px 0;}
.sre-setup{padding:12px;text-align:center;}
.sre-setup p{margin:6px 0;color:#a0b8e8;}
.sre-setup code{background:rgba(95,150,255,0.12);padding:3px 8px;border-radius:4px;
  font-size:11px;color:#7ba3f0;word-break:break-all;}
.sre-setup strong{color:#f0b840;}
.sre-footer{margin-top:4px;padding-top:8px;border-top:1px solid rgba(95,150,255,0.15);
  font-size:10px;color:#6b82b0;text-align:center;line-height:1.5;}
.sre-footer a{color:#7ba3f0;text-decoration:none;}
.sre-footer a:hover{text-decoration:underline;}
.sre-footer .sep{margin:0 6px;color:#3a4f7a;}
`;

const SRE_FOOTER_HTML = `<div class="sre-footer">
  Supports the <a href="https://github.com/microsoft/agent-governance-toolkit" target="_blank" rel="noopener">Microsoft Agent Governance Toolkit</a>
  <span class="sep">&middot;</span>
  <a href="https://www.qortara.com" target="_blank" rel="noopener">qortara.com</a>
</div>`;

function buildSreDisconnectedHtml(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SRE Tracker</title><style>${SRE_STYLES}</style></head><body>
<div class="sre-panel">
  <div class="sre-header">SRE Tracker</div>
  <div class="sre-card sre-setup">
    <p><strong>AGT Adapter not connected</strong></p>
    <p style="font-size:11px">This panel surfaces telemetry from the
      <a href="https://github.com/microsoft/agent-governance-toolkit" target="_blank" rel="noopener" style="color:#7ba3f0">Microsoft Agent Governance Toolkit</a>
      via the FailSafe adapter.</p>
    <p>Start the adapter to enable governance telemetry:</p>
    <p><code>pip install "agent-failsafe[server]"</code></p>
    <p><code>python -m agent_failsafe.rest_server</code></p>
    <p style="margin-top:8px;font-size:11px;color:#6b82b0">Then reload this panel.</p>
  </div>
  ${SRE_FOOTER_HTML}
</div></body></html>`;
}

function buildPoliciesHtml(policies: AgtSreSnapshot["policies"]): string {
  const items = policies.length > 0
    ? policies.map(p =>
        `<div class="sre-row">
          <span class="sre-label">${escapeHtml(p.name)} <span style="color:#6b82b0">(${escapeHtml(p.type)})</span></span>
          <span class="sre-badge ${p.enforced ? "on" : "off"}">${p.enforced ? "Enforced" : "Inactive"}</span>
        </div>`).join("")
    : `<div class="sre-empty">No policies loaded</div>`;
  return `<div class="sre-section">
    <div class="sre-header">Active Policies</div>
    <div class="sre-card">${items}</div>
  </div>`;
}

function buildTrustHtml(scores: AgtSreSnapshot["trustScores"]): string {
  const items = scores.length > 0
    ? scores.map(t => {
        const pct = Math.round(t.meshScore * 100);
        const color = thresholdColor(pct);
        return `<div class="sre-row">
          <span class="sre-label">${escapeHtml(t.agentId)} <span style="color:#6b82b0">${escapeHtml(t.stage)}</span></span>
          <span class="sre-value" style="color:${color}">${pct}%</span>
        </div>
        <div class="sre-meter"><div class="sre-meter-fill" style="width:${pct}%;background:${color}"></div></div>`;
      }).join("")
    : `<div class="sre-empty">No agents reporting</div>`;
  return `<div class="sre-section">
    <div class="sre-header">Agent Trust Scores</div>
    <div class="sre-card">${items}</div>
  </div>`;
}

function buildSliHtml(sli: AgtSreSnapshot["sli"]): string {
  const sliPct = sli.currentValue !== null ? (sli.currentValue * 100).toFixed(1) : null;
  const targetPct = (sli.target * 100).toFixed(0);
  let sliColor = "#6b82b0";
  let sliLabel = "No data";
  if (sli.meetingTarget === true) { sliColor = "#3dd68c"; sliLabel = "Meeting target"; }
  else if (sli.meetingTarget === false) { sliColor = "#f06868"; sliLabel = "Below target"; }
  return `<div class="sre-section">
    <div class="sre-header">Compliance SLI</div>
    <div class="sre-card">
      <div class="sre-row">
        <span class="sre-label">Rate</span>
        <span class="sre-value" style="color:${sliColor}">${sliPct !== null ? sliPct + "%" : "&mdash;"}</span>
      </div>
      <div class="sre-meter"><div class="sre-meter-fill" style="width:${sliPct ?? 0}%;background:${sliColor}"></div></div>
      <div class="sre-row" style="margin-top:4px">
        <span class="sre-label">Target ${targetPct}% &middot; ${sli.totalDecisions} decisions</span>
        <span class="sre-value" style="color:${sliColor};font-size:10px">${sliLabel}</span>
      </div>
    </div>
  </div>`;
}

function buildAsiHtml(coverage: Record<string, AsiControl>): string {
  const entries = Object.entries(coverage);
  const coveredCount = entries.filter(([, c]) => c.covered).length;
  const total = entries.length;
  const pct = total > 0 ? Math.round((coveredCount / total) * 100) : 0;
  const color = thresholdColor(pct);
  const items = entries.map(([id, c]) =>
    `<div class="sre-row">
      <span class="sre-label">${escapeHtml(id)}: ${escapeHtml(c.label)}</span>
      <span class="sre-badge ${c.covered ? "on" : "off"}">${c.covered ? "\u2713" : "\u2013"}</span>
    </div>`).join("");
  return `<div class="sre-section">
    <div class="sre-header">OWASP ASI Coverage <span style="float:right;color:${color};font-weight:600">${coveredCount}/${total} (${pct}%)</span></div>
    <div class="sre-card">${items}</div>
  </div>`;
}

function buildAuditFeedHtml(events: AgtSreSnapshot["auditEvents"]): string {
  if (!events || events.length === 0) return "";
  const actionColor: Record<string, string> = { ALLOW: "on", DENY: "off", AUDIT: "warn" };
  const rows = events.slice(0, 20).map(e => {
    const badge = actionColor[e.action] || "warn";
    const reason = e.reason && e.reason.length > 80 ? e.reason.slice(0, 77) + "..." : (e.reason || "");
    return `<div class="sre-row">
      <span class="sre-label">${escapeHtml(e.agentId)} <span style="color:#6b82b0">${escapeHtml(e.type)}</span></span>
      <span class="sre-badge ${badge}">${escapeHtml(e.action)}</span>
    </div>${reason ? `<div style="font-size:10px;color:#6b82b0;padding:0 0 2px">${escapeHtml(reason)}</div>` : ""}`;
  }).join("");
  return `<div class="sre-section">
    <div class="sre-header">Activity Feed</div>
    <div class="sre-card" style="max-height:200px;overflow-y:auto">${rows}</div>
  </div>`;
}

function buildSliDashboardHtml(slis: AgtSreSnapshot["slis"]): string {
  if (!slis || slis.length === 0) return "";
  const items = slis.map(s => {
    const pct = s.currentValue !== null ? (s.currentValue * 100).toFixed(1) : null;
    const color = thresholdColor(Number(pct ?? 0));
    const budgetPct = s.errorBudgetRemaining != null ? Math.round(s.errorBudgetRemaining * 100) : null;
    const budgetColor = budgetPct != null && budgetPct < 10 ? "#f06868" : "#3dd68c";
    return `<div style="flex:1;min-width:120px">
      <div style="font-size:10px;color:#a0b8e8;margin-bottom:2px">${escapeHtml(s.name)}</div>
      <div class="sre-value" style="color:${color}">${pct !== null ? pct + "%" : "&mdash;"}</div>
      <div class="sre-meter"><div class="sre-meter-fill" style="width:${pct ?? 0}%;background:${color}"></div></div>
      ${budgetPct !== null ? `<div style="font-size:9px;color:${budgetColor};margin-top:2px">Budget: ${budgetPct}%</div>` : ""}
    </div>`;
  }).join("");
  return `<div class="sre-section">
    <div class="sre-header">SLO Dashboard</div>
    <div class="sre-card" style="display:flex;flex-wrap:wrap;gap:12px">${items}</div>
  </div>`;
}

function buildFleetHtml(fleet: AgtSreSnapshot["fleet"]): string {
  if (!fleet || fleet.length === 0) return "";
  const statusColor: Record<string, string> = { active: "#3dd68c", idle: "#6b82b0", error: "#f06868" };
  const circuitColor: Record<string, string> = { closed: "#3dd68c", open: "#f06868", "half-open": "#f0b840" };
  const cards = fleet.map(a => {
    const sc = statusColor[a.status] || "#6b82b0";
    const cc = circuitColor[a.circuitState] || "#6b82b0";
    return `<div style="flex:1;min-width:140px;padding:6px;border:1px solid rgba(95,150,255,0.15);border-radius:4px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;font-weight:600">${escapeHtml(a.agentId)}</span>
        <span style="width:6px;height:6px;border-radius:50%;background:${sc};display:inline-block" title="${a.status}"></span>
      </div>
      <div style="font-size:10px;color:#a0b8e8;margin-top:3px">
        <span class="sre-badge" style="background:${cc}20;color:${cc}">${escapeHtml(a.circuitState)}</span>
        ${a.taskCount} tasks &middot; ${Math.round(a.successRate * 100)}%
      </div>
    </div>`;
  }).join("");
  return `<div class="sre-section">
    <div class="sre-header">Fleet Health</div>
    <div class="sre-card" style="display:flex;flex-wrap:wrap;gap:8px">${cards}</div>
  </div>`;
}

function buildSreConnectedHtml(s: AgtSreSnapshot): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SRE Tracker</title><style>${SRE_STYLES}</style></head><body>
<div class="sre-panel">
  ${s.slis?.length ? buildSliDashboardHtml(s.slis) : buildSliHtml(s.sli)}
  ${buildPoliciesHtml(s.policies)}
  ${buildTrustHtml(s.trustScores)}
  ${buildAsiHtml(s.asiCoverage)}
  ${s.auditEvents?.length ? buildAuditFeedHtml(s.auditEvents) : ""}
  ${s.fleet?.length ? buildFleetHtml(s.fleet) : ""}
  ${SRE_FOOTER_HTML}
</div></body></html>`;
}

export function buildSreHtml(model: SreViewModel): string {
  if (!model.connected) { return buildSreDisconnectedHtml(); }
  return buildSreConnectedHtml(model.snapshot!);
}

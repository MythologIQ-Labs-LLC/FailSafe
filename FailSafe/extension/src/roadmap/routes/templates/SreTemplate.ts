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
  if (pct >= 80) return "var(--sre-good)";
  if (pct >= 50) return "var(--sre-warn)";
  return "var(--sre-bad)";
}

// #601: the shared app theme (applied before first paint), its tokens, and live updates.
const SRE_THEME_HEAD = `<script src="/api/v1/ui/theme.js"></script><link rel="stylesheet" href="/theme-tokens.css">
<script type="module">import { followThemeStandalone } from "/modules/theme-sync.js"; followThemeStandalone();</script>`;

const SRE_STYLES = `
:root{
  /* #601: status/accent colors mixed toward the theme's text color: same hue and meaning,
     readable on light (Pegasus) and dark themes alike. */
  --sre-good:color-mix(in srgb,var(--accent-green) 55%,var(--text-main));
  --sre-warn:color-mix(in srgb,var(--accent-gold) 55%,var(--text-main));
  --sre-bad:color-mix(in srgb,var(--accent-red) 55%,var(--text-main));
  --sre-accent:color-mix(in srgb,var(--accent-cyan) 55%,var(--text-main));
}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;
  background:var(--bg-dark);color:var(--text-main);font-size:12px;line-height:1.4;overflow-y:auto;}
.sre-panel{padding:10px 12px;display:flex;flex-direction:column;gap:12px;}
.sre-header{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
  color:var(--sre-accent);border-bottom:1px solid var(--glass-border);padding-bottom:4px;}
.sre-section{display:flex;flex-direction:column;gap:4px;}
.sre-card{background:var(--glass-bg);border:1px solid var(--glass-border);
  border-radius:6px;padding:8px 10px;}
.sre-row{display:flex;justify-content:space-between;align-items:center;padding:3px 0;
  border-bottom:1px solid var(--border-rim);}
.sre-row:last-child{border-bottom:none;}
.sre-label{color:var(--text-muted);font-size:11px;}
.sre-value{font-size:11px;font-weight:600;}
.on{color:var(--sre-good);}.off{color:var(--sre-bad);}
.warn{color:var(--sre-warn);}
.sre-badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;}
.sre-badge.on{background:color-mix(in srgb,var(--sre-good) 15%,transparent);color:var(--sre-good);}
.sre-badge.off{background:color-mix(in srgb,var(--sre-bad) 15%,transparent);color:var(--sre-bad);}
.sre-meter{height:4px;background:color-mix(in srgb,var(--primary) 15%,transparent);border-radius:2px;overflow:hidden;margin-top:2px;}
.sre-meter-fill{height:100%;border-radius:2px;transition:width 0.3s;}
.sre-empty{color:var(--text-muted);font-style:italic;font-size:11px;padding:6px 0;}
.sre-setup{padding:12px;text-align:center;}
.sre-setup p{margin:6px 0;color:var(--text-muted);}
.sre-setup code{background:color-mix(in srgb,var(--primary) 12%,transparent);padding:3px 8px;border-radius:4px;
  font-size:11px;color:var(--sre-accent);word-break:break-all;}
.sre-setup strong{color:var(--sre-warn);}
.sre-footer{margin-top:4px;padding-top:8px;border-top:1px solid color-mix(in srgb,var(--primary) 15%,transparent);
  font-size:10px;color:var(--text-muted);text-align:center;line-height:1.5;}
.sre-footer a{color:var(--sre-accent);text-decoration:none;}
.sre-footer a:hover{text-decoration:underline;}
.sre-footer .sep{margin:0 6px;color:var(--border-rim);}
`;

const SRE_FOOTER_HTML = `<div class="sre-footer">
  Supports the <a href="https://github.com/microsoft/agent-governance-toolkit" target="_blank" rel="noopener">Microsoft Agent Governance Toolkit</a>
  <span class="sep">&middot;</span>
  <a href="https://www.qortara.com" target="_blank" rel="noopener">qortara.com</a>
</div>`;

function buildSreDisconnectedHtml(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SRE Tracker</title>${SRE_THEME_HEAD}<style>${SRE_STYLES}</style></head><body>
<div class="sre-panel">
  <div class="sre-header">SRE Tracker</div>
  <div class="sre-card sre-setup">
    <p><strong>AGT Adapter not connected</strong></p>
    <p style="font-size:11px">This panel surfaces telemetry from the
      <a href="https://github.com/microsoft/agent-governance-toolkit" target="_blank" rel="noopener" style="color:var(--sre-accent)">Microsoft Agent Governance Toolkit</a>
      via the FailSafe adapter.</p>
    <p>Start the adapter to enable governance telemetry:</p>
    <p><code>pip install "agent-failsafe[server]"</code></p>
    <p><code>python -m agent_failsafe.rest_server</code></p>
    <p style="margin-top:8px;font-size:11px;color:var(--text-muted)">Then reload this panel.</p>
  </div>
  ${SRE_FOOTER_HTML}
</div></body></html>`;
}

function buildPoliciesHtml(policies: AgtSreSnapshot["policies"]): string {
  const items = policies.length > 0
    ? policies.map(p =>
        `<div class="sre-row">
          <span class="sre-label">${escapeHtml(p.name)} <span style="color:var(--text-muted)">(${escapeHtml(p.type)})</span></span>
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
          <span class="sre-label">${escapeHtml(t.agentId)} <span style="color:var(--text-muted)">${escapeHtml(t.stage)}</span></span>
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
  let sliColor = "var(--text-muted)";
  let sliLabel = "No data";
  if (sli.meetingTarget === true) { sliColor = "var(--sre-good)"; sliLabel = "Meeting target"; }
  else if (sli.meetingTarget === false) { sliColor = "var(--sre-bad)"; sliLabel = "Below target"; }
  return `<div class="sre-section">
    <div class="sre-header">Compliance SLI</div>
    <div class="sre-card">
      <div class="sre-row">
        <span class="sre-label">Rate</span>
        <span class="sre-value" style="color:${sliColor}">${sliPct !== null ? sliPct + "%" : "&mdash;"}</span>
      </div>
      <div class="sre-meter"><div class="sre-meter-fill" style="width:${sliPct ?? 0}%;background:${sliColor}"></div></div>
      <div class="sre-row" style="margin-top:4px">
        <span class="sre-label">Target ${targetPct}% &middot; ${Number(sli.totalDecisions)} decisions</span>
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
      <span class="sre-label">${escapeHtml(e.agentId)} <span style="color:var(--text-muted)">${escapeHtml(e.type)}</span></span>
      <span class="sre-badge ${badge}">${escapeHtml(e.action)}</span>
    </div>${reason ? `<div style="font-size:10px;color:var(--text-muted);padding:0 0 2px">${escapeHtml(reason)}</div>` : ""}`;
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
    const budgetColor = budgetPct != null && budgetPct < 10 ? "var(--sre-bad)" : "var(--sre-good)";
    return `<div style="flex:1;min-width:120px">
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px">${escapeHtml(s.name)}</div>
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
  const statusColor: Record<string, string> = { active: "var(--sre-good)", idle: "var(--text-muted)", error: "var(--sre-bad)" };
  const circuitColor: Record<string, string> = { closed: "var(--sre-good)", open: "var(--sre-bad)", "half-open": "var(--sre-warn)" };
  const cards = fleet.map(a => {
    const sc = statusColor[a.status] || "var(--text-muted)";
    const cc = circuitColor[a.circuitState] || "var(--text-muted)";
    return `<div style="flex:1;min-width:140px;padding:6px;border:1px solid color-mix(in srgb,var(--primary) 15%,transparent);border-radius:4px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;font-weight:600">${escapeHtml(a.agentId)}</span>
        <span style="width:6px;height:6px;border-radius:50%;background:${sc};display:inline-block" title="${escapeHtml(a.status)}"></span>
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
        <span class="sre-badge" style="background:${cc}20;color:${cc}">${escapeHtml(a.circuitState)}</span>
        ${Number(a.taskCount)} tasks &middot; ${Math.round(a.successRate * 100)}%
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
<title>SRE Tracker</title>${SRE_THEME_HEAD}<style>${SRE_STYLES}</style></head><body>
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

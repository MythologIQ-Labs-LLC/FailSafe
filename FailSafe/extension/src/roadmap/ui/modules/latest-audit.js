// FailSafe Command Center — Latest Audit Card
// Renders the verdict + target + risk grade from the latest /qor-audit run.
// Pure render function: no event handlers, no async work.

const VERDICT_COLORS = {
  PASS: 'var(--accent-teal, #2dd4bf)',
  VETO: 'var(--accent-red, #ef4444)',
};

function esc(str) {
  if (str === null || str === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

export function renderLatestAudit(audit) {
  if (!audit || !audit.verdict) {
    return `
      <div class="cc-card" style="padding:12px 16px">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:6px">Latest Audit</div>
        <div style="font-size:0.85rem;color:var(--text-muted)">
          No audit on record. Run <code>/qor-audit</code> to gate the next plan.
        </div>
      </div>`;
  }
  const color = VERDICT_COLORS[audit.verdict] || 'var(--text-main)';
  const obs = audit.observationCount || 0;
  return `
    <div class="cc-card" style="padding:12px 16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em">Latest Audit</div>
        <div style="font-size:0.7rem;color:${color};font-weight:700;letter-spacing:0.08em">
          ${esc(audit.verdict)}
        </div>
      </div>
      <div style="font-size:0.9rem;font-weight:600;color:var(--text-main);margin-bottom:4px">
        ${esc(audit.target || 'Untargeted')}
      </div>
      <div style="font-size:0.75rem;color:var(--text-muted)">
        Risk ${esc(audit.riskGrade || '?')} ·
        ${esc(String(obs))} observation${obs === 1 ? '' : 's'} ·
        ${esc(audit.tribunalDate || '')}
      </div>
    </div>`;
}

// FailSafe Command Center — Metric Integrity & Unattributed Activity Cards

import { sentinelModeValue } from './sentinel-mode.js';

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export function renderIntegrityCard(integrity) {
  if (!integrity.length) return '';
  const tone = {
    authoritative: 'var(--accent-green)',
    inferred: 'var(--accent-gold)',
    unknown: 'var(--text-muted)',
  };
  const rows = integrity.map((item) => `
    <div style="padding:6px 0;border-bottom:1px solid var(--border-rim);font-size:0.8rem">
      <div style="display:flex;justify-content:space-between;gap:10px">
        <span>${esc(item.label)}</span>
        <span style="color:${tone[item.status] || tone.unknown};text-transform:uppercase">${esc(item.status)}</span>
      </div>
      <div style="margin-top:3px;color:var(--text-muted);font-size:0.72rem">${esc(item.basis)}</div>
    </div>`).join('');
  return `
    <div class="cc-card" style="margin-bottom:16px">
      <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
        letter-spacing:0.08em;margin-bottom:8px">Metric Integrity</div>
      <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px">
        Free build uses a mix of verified governance evidence and inferred IDE activity.
      </div>
      ${rows}
    </div>`;
}

export function renderUnattributedCard(unattributed) {
  if (!unattributed?.count) return '';
  const rows = (unattributed.recent || []).slice(0, 5).map((item) => `
    <div style="padding:6px 0;border-bottom:1px solid var(--border-rim);font-size:0.78rem">
      <div style="display:flex;justify-content:space-between;gap:10px">
        <span>${esc(item.type || 'FILE_MODIFIED')}</span>
        <span style="color:var(--accent-gold)">${esc(item.decision || 'observed')}</span>
      </div>
      <div style="margin-top:3px;color:var(--text-muted);font-size:0.72rem">
        ${esc(item.artifactPath || 'unknown path')}
      </div>
    </div>`).join('');
  return `
    <div class="cc-card" style="margin-bottom:16px">
      <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
        letter-spacing:0.08em;margin-bottom:8px">Unattributed File Activity</div>
      <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px">
        Sentinel observed ${esc(String(unattributed.count))} recent workspace mutations without governed actor proof.
      </div>
      ${rows}
    </div>`;
}

export function derivePolicies(hubData) {
  const explicit = hubData.activePolicies || hubData.policies || [];
  if (explicit.length) return explicit;

  const derived = [];
  const sentinel = hubData.sentinelStatus || {};
  const gov = hubData.governancePhase || {};

  // B-EM-1: this row reflects the Sentinel-evaluator mode (sentinel.mode),
  // not the governance mode — the prior "Governance Mode:" label was a name
  // collision. Fallback corrected to a valid SentinelMode via sentinelModeValue.
  const mode = sentinelModeValue(sentinel.mode);
  derived.push({ name: `Sentinel Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`, id: 'sentinel-mode' });

  if (gov.current && gov.current !== 'IDLE') {
    derived.push({ name: `S.H.I.E.L.D. Phase: ${gov.current}`, id: 'shield-phase' });
  }

  if (gov.activeAlerts?.length > 0) {
    for (const a of gov.activeAlerts) {
      derived.push({ name: a.message, id: a.id });
    }
  }

  if (gov.nextSteps?.length > 0) {
    derived.push({ name: `Next: ${gov.nextSteps[0]}`, id: 'next-step' });
  }

  return derived;
}

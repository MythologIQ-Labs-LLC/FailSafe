// FailSafe Command Center — Recent Releases Card
// Renders the last N CHANGELOG entries (default 5).
// Pure render function: no event handlers, no async work.

function esc(str) {
  if (str === null || str === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

export function renderRecentReleases(releases) {
  const list = Array.isArray(releases) ? releases : [];
  if (list.length === 0) {
    return `
      <div class="cc-card" style="padding:12px 16px">
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
          letter-spacing:0.08em;margin-bottom:6px">Recent Releases</div>
        <div style="font-size:0.85rem;color:var(--text-muted)">
          No release entries found in CHANGELOG.
        </div>
      </div>`;
  }
  const rows = list.map(renderRow).join('');
  return `
    <div class="cc-card" style="padding:12px 16px">
      <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
        letter-spacing:0.08em;margin-bottom:8px">Recent Releases</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${rows}
      </div>
    </div>`;
}

function renderRow(release) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;
      padding-bottom:6px;border-bottom:1px solid var(--border-rim, rgba(255,255,255,0.06))">
      <div style="flex:1">
        <div style="font-size:0.85rem;font-weight:600;color:var(--text-main)">
          v${esc(release.version)}
          <span style="font-size:0.7rem;color:var(--text-muted);font-weight:400;margin-left:6px">
            ${esc(release.date || '')}
          </span>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">
          ${esc(release.sectionPreview || '')}
        </div>
      </div>
    </div>`;
}

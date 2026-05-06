// FailSafe Command Center — Settings Extras
// Notifications + Brainstorm sections for the Settings panel. Extracted from
// settings.js to keep that file under the 250-line cap (per v4.10.1a B127).

export function renderNotificationsCard(store) {
  const info = store?.get('notifications-info-toasts') !== 'false';
  const err = store?.get('notifications-error-toasts') !== 'false';
  return `
    <div class="cc-card" style="margin-top:16px">
      <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
        letter-spacing:0.08em;margin-bottom:8px">Notifications</div>
      <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer">
        <input type="checkbox" class="cc-settings-toast-info"${info ? ' checked' : ''} />
        <span style="font-size:0.85rem">Info toasts</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer">
        <input type="checkbox" class="cc-settings-toast-error"${err ? ' checked' : ''} />
        <span style="font-size:0.85rem">Error toasts</span>
      </label>
    </div>`;
}

export function renderBrainstormCard(store) {
  const max = Number(store?.get('brainstorm-history-max')) || 10;
  return `
    <div class="cc-card" style="margin-top:16px">
      <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;
        letter-spacing:0.08em;margin-bottom:8px">Brainstorm</div>
      <label style="display:flex;align-items:center;gap:8px;padding:4px 0">
        <span style="font-size:0.85rem;min-width:140px">History limit:</span>
        <input type="number" class="cc-settings-history-max" min="1" max="100" value="${max}"
          style="width:80px;padding:4px 8px;border-radius:6px;background:var(--bg-mid);
          border:1px solid var(--border-rim);color:var(--text-main);font-size:0.85rem" />
      </label>
    </div>`;
}

export function bindNotificationsCard(container, store) {
  const info = container?.querySelector('.cc-settings-toast-info');
  const err = container?.querySelector('.cc-settings-toast-error');
  info?.addEventListener('change', () => store?.set('notifications-info-toasts', String(info.checked)));
  err?.addEventListener('change', () => store?.set('notifications-error-toasts', String(err.checked)));
}

export function bindBrainstormCard(container, store) {
  const input = container?.querySelector('.cc-settings-history-max');
  input?.addEventListener('change', () => {
    const v = Math.max(1, Math.min(100, Number(input.value) || 10));
    store?.set('brainstorm-history-max', String(v));
  });
}

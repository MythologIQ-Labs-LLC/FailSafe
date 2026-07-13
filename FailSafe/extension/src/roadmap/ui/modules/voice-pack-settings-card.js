// Voice Pack Settings card — status display + Install/Update/Uninstall + error state.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 3.
// F1 remediation (audit cycle 1): four render states including error with Dismiss + Retry.

import { escapeHtml } from './brainstorm-templates.js';
import { buildVoiceDiagnostics } from './voice-capability-presenter.js';

const LBL = 'font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em';

const STATE_LABEL = {
  'absent':     'Not installed',
  'installed':  'Installed',
  'stale':      'Update available',
  'corrupt':    'Corrupt (needs reinstall)',
  'installing': 'Installing…',
};

function fmtBytes(bytes) {
  if (typeof bytes !== 'number' || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function renderVoicePackSettingsCard(slot, { bindOnce, diagnosticsDeps }) {
  if (!slot) return;
  let status;
  try {
    const res = await fetch('/api/integrations/voice-pack/status');
    if (!res.ok) { slot.remove(); return; }
    status = await res.json();
  } catch {
    slot.remove();
    return;
  }
  const renderer = new VoicePackCardRenderer(slot, bindOnce, status, diagnosticsDeps);
  renderer.renderInitial();
  // Expose for host-driven error injection (WS-broadcast install errors).
  slot._voicePackRenderer = renderer;
}

class VoicePackCardRenderer {
  constructor(slot, bindOnce, status, diagnosticsDeps) {
    this.slot = slot;
    this.bindOnce = bindOnce;
    this.status = status;
    this.priorState = null;
    this.errorEvent = null;
    this.installingEvent = null;
    this.diagnosticsDeps = diagnosticsDeps || null; // #237 LD6 injected deps
  }

  renderInitial() {
    this.render(this.status.state || 'absent');
  }

  /** Called by the host (settings.js onEvent) or tests with each install
   *  broadcast. Accepts a bare InstallProgressEvent or the WS envelope
   *  ({ type, invocation } — bootstrapServers.ts:326-328 / VoicePackRoute.ts:62-75).
   *  settings.js forwards ONLY .progress and .error envelopes (#237 A8
   *  narrow-forward) — .complete never reaches this method; the card's own
   *  status refetch on re-render owns the completed presentation. */
  onInstallProgress(evt) {
    const e = evt?.invocation ?? evt;
    if (!e) return;
    if (e.status === 'error' || (!e.status && e.error)) {
      this.priorState = this.status.state || 'absent';
      this.errorEvent = e;
      this.render('error');
      return;
    }
    this.installingEvent = e; // #237 LD6: non-error progress → installing line
    this.render('installing');
  }

  onDismiss() {
    this.errorEvent = null;
    this.render(this.priorState || 'absent');
  }

  async onRetry() {
    this.errorEvent = null;
    this.render(this.priorState || 'absent');
    await this.postAction('install-voice-pack');
  }

  async onInstallComplete() {
    try {
      const response = await fetch('/api/integrations/voice-pack/status');
      if (!response.ok) throw new Error(`status ${response.status}`);
      this.status = await response.json();
      this.errorEvent = null;
      this.installingEvent = null;
      this.render(this.status.state || 'absent');
    } catch (error) {
      this.onInstallProgress({ phase: 'status', status: 'error', error: String(error) });
    }
  }

  render(state) {
    const stateLabel = STATE_LABEL[state] || 'Unknown';
    const versionLine = this.status.version
      ? `<div style="padding:4px 0;border-bottom:1px solid var(--border-rim)">Version: <strong>${escapeHtml(this.status.version)}</strong></div>`
      : '';
    const diskLine = typeof this.status.diskUsageBytes === 'number'
      ? `<div style="padding:4px 0">Disk: <strong>${escapeHtml(fmtBytes(this.status.diskUsageBytes))}</strong></div>`
      : '';
    this.slot.innerHTML = `
      <div style="${LBL};margin-bottom:8px">Voice Pack</div>
      <div style="font-size:0.85rem;margin-bottom:10px">
        <div style="padding:4px 0;border-bottom:1px solid var(--border-rim)">Status: <strong>${escapeHtml(stateLabel)}</strong></div>
        ${versionLine}
        ${diskLine}
      </div>
      ${this.renderBody(state)}
      <div style="margin-top:12px;border-top:1px solid var(--border-rim);padding-top:8px">
        <button class="cc-btn" data-action="copy-voice-diagnostics" style="font-size:0.8rem;padding:6px 12px">Copy diagnostics</button>
        <div data-role="voice-pack-diagnostics-note" style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;word-break:break-all"></div>
      </div>`;
    this.bind();
  }

  renderBody(state) {
    if (state === 'installing' && this.installingEvent) {
      const phase = escapeHtml(this.installingEvent.phase || 'download');
      const bytes = typeof this.installingEvent.bytesTransferred === 'number' && typeof this.installingEvent.totalBytes === 'number'
        ? ` (${fmtBytes(this.installingEvent.bytesTransferred)} / ${fmtBytes(this.installingEvent.totalBytes)})`
        : '';
      return `<div data-role="voice-pack-installing" style="font-size:0.8rem;color:var(--accent-cyan,#22d3ee);margin-bottom:10px">Installing voice pack — ${phase}${escapeHtml(bytes)}…</div>`;
    }
    if (state === 'error' && this.errorEvent) {
      const errMsg = this.errorEvent.error || 'unknown error';
      return `
        <div style="background:rgba(239,68,68,0.1);border-radius:4px;padding:8px 10px;margin-bottom:10px;color:var(--accent-red,#ef4444);font-size:0.8rem">
          Install failed during <strong>${escapeHtml(this.errorEvent.phase || 'install')}</strong>: ${escapeHtml(errMsg)}
        </div>
        <div style="display:flex;gap:8px">
          <button class="cc-btn" data-action="dismiss-voice-pack-error" style="font-size:0.8rem;padding:6px 12px">Dismiss</button>
          <button class="cc-btn cc-btn--primary" data-action="retry-voice-pack-install" style="font-size:0.8rem;padding:6px 12px">Retry</button>
        </div>`;
    }
    if (state === 'installed') {
      return `<button class="cc-btn" data-action="uninstall-voice-pack" style="font-size:0.8rem;padding:6px 12px">Uninstall</button>`;
    }
    if (state === 'stale') {
      return `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px">A newer voice pack is available.</div>
        <div style="display:flex;gap:8px">
          <button class="cc-btn cc-btn--primary" data-action="install-voice-pack" style="font-size:0.8rem;padding:6px 12px">Update</button>
          <button class="cc-btn" data-action="uninstall-voice-pack" style="font-size:0.8rem;padding:6px 12px">Uninstall</button>
        </div>`;
    }
    return `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:10px">Voice features disabled. Install the voice pack to enable TTS playback + Whisper STT.</div>
      <button class="cc-btn cc-btn--primary" data-action="install-voice-pack" style="font-size:0.8rem;padding:6px 12px">Install voice pack</button>`;
  }

  bind() {
    const install = this.slot.querySelector('[data-action="install-voice-pack"]');
    const uninstall = this.slot.querySelector('[data-action="uninstall-voice-pack"]');
    const dismiss = this.slot.querySelector('[data-action="dismiss-voice-pack-error"]');
    const retry = this.slot.querySelector('[data-action="retry-voice-pack-install"]');
    const copyDiag = this.slot.querySelector('[data-action="copy-voice-diagnostics"]');
    if (install) this.bindOnce(install, 'click', () => this.postAction('install-voice-pack'));
    if (uninstall) this.bindOnce(uninstall, 'click', () => this.postAction('uninstall-voice-pack'));
    if (dismiss) this.bindOnce(dismiss, 'click', () => this.onDismiss());
    if (retry) this.bindOnce(retry, 'click', () => this.onRetry());
    if (copyDiag) this.bindOnce(copyDiag, 'click', () => this.onCopyDiagnostics());
  }

  /** #237 LD6: allow-listed diagnostics (buildVoiceDiagnostics) to the
   *  clipboard; degrade-safe — no clipboard surface → JSON shown visibly. */
  async onCopyDiagnostics() {
    const diag = buildVoiceDiagnostics({
      packState: this.status.state || null,
      packVersion: this.status.version || null,
      lastFailure: this.errorEvent?.error || null,
      ...(this.diagnosticsDeps?.() || {}),
    });
    const json = JSON.stringify(diag, null, 2);
    const note = this.slot.querySelector('[data-role="voice-pack-diagnostics-note"]');
    try {
      await globalThis.navigator.clipboard.writeText(json);
      if (note) note.textContent = 'Diagnostics copied to clipboard.';
    } catch {
      if (note) note.textContent = `Clipboard unavailable — copy manually: ${json}`;
    }
  }

  async postAction(action) {
    try {
      const response = await fetch(`/api/actions/${action}`, { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      this.onInstallProgress({ phase: 'download', status: 'error', error: String(err) });
    }
  }
}

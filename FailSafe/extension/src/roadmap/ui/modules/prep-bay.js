// FailSafe Command Center — Prep Bay Controller
// Transcript handling, commit, history, and send-to-map.

import { escapeHtml } from './brainstorm-templates.js';
import { wireModalVisualizer } from './modal-visualizer.js';
import { showStatusGated } from './notifications.js';

export class PrepBayController {
  constructor(graph, webLlm, ideationBuffer, voice, getEl, showStatus, store) {
    this.graph = graph;
    this.webLlm = webLlm;
    this.ideationBuffer = ideationBuffer;
    this.voice = voice;
    this._getEl = getEl;
    this.showStatus = showStatus;
    this._store = store || null;
    this._modalTextarea = null; // set while modal is open
  }

  _toast(severity, text, color) {
    showStatusGated(severity, text, color, this.showStatus, this._store);
  }

  _maxHistory() {
    const v = Number(this._store?.get?.('brainstorm-history-max'));
    return Number.isFinite(v) && v > 0 ? v : 10;
  }

  onTranscript(text, isFinal) {
    const target = this._modalTextarea || this._getEl('.cc-bs-prep-input');
    if (!target) return;

    if (isFinal) {
      this.ideationBuffer.appendTranscript(text || '');
      target.value = this.ideationBuffer.currentText;
      this._showModalStatus('Ready', 'var(--text-muted)');
    } else {
      const current = this.ideationBuffer.currentText;
      target.value = current + (current ? ' ' : '') + (text || '');
      this._showModalStatus('Listening...', 'var(--accent-gold)');
    }
    target.scrollTop = target.scrollHeight;
  }

  _showModalStatus(text, color) {
    const modalStatus = document.querySelector('.cc-bs-modal-status');
    if (modalStatus) {
      modalStatus.textContent = text;
      modalStatus.style.color = color || 'var(--text-muted)';
    }
    this.showStatus(text, color);
  }

  commit() {
    const prepInput = this._getEl('.cc-bs-prep-input');
    const text = prepInput?.value?.trim();
    if (!text) { prepInput?.focus(); return; }

    this.ideationBuffer.setText(text);
    const { thought, dropped } = this.ideationBuffer.commit();
    if (!thought) { prepInput?.focus(); return; }
    if (dropped) this._toast('info', 'Oldest thought removed (history limit reached)', 'var(--text-muted)');
    this.updateHistoryDropdown();
    prepInput.value = '';
    this.submit(thought.text);
  }

  updateHistoryDropdown() {
    const select = this._getEl('.cc-bs-history');
    if (!select) return;
    const history = this.ideationBuffer.getHistory();
    const maxHistory = this._maxHistory();
    if (history.length === 0) {
      select.innerHTML = `<option value="">0 / ${maxHistory} thoughts</option>`;
      return;
    }
    select.innerHTML = `<option value="">${history.length} / ${maxHistory} thoughts</option>` +
      history.map(h => `<option value="${h.id}">${escapeHtml(h.text.substring(0, 30))}...</option>`).join('');
  }

  async submit(transcript) {
    if (!transcript?.trim()) return;
    this._toast('info', 'Processing transcript...', 'var(--accent-cyan)');
    const extraction = await this.graph.submitTranscript(transcript);

    if (extraction && extraction.nodes && extraction.nodes.length) {
      this.graph.applyExtraction(extraction);
      const msg = extraction.verbalResponse || `Extracted ${extraction.nodes.length} node(s)`;
      this._toast('info', msg, 'var(--accent-green)');
      if (extraction.verbalResponse) {
        this.voice.tts.speak(extraction.verbalResponse).catch((err) => {
          this._toast('error', `Voice failed: ${err.message || 'unknown error'}`, 'var(--accent-red)');
        });
      }
      return;
    }

    const reason = extraction?.error || extraction?.message || 'Server unavailable';
    this._toast('info', `${reason} \u2014 engaging local brain...`, 'var(--accent-cyan)');
    try {
      const local = await this.webLlm.extractGraph(transcript);
      if (local && local.nodes && local.nodes.length) {
        this.graph.applyExtraction(local);
        this._syncNodesToServer(local.nodes);
        const color = local.status === 'heuristic-extracted' ? 'var(--accent-gold)' : 'var(--accent-green)';
        this._toast('info', local.verbalResponse || 'Extracted via local brain', color);
        return;
      }
    } catch (err) {
      console.error('Browser LLM extraction unexpected failure:', err);
    }

    console.error('FailSafe CRITICAL: All extraction tiers failed. This should not happen.');
    this._toast('error', 'Extraction error \u2014 try rephrasing or adding nodes manually', 'var(--accent-red)');
  }

  _syncNodesToServer(nodes) {
    for (const n of nodes) {
      fetch('/api/v1/brainstorm/node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: n.label, type: n.type, id: n.id }),
      }).catch(() => {});
    }
  }

  bindEvents() {
    const prepInput = this._getEl('.cc-bs-prep-input');
    this._getEl('.cc-bs-prep-send')?.addEventListener('click', () => this.commit());
    prepInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.commit();
      }
    });
    this._getEl('.cc-bs-history')?.addEventListener('change', (e) => {
      const item = this.ideationBuffer.getHistory().find(h => h.id === e.target.value);
      if (item && prepInput) prepInput.value = item.text;
    });
    this._getEl('.cc-bs-prep-expand')?.addEventListener('click', () => this.openModal());
  }

  openModal() {
    if (document.querySelector('.cc-bs-modal-overlay')) return;
    const prepInput = this._getEl('.cc-bs-prep-input');
    const { overlay, modal, textarea, recordBtn } = this._createModalDom(prepInput);
    document.body.appendChild(overlay);

    textarea.focus();
    textarea.scrollTop = textarea.scrollHeight;
    this._modalTextarea = textarea;
    recordBtn.addEventListener('click', () => this.voice.toggle());

    const origOnMic = this.voice.onMicButton;
    let close;
    const escHandler = (e) => { if (e.key === 'Escape') close?.(); };
    this._modalEscHandler = escHandler;
    document.addEventListener('keydown', escHandler);

    close = () => {
      if (this._restoreAnalyser) { this._restoreAnalyser(); this._restoreAnalyser = null; }
      document.removeEventListener('keydown', escHandler);
      this._modalTextarea = null;
      this.voice.onMicButton = origOnMic;
      if (prepInput) prepInput.value = textarea.value;
      overlay.remove();
    };

    modal.querySelector('.cc-bs-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    modal.querySelector('.cc-bs-modal-send').addEventListener('click', () => {
      if (prepInput) prepInput.value = textarea.value;
      close();
      this.commit();
    });

    this._wireModalVoiceState(modal, recordBtn, origOnMic);
    const teardownViz = wireModalVisualizer(modal, this.voice, () => !!this._modalTextarea);
    this._restoreAnalyser = teardownViz;
  }

  _createModalDom(prepInput) {
    const overlay = document.createElement('div');
    overlay.className = 'cc-bs-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:24px;';
    const modal = document.createElement('div');
    modal.style.cssText = 'width:100%;max-width:800px;max-height:90vh;background:var(--bg-mid);border:1px solid var(--border-rim);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px;';
    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:16px;font-weight:700;color:var(--text-main)">Ideation Prep Bay</span>
        <button class="cc-btn cc-bs-modal-close" style="font-size:12px;padding:4px 12px;">Close</button>
      </div>
      <textarea class="cc-bs-modal-input" spellcheck="false"
        style="flex:1;min-height:400px;background:rgba(0,0,0,0.3);border:1px solid var(--border-rim);border-radius:8px;padding:14px;color:var(--text-main);font-family:var(--font-body);font-size:1.1rem;line-height:1.6;resize:none;outline:none;"></textarea>
      <div style="display:flex;align-items:center;gap:10px;">
        <canvas class="cc-bs-modal-visualizer" style="flex:1;height:24px;"></canvas>
        <span class="cc-bs-modal-status" style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);min-width:80px;text-align:right;">Ready</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="cc-btn cc-bs-modal-record" style="flex:1;padding:12px;font-weight:bold;background:rgba(255,255,255,0.05);">[ RECORD ]</button>
        <button class="cc-btn cc-btn--primary cc-bs-modal-send" style="flex:1.2;padding:12px;font-weight:bold;">SEND TO MAP</button>
      </div>`;
    overlay.appendChild(modal);
    const textarea = modal.querySelector('.cc-bs-modal-input');
    textarea.value = prepInput?.value || '';
    const recordBtn = modal.querySelector('.cc-bs-modal-record');
    return { overlay, modal, textarea, recordBtn };
  }

  _wireModalVoiceState(modal, recordBtn, origOnMic) {
    this.voice.onMicButton = (html, active, disabled, title) => {
      origOnMic?.(html, active, disabled, title);
      if (!this._modalTextarea) return;
      if (html !== null) recordBtn.innerHTML = html;
      recordBtn.classList.toggle('active', !!active);
      if (disabled !== undefined) recordBtn.disabled = !!disabled;
      if (title) recordBtn.title = title;
    };
  }

  destroy() {
    if (this._modalEscHandler) { document.removeEventListener('keydown', this._modalEscHandler); this._modalEscHandler = null; }
  }
}

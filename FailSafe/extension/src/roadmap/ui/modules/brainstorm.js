// FailSafe Command Center — Brainstorm Voice MindMapper
// Thin orchestrator: delegates to extracted sub-modules.
import { IdeationBuffer } from './ideation-buffer.js';
import { BrainstormCanvas } from './brainstorm-canvas.js';
import { SttEngine } from './stt-engine.js';
import { TtsEngine } from './tts-engine.js';
import { VoiceController } from './voice-controller.js';
import { KeyboardManager } from './keyboard-manager.js';
import { BrainstormGraph } from './brainstorm-graph.js';
import { WebLlmEngine } from './web-llm-engine.js';
import { renderShell, renderRightPanel } from './brainstorm-templates.js';
import { LlmStatusRenderer } from './llm-status.js';
import { PrepBayController } from './prep-bay.js';
import { NodeEditor } from './node-editor.js';
import { VoiceStatusBadge } from './voice-status-badge.js';
import { drawSidebarVisualizer } from './brainstorm-visualizer.js';

export class BrainstormRenderer {
  constructor(containerId, deps = {}) {
    this.container = document.getElementById(containerId);
    this.store = deps.store || null;
    this.client = deps.client || null;

    const stt = new SttEngine(this.store);
    const tts = new TtsEngine(this.store);
    this.voice = new VoiceController(stt, tts, this.store);
    this.keyboard = new KeyboardManager(this.store);

    const getEl = (sel) => this._getEl(sel);
    const showStatus = (t, c) => this.showStatus(t, c);
    this.graph = new BrainstormGraph({ showStatus, store: this.store });
    const historyMax = Number(this.store?.get?.('brainstorm-history-max'));
    this.ideationBuffer = new IdeationBuffer(Number.isFinite(historyMax) && historyMax > 0 ? historyMax : 10);
    this.webLlm = new WebLlmEngine(this.store);

    this.llmStatus = new LlmStatusRenderer(this.webLlm, this.store, showStatus);
    this.prepBay = new PrepBayController(this.graph, this.webLlm, this.ideationBuffer, this.voice, getEl, showStatus, this.store);
    this.nodeEditor = new NodeEditor(this.graph, getEl);
    this.voiceStatusBadge = null;
  }

  render() {
    if (!this.container || this.graph.canvas) return;
    this.container.innerHTML = renderShell();
    this.graph.fetchGraph().then(() => this.initCanvas());
    this._wireVoice();
    this.voice.stt.init().finally(() => this.voice.loadSettings());
    this.voice.tts.init().catch(() => {});
    this.webLlm.onProgress = () => {
      this.client?.setWebLlmStatus({
        nativeAvailable: this.webLlm.isNativeAiAvailable,
        nativeUnavailableReason: this.webLlm.nativeUnavailableReason,
        wasmReady: !!this.webLlm.pipeline,
        loading: this.webLlm.loadingStatus === 'loading' || this.webLlm.loadingStatus === 'downloading'
      });
      this.llmStatus.render(this.client);
    };
    const STATUS_MSGS = { 'native-lost': ['Gemini Nano disconnected \u2014 falling back.', 'var(--accent-gold)'], 'native-downloading': ['Downloading Gemini Nano model...', 'var(--accent-cyan)'], 'native-found': ['Gemini Nano active!', 'var(--accent-green)'] };
    this.webLlm.onStatusChange = (reason) => {
      this.llmStatus.render(this.client);
      const m = STATUS_MSGS[reason];
      if (m) this.showStatus(m[0], m[1]);
    };
    this.webLlm.init().then(() => this.llmStatus.render(this.client)).catch(() => this.llmStatus.render(this.client));
    this._heartbeatInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      this.webLlm.recheckNative().then(() => this.llmStatus.render(this.client));
    }, 30000);
    this._wireSettingsBridges();
  }

  _wireSettingsBridges() {
    this._settingsBridges = {
      'failsafe:audio-device-changed': (e) => { if (e.detail.type === 'input') this.voice.stt.setMicDevice(e.detail.deviceId); },
      'failsafe:whisper-model-changed': (e) => this.voice.swapWhisperModel(e.detail.modelId),
      'failsafe:stt-language-changed': (e) => this.voice.setLanguage(e.detail.language),
    };
    for (const [name, fn] of Object.entries(this._settingsBridges)) window.addEventListener(name, fn);
  }

  renderRightPanel() { return renderRightPanel(); }
  _getEl(sel) {
    return this.container?.querySelector(sel) || document.getElementById('context-hub')?.querySelector(sel) || null;
  }

  _getAll(sel) {
    return [...(this.container?.querySelectorAll(sel) || []), ...(document.getElementById('context-hub')?.querySelectorAll(sel) || [])];
  }
  _wireVoice() {
    this.voice.onMicButton = (html, active, disabled, title) => {
      const el = this._getEl('.cc-bs-voice');
      if (!el) return;
      if (html !== null) el.innerHTML = html;
      el.classList.toggle('active', !!active);
      if (disabled !== undefined) el.disabled = !!disabled;
      if (title) el.title = title;
    };
    this.voice.onStatus = (text, color) => this.showStatus(text, color);
    this.voice.addAnalyserListener((a) => this._initVisualizer(a));
    const badgeEl = this._getEl('.cc-bs-voice-status');
    if (badgeEl) {
      this.voiceStatusBadge = new VoiceStatusBadge(badgeEl, this.voice);
      this.voiceStatusBadge.attach();
    }
    this.voice.wireModelProgress();
    this.voice.stt.onTranscript = (t, f) => this.prepBay.onTranscript(t, f);
    this.voice.stt.onAudioCaptured = (blob) => {
      fetch('/api/v1/brainstorm/audio', { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: blob })
        .then(res => { if (!res.ok) this.showStatus('Audio save failed', 'var(--accent-red)'); })
        .catch(err => { console.warn('[brainstorm] audio POST failed:', err.message); this.showStatus('Audio capture not saved', 'var(--accent-gold)'); });
    };
    this.keyboard.onPttStart = () => this.voice.startPtt();
    this.keyboard.onPttStop = () => this.voice.stopPtt();
    this.graph.onSelectionChange = (id) => {
      if (id === this.nodeEditor.selectedNodeId || id === null) this.nodeEditor.select(null);
      else this.nodeEditor.select(id);
    };
  }

  _initVisualizer(analyser) {
    this._visualizerHandle?.destroy?.();
    this._visualizerHandle = drawSidebarVisualizer(analyser, () => this.voice.voiceActive);
  }

  initCanvas() {
    const container = this.container.querySelector('.cc-brainstorm-canvas');
    if (!container) return;
    const canvas = new BrainstormCanvas(container);
    this.graph.setCanvas(canvas);
    this._updateEmptyState = () => {
      const el = this.container?.querySelector('.cc-bs-empty-state');
      if (el) el.style.display = this.graph.nodes.length ? 'none' : 'block';
    };
    const origSetNodes = canvas.setNodes.bind(canvas);
    let emptyStateScheduled = false;
    canvas.setNodes = (nodes) => {
      origSetNodes(nodes);
      if (!emptyStateScheduled) {
        emptyStateScheduled = true;
        queueMicrotask(() => { emptyStateScheduled = false; this._updateEmptyState(); });
      }
    };
    canvas.setNodes(this.graph.nodes);
    canvas.setEdges(this.graph.edges, this.graph.nodes);
    canvas.onNodeMove((id, x, y) => {
      const node = this.graph.nodes.find(n => n.id === id);
      if (node) { node.x = x; node.y = y; }
    });
    canvas.onNodeSelect((id) => this.nodeEditor.select(id));
    canvas.onNodeDblClick((id) => this.nodeEditor.startEdit(id));
    this._undoKeyHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); this.graph.undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault(); this.graph.redo();
      }
      if (e.key === 'Delete' && this.nodeEditor.selectedNodeId) {
        this.graph.removeNode(this.nodeEditor.selectedNodeId);
      }
    };
    document.addEventListener('keydown', this._undoKeyHandler);
    this.bindToolbar();
    this.keyboard.loadKey();
    this.keyboard.bind();
  }

  bindToolbar() {
    const canvas = this.graph.canvas;
    if (!canvas) return;

    this._getEl('.cc-bs-undo')?.addEventListener('click', () => this.graph.undo());
    this._getEl('.cc-bs-redo')?.addEventListener('click', () => this.graph.redo());
    this._getEl('.cc-bs-export')?.addEventListener('click', () => this.graph.exportJSON());
    this._getEl('.cc-bs-clear')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset the entire Mind Map? This will clear all extracted ideations.')) {
        this.graph.clearAll();
      }
    });

    this._getAll('.cc-bs-layout').forEach(btn => {
      btn.addEventListener('click', () => {
        canvas.setLayout(btn.getAttribute('data-layout'));
        this._getAll('.cc-bs-layout').forEach(b => b.style.borderColor = '');
        btn.style.borderColor = 'var(--accent-cyan)';
      });
    });

    this._getAll('.cc-bs-view').forEach(btn => btn.addEventListener('click', () => {
      canvas.setViewMode(btn.getAttribute('data-view'));
      this._getAll('.cc-bs-view').forEach(b => { b.classList.remove('active'); b.style.borderColor = ''; });
      btn.classList.add('active'); btn.style.borderColor = 'var(--accent-cyan)';
    }));
    this._bindWakeToggle();
    if (!this._wakeHandler) {
      this._wakeHandler = (e) => {
        this.voice.stt.setWakeWordEnabled(e.detail.enabled);
        if (e.detail.enabled) this.voice.stt.startWakeWordListener();
        else this.voice.stt.stopWakeWordListener();
        const toggle = this._getEl('.cc-bs-wake-toggle');
        if (toggle && toggle.checked !== e.detail.enabled) toggle.checked = e.detail.enabled;
      };
      window.addEventListener('failsafe:wake-word-changed', this._wakeHandler);
    }
    this.prepBay.bindEvents();
    this._getEl('.cc-bs-voice')?.addEventListener('click', () => this.voice.toggle());
    this.llmStatus.render(this.client);

    // Replace with lightweight re-render for subsequent calls (sidebar re-show)
    this.bindToolbar = () => {
      this.llmStatus.render(this.client);
      this._bindWakeToggle();
    };
  }

  _bindWakeToggle() {
    const toggle = this._getEl('.cc-bs-wake-toggle');
    if (!toggle) return;
    toggle.checked = this.store?.get('wake-word-enabled') === 'true' || this.store?.get('wake-word-enabled') === true;
    toggle.addEventListener('change', (e) => {
      const on = e.target.checked;
      this.voice.stt.setWakeWordEnabled(on);
      if (on) this.voice.stt.startWakeWordListener(); else this.voice.stt.stopWakeWordListener();
      this.store?.set('wake-word-enabled', on);
      window.dispatchEvent(new CustomEvent('failsafe:wake-word-changed', { detail: { enabled: on } }));
    });
  }
  showStatus(text, color) {
    const el = this._getEl('.cc-bs-chat-status');
    if (!el) return;
    if (text) { el.textContent = text; el.style.borderLeftColor = color || 'var(--accent-cyan)'; el.style.display = 'block'; }
    else { el.style.display = 'none'; el.textContent = ''; }
  }

  onEvent(evt) { this.graph.onEvent(evt); }

  destroy() {
    if (this._heartbeatInterval) { clearInterval(this._heartbeatInterval); this._heartbeatInterval = null; }
    this._visualizerHandle?.destroy?.(); this._visualizerHandle = null;
    for (const [name, fn] of Object.entries(this._settingsBridges || {})) window.removeEventListener(name, fn);
    if (this._wakeHandler) window.removeEventListener('failsafe:wake-word-changed', this._wakeHandler);
    if (this._undoKeyHandler) document.removeEventListener('keydown', this._undoKeyHandler);
    this._wakeHandler = null; this.keyboard.unbind();
    this.voiceStatusBadge?.detach(); this.voiceStatusBadge = null;
    this.prepBay.destroy(); this.voice.destroy(); this.webLlm.destroy();
    this.graph.canvas?.destroy(); if (this.container) this.container.innerHTML = '';
  }
}
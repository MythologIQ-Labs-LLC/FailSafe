// FailSafe Command Center — LLM Status Renderer
// Renders the AI extraction tier list, help block, and handles reorder/copy actions.

const TOOLTIPS = {
  native: 'Runs inside your browser \u2014 zero latency, zero cost, fully private. Ideal for rephrasing, classifying, and expanding brainstorm ideas. Not a knowledge engine.',
  server: 'Connects to a local Ollama instance for more capable models. Good balance of power and privacy \u2014 your data stays on your machine.',
  wasm: 'Lightweight fallback model compiled to WebAssembly. Works offline in any browser. Great for quick text tasks when other engines are unavailable.'
};

function dot(on) {
  const bg = on ? 'var(--accent-green)' : 'rgba(255,255,255,0.1)';
  const shadow = on ? 'box-shadow:0 0 8px var(--accent-green);' : '';
  return `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:8px;background:${bg};${shadow}"></span>`;
}

export class LlmStatusRenderer {
  constructor(webLlm, store, showStatus) {
    this.webLlm = webLlm;
    this.store = store;
    this.showStatus = showStatus;
    this._helpVisible = false;
  }

  render(client) {
    const indicator = document.querySelector('.cc-bs-llm-indicator');
    if (!indicator) return;

    const state = client ? client.webLlmState : {
      nativeAvailable: this.webLlm.isNativeAiAvailable,
      wasmReady: !!this.webLlm.pipeline,
      loading: this.webLlm.loadingStatus === 'loading' || this.webLlm.loadingStatus === 'downloading',
      browserSupported: true,
      ollamaAvailable: false,
      ollamaUnavailableReason: 'not-probed',
    };
    this._client = client; // retained for the recheck button click handler

    const priority = this.store.getLlmPriority();
    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
    priority.forEach((id, index) => { html += this._renderRow(id, index, state); });
    html += '</div>';
    html += this._renderHelpBlock();

    indicator.innerHTML = html;
    this._wireActions(indicator);
  }

  _renderRow(id, index, state) {
    const info = this._getRowInfo(id, state);
    const tip = (TOOLTIPS[id] || '').replace(/"/g, '&quot;');
    return `
      <div title="${tip}" style="display:flex; align-items:center; padding:8px 10px; background:rgba(255,255,255,0.03); border-radius:6px; border:1px solid rgba(255,255,255,0.05); cursor:help;">
        <div style="display:flex; flex-direction:column; gap:4px; margin-right:10px;">
          <button onclick="window.dispatchEvent(new CustomEvent('fs-reorder-llm', {detail:{index:${index},dir:-1}}))" style="background:none; border:none; color:white; padding:0; cursor:pointer; font-size:8px; opacity:0.3; hover:opacity:1">\u25B2</button>
          <button onclick="window.dispatchEvent(new CustomEvent('fs-reorder-llm', {detail:{index:${index},dir:1}}))" style="background:none; border:none; color:white; padding:0; cursor:pointer; font-size:8px; opacity:0.3; hover:opacity:1">\u25BC</button>
        </div>
        ${dot(info.active)}
        <span style="font-size:11px; color:${info.color}; flex:1;">${info.label}</span>
        <span style="font-size:10px; font-family:var(--font-mono);">${info.status}</span>
      </div>`;
  }

  _getRowInfo(id, state) {
    if (id === 'native') {
      if (state.nativeAvailable) return { label: 'Gemini Nano (Native)', status: '<span style="color:var(--accent-green)">Active \u2713</span>', active: true, color: 'var(--text-main)' };
      // Hardware doesn't support Gemini Nano (capabilities() returned 'no')
      if (state.nativeUnavailableReason === 'not-supported') return { label: 'Gemini Nano (Native)', status: '<span style="opacity:0.4">Not Supported</span>', active: false, color: 'var(--text-muted)' };
      // Probe threw an exception
      if (state.nativeUnavailableReason === 'probe-error') return { label: 'Gemini Nano (Native)', status: '<span style="opacity:0.4">Unavailable</span>', active: false, color: 'var(--text-muted)' };
      // API not available (browser lacks ai.languageModel)
      if (state.nativeUnavailableReason === 'no-api') return { label: 'Gemini Nano (Native)', status: '<span style="opacity:0.4">Not Available</span>', active: false, color: 'var(--text-muted)' };
      // Browser not Chrome/Edge - no point showing Enable
      if (!state.browserSupported) return { label: 'Gemini Nano (Native)', status: '<span style="opacity:0.4">Chrome/Edge Only</span>', active: false, color: 'var(--text-muted)' };
      // Default fallback
      return { label: 'Gemini Nano (Native)', status: '<span style="opacity:0.4">Unavailable</span>', active: false, color: 'var(--text-muted)' };
    }
    if (id === 'server') {
      if (state.ollamaAvailable) {
        return { label: 'Ollama (Server)', status: '<span style="color:var(--accent-green)">Connected ✓</span>', active: true, color: 'var(--text-main)' };
      }
      // Probe in flight / never run — show neutral state, not a false-positive "Connected".
      if (state.ollamaUnavailableReason === 'not-probed') {
        return { label: 'Ollama (Server)', status: '<span style="opacity:0.4">Checking…</span>', active: false, color: 'var(--text-muted)' };
      }
      // Common case: Ollama not installed / not running on :11434.
      if (state.ollamaUnavailableReason === 'not-running') {
        return { label: 'Ollama (Server)', status: '<span style="opacity:0.4">Not Running</span>', active: false, color: 'var(--text-muted)' };
      }
      return { label: 'Ollama (Server)', status: '<span style="opacity:0.4">Unavailable</span>', active: false, color: 'var(--text-muted)' };
    }
    if (id === 'wasm') {
      if (state.wasmReady) return { label: 'WASM Core (Local)', status: 'Standby', active: true, color: 'var(--text-main)' };
      if (state.loading) return { label: 'WASM Core (Local)', status: '<span style="color:var(--accent-gold)">Loading...</span>', active: false, color: 'var(--text-muted)' };
      return { label: 'WASM Core (Local)', status: '<span style="opacity:0.4">Offline</span>', active: false, color: 'var(--text-muted)' };
    }
    return { label: id, status: '', active: false, color: 'var(--text-muted)' };
  }

  _renderHelpBlock() {
    const vis = this._helpVisible ? 'block' : 'none';
    return `
      <div class="cc-bs-llm-help" style="display:${vis}; margin-top:12px; padding:12px; border-radius:8px; background:rgba(56,189,248,0.05); border:1px solid rgba(56,189,248,0.2);">
        <div style="font-size:11px; font-weight:700; color:var(--accent-cyan); margin-bottom:8px;">Enable Gemini Nano</div>
        <div style="font-size:10px; line-height:1.4; color:var(--text-muted); margin-bottom:8px;">
          To use the built-in AI, enable these flags in Chrome/Edge and relaunch:
        </div>
        <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:6px; background:rgba(0,0,0,0.4); border-radius:4px; padding:6px;">
            <span style="flex:1; font-size:9px; color:var(--accent-cyan); font-family:var(--font-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">chrome://flags/#optimization-guide-on-device-model</span>
            <button class="cc-bs-flag-open" data-url="chrome://flags/#optimization-guide-on-device-model" style="background:rgba(56,189,248,0.15); border:1px solid rgba(56,189,248,0.35); color:var(--accent-cyan); border-radius:4px; padding:2px 6px; font-size:9px; cursor:pointer;">Copy</button>
          </div>
          <div style="display:flex; align-items:center; gap:6px; background:rgba(0,0,0,0.4); border-radius:4px; padding:6px;">
            <span style="flex:1; font-size:9px; color:var(--accent-cyan); font-family:var(--font-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">chrome://flags/#prompt-api-for-gemini-nano</span>
            <button class="cc-bs-flag-open" data-url="chrome://flags/#prompt-api-for-gemini-nano" style="background:rgba(56,189,248,0.15); border:1px solid rgba(56,189,248,0.35); color:var(--accent-cyan); border-radius:4px; padding:2px 6px; font-size:9px; cursor:pointer;">Copy</button>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <span style="font-size:9px; color:var(--text-muted);">Set both to <strong>Enabled</strong> and relaunch. Close this panel to re-check.</span>
        </div>
        <div style="font-size:8px; line-height:1.35; color:var(--text-muted); opacity:0.7; border-top:1px solid rgba(56,189,248,0.1); padding-top:6px;">
          <strong style="color:var(--accent-gold);">&#9888; Exploratory API</strong> &mdash;
          Gemini Nano is an experimental Chrome built-in model for local prototyping.
          Suited for summarising, classifying, or rephrasing text.
          <em>Not</em> suited for tasks requiring factual accuracy.
          Subject to Google&rsquo;s Prohibited Use Policy.
        </div>
      </div>`;
  }

  _wireActions(indicator) {
    if (!indicator || indicator.dataset.flagActionsBound === '1') return;
    indicator.dataset.flagActionsBound = '1';
    indicator.addEventListener('click', async (event) => {
      const copyBtn = event.target.closest('.cc-bs-flag-open');
      if (copyBtn) {
        event.preventDefault();
        const url = copyBtn.getAttribute('data-url') || '';
        if (!url) return;
        const copied = await this.copyToClipboard(url);
        if (copied) {
          copyBtn.textContent = 'Copied!';
          this.showStatus('Paste in your browser address bar.', 'var(--accent-green)');
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        } else {
          this.showStatus(`Copy manually: ${url}`, 'var(--accent-gold)');
        }
      }
    });
  }

  async copyToClipboard(text) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  reorderLlm(index, direction) {
    const list = this.store.getLlmPriority();
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return;
    [list[index], list[newIndex]] = [list[newIndex], list[index]];
    this.store.setLlmPriority(list);
  }

  toggleHelp() {
    this._helpVisible = !this._helpVisible;
    const help = document.querySelector('.cc-bs-llm-help');
    if (help) help.style.display = this._helpVisible ? 'block' : 'none';
    const toggle = document.querySelector('.cc-bs-llm-help-toggle');
    if (toggle) toggle.textContent = this._helpVisible ? 'Close Help \u2191' : 'Enable?';
    if (!this._helpVisible) {
      this.webLlm.recheckNative().then((found) => {
        if (found) this.showStatus('Gemini Nano detected!', 'var(--accent-green)');
      });
    }
  }
}

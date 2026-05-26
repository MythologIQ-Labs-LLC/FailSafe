// FailSafe Unified Command Center — Connection Module
// Handles WebSocket and SSE for real-time telemetry from ConsoleServer
import { createRestApi } from './rest-api.js';

export class ConnectionClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || ''; // Empty string resolves to same-origin
    this.wsUrl = options.wsUrl || `ws://${window.location.host}`;
    Object.assign(this, createRestApi(this.baseUrl));
    
    // Callbacks registered by UI components
    this.callbacks = {
      hub: [],           // (hubData) => {}
      event: [],         // (eventData) => {}
      connection: [],    // ('connecting'|'connected'|'disconnected') => {}
      skillRelevance: [], // (relevanceData) => {}
      webLlmStatus: []   // (statusData) => {}
    };

    const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    const isEdge = /Edg/.test(navigator.userAgent);
    
    this.webLlmState = {
      nativeAvailable: false,
      nativeUnavailableReason: null,  // 'no-api' | 'not-supported' | 'probe-error' | null
      wasmReady: false,
      loading: false,
      browserSupported: isChrome || isEdge,
      // Ollama server probe (was hardcoded "Connected" in llm-status.js without
      // any probe — corrected: actually check http://localhost:11434/api/tags).
      ollamaAvailable: false,
      ollamaUnavailableReason: 'not-probed',  // 'not-probed' | 'not-running' | 'probe-error' | null
      ollamaLastProbedAt: 0,
    };
    this._ollamaProbeTtlMs = 30000;
    // Fire-and-forget initial probe; subsequent renders refresh on TTL.
    this._probeOllama();

    this.lastHubData = null;  // Cache for tab switches
    this.ws = null;
    this.eventSource = null;
    this.state = 'disconnected';
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.useFallback = false;
  }

  on(eventType, callback) {
    if (this.callbacks[eventType]) {
      this.callbacks[eventType].push(callback);
    }
    return this;
  }

  notify(eventType, payload) {
    if (this.callbacks[eventType]) {
      this.callbacks[eventType].forEach(cb => cb(payload));
    }
  }

  setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      this.notify('connection', newState);
    }
  }

  start() {
    this.connectWs();
    this.fetchHub();
  }

  connectWs() {
    if (this.useFallback) return this.connectSSE();

    this.setState('connecting');
    try {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.useFallback = false;
        this.clearReconnectTimer();
        this.setState('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch (e) {
          console.error("Failed to parse WS message", e);
        }
      };

      this.ws.onerror = () => {
        // Will immediately trigger onclose
      };

      this.ws.onclose = () => {
        this.setState('disconnected');
        this.ws = null;
        this.scheduleReconnect();
      };
    } catch (e) {
      console.error("WebSocket instantiation failed:", e);
      this.scheduleReconnect();
    }
  }

  handleServerMessage(data) {
    if (!data.type) return;

    switch(data.type) {
      case 'init':
        // Full initial hub snapshot over WS
        if (data.payload) this.notify('hub', data.payload);
        break;
      case 'hub.refresh':
        // Signal that deep data changed, UI should fetch latest snapshot
        this.fetchHub();
        break;
      case 'event':
        // Transparent prompt/lifecycle event
        this.notify('event', {
          time: new Date().toLocaleTimeString(),
          type: data.payload?.type || data.type,
          payload: data.payload || {}
        });
        // If it's a structural change, refresh the hub
        if (data.payload?.planEvent || data.payload?.sprintEvent) {
          this.fetchHub();
        }
        break;
      case 'verdict':
        // Policy engine verdict
        this.notify('verdict', {
          time: new Date().toLocaleTimeString(),
          type: data.type,
          payload: data.payload || {}
        });
        break;
      // Marketplace events - forward to event subscribers
      case 'marketplace.installing':
      case 'marketplace.scanning':
      case 'marketplace.installed':
      case 'marketplace.scanned':
      case 'marketplace.failed':
      case 'marketplace.uninstalled':
      case 'marketplace.progress':
      case 'marketplace.scan.progress':
        this.notify('event', data);
        break;
      // Adapter events - forward to event subscribers
      case 'adapter.installing':
      case 'adapter.installed':
      case 'adapter.uninstalling':
      case 'adapter.uninstalled':
      case 'adapter.failed':
      case 'adapter.progress':
      case 'adapter.config.updated':
        this.notify('event', data);
        break;
      default:
        // Broad catch-all for tab-specific routing (risks, governance, etc)
        this.notify('event', data);
    }
  }

  connectSSE() {
    this.setState('connecting');
    try {
      this.eventSource = new EventSource(`${this.baseUrl}/api/v1/events/stream`);
      
      this.eventSource.onopen = () => {
        this.clearReconnectTimer();
        this.setState('connected');
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch (e) {
          console.error("SSE parse error", e);
        }
      };

      this.eventSource.onerror = () => {
        this.eventSource?.close();
        this.eventSource = null;
        this.setState('disconnected');
        this.scheduleReconnect();
      };
    } catch (e) {
      console.error("SSE connection failed:", e);
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    this.reconnectAttempts += 1;
    
    // If WebSocket fails 3 times, fallback to SSE polling
    if (this.reconnectAttempts > 3 && !this.useFallback) {
      console.warn("WebSocket attempts failing, failing over to SSE...");
      this.useFallback = true;
    }

    // Exponential backoff: 1s, 2s, 4s... capped at 30s
    const baseDelayMs = 1000 * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5));
    const jitter = Math.floor(Math.random() * 350);
    const delay = Math.min(30000, baseDelayMs + jitter);
    
    this.reconnectTimer = setTimeout(() => {
      this.clearReconnectTimer();
      if (this.useFallback) {
        this.connectSSE();
      } else {
        this.connectWs();
      }
    }, delay);
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // --- REST API CALLS --- //

  async fetchHub() {
    try {
      const res = await fetch(`${this.baseUrl}/api/hub`);
      if (!res.ok) throw new Error(`Hub request failed (${res.status})`);
      const payload = await res.json();
      this.lastHubData = payload;  // Cache for tab switches
      this.notify('hub', payload);
      return payload;
    } catch (error) {
      return null;
    }
  }

  async postAction(endpoint, payload = {}) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined
      });
      if (!res.ok) throw new Error(`Action ${endpoint} failed (${res.status})`);
      const data = await res.json();
      // Action usually implies server state changed, refresh hub actively
      await this.fetchHub();
      return data;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  setWebLlmStatus(status) {
    this.webLlmState = { ...this.webLlmState, ...status };
    this.notify('webLlmStatus', this.webLlmState);
  }

  /**
   * Probe the local Ollama server at the default port (11434). Updates
   * `webLlmState.ollamaAvailable` + `ollamaUnavailableReason` + the last-
   * probed timestamp. Notifies `webLlmStatus` listeners on completion so
   * the LLM-status renderer refreshes. Skipped (no-op) if the prior probe
   * landed within `_ollamaProbeTtlMs`. Best-effort: any thrown error is
   * treated as "not running" — Ollama not being installed is the common
   * case and must not produce a console error spam.
   */
  async _probeOllama() {
    const now = Date.now();
    if (now - (this.webLlmState.ollamaLastProbedAt || 0) < this._ollamaProbeTtlMs) return;
    this.webLlmState = { ...this.webLlmState, ollamaLastProbedAt: now };
    let available = false;
    let reason = 'not-running';
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = ctrl ? setTimeout(() => ctrl.abort(), 1500) : null;
      const res = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: ctrl ? ctrl.signal : undefined,
        cache: 'no-store',
      });
      if (timeoutId) clearTimeout(timeoutId);
      available = !!(res && res.ok);
      reason = available ? null : 'probe-error';
    } catch (_e) {
      // Network failure / abort / CORS — treat all as "not-running" so the
      // common-case (no Ollama installed) doesn't surface as an error.
      available = false;
      reason = 'not-running';
    }
    this.webLlmState = {
      ...this.webLlmState,
      ollamaAvailable: available,
      ollamaUnavailableReason: reason,
    };
    this.notify('webLlmStatus', this.webLlmState);
  }

  /**
   * Force a fresh Ollama probe by clearing the TTL guard. Called by the UI
   * after the operator installs Ollama and wants to refresh status.
   */
  recheckOllama() {
    this.webLlmState = { ...this.webLlmState, ollamaLastProbedAt: 0 };
    return this._probeOllama();
  }

  // --- Workspace isolation: switch to a different server --- //

  switchServer(port) {
    // Close existing connections
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.useFallback = false;

    // Update URLs to new port
    this.baseUrl = `http://localhost:${port}`;
    this.wsUrl = `ws://localhost:${port}`;

    // Reassign REST API methods with new baseUrl
    Object.assign(this, createRestApi(this.baseUrl));

    // Reconnect to new server
    this.start();
  }
}

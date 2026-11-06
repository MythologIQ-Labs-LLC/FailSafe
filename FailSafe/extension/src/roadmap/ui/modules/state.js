// FailSafe Command Center — State Persistence Module
// Thin localStorage wrapper with prefixed keys.
import { currentTheme, requestTheme } from './theme-sync.js';

export class StateStore {
  constructor(prefix = 'fs') {
    this.prefix = prefix;
  }

  get(key) {
    return localStorage.getItem(`${this.prefix}-${key}`);
  }

  set(key, value) {
    localStorage.setItem(`${this.prefix}-${key}`, value);
  }

  remove(key) {
    localStorage.removeItem(`${this.prefix}-${key}`);
  }

  getJSON(key) {
    try { return JSON.parse(this.get(key)); } catch { return null; }
  }

  setJSON(key, value) {
    this.set(key, JSON.stringify(value));
  }

  getActiveTab() { return this.get('tab') || 'overview'; }
  setActiveTab(id) { this.set('tab', id); }
  /** #601: the theme is the extension host's (see theme-sync.js); this page only shows it. */
  getTheme() { return currentTheme(); }

  /** Ask the extension host to change the shared theme. Resolves { ok, theme | reason }. */
  setTheme(theme) { return requestTheme(theme); }

  getLlmPriority() {
    return this.getJSON('llm-priority') || ['server', 'native', 'wasm'];
  }
  setLlmPriority(list) {
    this.setJSON('llm-priority', list);
  }
}

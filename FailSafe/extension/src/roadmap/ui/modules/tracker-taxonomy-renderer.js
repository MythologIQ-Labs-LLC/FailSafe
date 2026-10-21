/**
 * TrackerTaxonomyRenderer (FX891) — Workspace › Taxonomy sub-view.
 *
 * The operator-facing editor for the tracker's programs ∥ verticals + agent
 * mappings. Loads GET /api/v1/tracker/config (the operator config, or one
 * derived from programs.yaml), renders editable rows with add/remove, and Save
 * POSTs back — persisting docs/roadmap/tracker-config.yaml + emitting the
 * governed .failsafe/governance/tracker-taxonomy.directive.md the next cycle
 * must consult. Follows the TabGroup sub-view contract (render/destroy).
 *
 * #548: each vertical's functionality is checked against the Console navigation
 * (the server's `drift` report) and is never edited here; Save applies only the
 * inputs the operator changed, carries the loaded file's fingerprint and is refused
 * (409) when the file changed on disk.
 *
 * B331: what the operator sees and edits is a draft (tracker-taxonomy-model.js) kept
 * across hub repaints, failed Saves and navigation. Only a load, a successful or
 * directive-failed Save, a Reload click or an applied foreign change starts a new
 * draft generation. A change on disk or in another Console window while the draft is
 * dirty is a visible conflict; nothing ever reloads over unsaved edits except Reload.
 */

import { isPlainObject } from './tracker-taxonomy-drift.js';
import { postTaxonomy, saveVerdict } from './tracker-taxonomy-save.js';
import { draftFromConfig, addRow, deleteRow, syncDraftFromDom, isDirty, collectFromDraft, rowsById } from './tracker-taxonomy-model.js';
import { STYLE_ID, STYLE, editorHtml, errorHtml, focusState, restoreFocus } from './tracker-taxonomy-view.js';

/** A Save that has not answered after this long is reported as "outcome unknown". */
const SAVE_TIMEOUT_MS = 30000;

const emptyConfig = () => ({ programs: [], verticals: [], agents: [] });

export class TrackerTaxonomyRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.config = emptyConfig();
    this.drift = null;
    /** sha256 of the file the editor loaded (null: absent); sent back on Save. */
    this.fingerprint = null;
    this.source = '';
    this.loadError = '';
    this.status = '';
    /** null | 'disk' | 'elsewhere' — kept across repaints until Reload or a successful Save. */
    this.conflict = null;
    this.draft = null;
    this.saveTimeoutMs = SAVE_TIMEOUT_MS;
    this._loaded = false;
    this._gen = 0;
    this._root = null;
    this._rootGen = -1;
    /** Per input/checkbox: { shown, value } — what it displayed when painted (an input strips
     *  CR/LF) and the row value it was painted from, so a reverted edit reverts. */
    this._painted = new WeakMap();
    this._loading = null;
    this._loadSeq = 0;
    this._loadingSeq = 0;
    this._saving = false;
    this._held = [];
    /** Fingerprints this editor wrote; each is removed when its broadcast echo arrives. */
    this._written = new Set();
    this._inflight = new Set();
  }

  ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  /** Resolves when every load, Save and event this editor started has settled. */
  async idle() {
    while (this._inflight.size) await Promise.allSettled([...this._inflight]);
  }

  _track(p) {
    this._inflight.add(p);
    const done = () => this._inflight.delete(p);
    p.then(done, done);
    return p;
  }

  async render() {
    if (!this.container) return;
    this.ensureStyle();
    if (!this._loaded) {
      const result = await this._load();
      if (!this._loaded) { this._loaded = true; this._applyFirstLoad(result); }
    }
    // A hub payload never replaces the mounted view (edits, focus and caret stay).
    if (this._mounted()) return;
    this.paint();
  }

  _mounted() {
    return !!this._root && this._rootGen === this._gen && this.container.contains(this._root);
  }

  /** Single-flight: a load already in flight is joined. */
  _load() {
    if (this._loading) return this._loading;
    const seq = ++this._loadSeq;
    this._loadingSeq = seq;
    const p = this._fetchConfig().finally(() => { if (this._loading === p) this._loading = null; });
    this._loading = p;
    return this._track(p);
  }

  /** A load that started after `arrival`: join one in flight only if it is newer. */
  _loadAfter(arrival) {
    if (this._loading && this._loadingSeq > arrival) return this._loading;
    if (this._loading) return this._loading.then(() => this._load());
    return this._load();
  }

  /** A load counts only with an ok status, a JSON body and a `config` object. */
  async _fetchConfig() {
    try {
      const res = await fetch('/api/v1/tracker/config');
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok || !isPlainObject(data) || !isPlainObject(data.config)) {
        return { ok: false, error: isPlainObject(data) && data.error ? String(data.error) : `HTTP ${res.status}` };
      }
      return { ok: true, data };
    } catch {
      return { ok: false, error: 'is the Console server running?' };
    }
  }

  _applyFirstLoad(result) {
    if (result.ok) { this.loadError = ''; this._applyData(result.data); return; }
    this.loadError = `The taxonomy could not be loaded (${result.error}). Reload the Console to try again.`;
  }

  _applyData(data) {
    this.config = data.config;
    this.source = data.source || '';
    this.drift = isPlainObject(data.drift) ? data.drift : null;
    this.fingerprint = typeof data.fingerprint === 'string' ? data.fingerprint : null;
    this._rebuild();
  }

  /** A new draft generation: the previous root is dropped so it is never read back. */
  _rebuild() {
    this.draft = draftFromConfig(this.config);
    this._gen += 1;
    this._root = null;
  }

  _sync() {
    if (this.draft && this._root && this._rootGen === this._gen) {
      syncDraftFromDom(this.draft, this._root, (el) => this._painted.get(el));
    }
  }

  paint() {
    if (!this.container) return;
    this._sync();
    const focus = focusState(this._root);
    if (this.loadError || !this.draft) {
      this.container.innerHTML = errorHtml(this.loadError || 'The taxonomy has not loaded yet.');
      this._root = null;
      return;
    }
    this.container.innerHTML = editorHtml({
      draft: this.draft, dirty: isDirty(this.draft), saving: this._saving, conflict: this.conflict,
      drift: this.drift, source: this.source, status: this.status,
    });
    this._root = this.container.querySelector('.cc-tax');
    this._rootGen = this._gen;
    const byId = rowsById(this.draft);
    for (const rowEl of this._root.querySelectorAll('.cc-tax-row[data-row-id]')) {
      const row = byId.get(rowEl.getAttribute('data-row-id'));
      if (!row) continue;
      for (const el of rowEl.querySelectorAll('.cc-tax-in')) this._painted.set(el, { shown: el.value, value: row.values[el.getAttribute('data-field')] });
      const xc = rowEl.querySelector('[data-field="crossCutting"]');
      if (xc) this._painted.set(xc, { shown: xc.checked, value: row.xc });
    }
    this._bind(this._root);
    restoreFocus(this._root, focus);
  }

  /** Listeners live on this paint's root only (never on the shared container). */
  _bind(root) {
    root.addEventListener('input', () => {
      this._sync();
      const dirty = isDirty(this.draft);
      root.toggleAttribute('data-dirty', dirty);
      if (dirty) root.setAttribute('data-dirty', 'true');
      root.querySelector('.cc-tax-dirty')?.toggleAttribute('hidden', !dirty);
    });
    root.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || typeof t.closest !== 'function' || this._saving) return;
      const add = t.closest('[data-add]');
      if (add) { this._sync(); addRow(this.draft, add.getAttribute('data-add')); this.paint(); return; }
      if (t.closest('[data-del]')) {
        const row = t.closest('.cc-tax-row');
        this._sync();
        deleteRow(this.draft, row.getAttribute('data-kind'), row.getAttribute('data-row-id'));
        this.paint();
        return;
      }
      const act = t.closest('[data-act]')?.getAttribute('data-act');
      if (act === 'save') this._track(this.save());
      else if (act === 'reload') this._track(this._reload());
    });
  }

  /** Only a successful (or directive-failed) Save moves the baseline; any other outcome
   *  keeps config, fingerprint and draft. Controls are disabled while it is in flight. */
  async save() {
    if (this._saving || !this.draft) return;
    this._sync();
    const config = collectFromDraft(this.config, this.draft);
    this._saving = true;
    this.status = 'Saving…';
    this.paint();
    let outcome;
    try { outcome = await postTaxonomy(config, this.fingerprint, this.saveTimeoutMs); } finally { this._saving = false; }
    const verdict = saveVerdict(outcome, this.drift);
    if (verdict.adopt) this._adopt(config, verdict.fingerprint, verdict.drift);
    if (verdict.conflict) this.conflict = verdict.conflict;
    this.status = verdict.status;
    this.paint();
    const held = this._held;
    this._held = [];
    for (const h of held) this._track(this._consider(h.fp, h.arrival));
  }

  _adopt(config, fingerprint, drift) {
    this.config = config;
    this.source = 'config';
    this.drift = drift;
    this.fingerprint = fingerprint;
    if (fingerprint) this._written.add(fingerprint);
    this.conflict = null;
    this._rebuild();
  }

  /** Reload applies unconditionally: it is the operator's explicit "discard my edits". */
  async _reload() {
    const result = await this._loadAfter(this._loadSeq);
    if (result.ok) {
      this._applyData(result.data);
      this._written.clear();
      this.conflict = null;
      this.status = '';
    } else {
      this.status = `Could not reload the taxonomy (${result.error}). Your edits are kept.`;
    }
    this.paint();
  }

  onEvent(evt) {
    if (!evt || evt.type !== 'tracker.config.updated') return;
    const fp = evt.payload && evt.payload.fingerprint;
    if (typeof fp !== 'string') return;
    const arrival = this._loadSeq;
    if (this._saving) { this._held.push({ fp, arrival }); return; }
    this._track(this._consider(fp, arrival));
  }

  /** A broadcast fingerprint: an own echo is consumed; a foreign change reloads a clean
   *  draft (if still clean when the load resolves) or is a conflict. */
  async _consider(fp, arrival) {
    if (this._written.has(fp)) { this._written.delete(fp); return; }
    if (fp === this.fingerprint || !this.draft) return;
    this._sync();
    if (isDirty(this.draft)) { this.conflict = 'elsewhere'; this.paint(); return; }
    const result = await this._loadAfter(arrival);
    this._sync();
    if (!result.ok) {
      this.status = `Could not load the change made elsewhere (${result.error}). Your view is unchanged.`;
      this.paint();
      return;
    }
    if (result.data.fingerprint === this.fingerprint) return;
    if (isDirty(this.draft)) { this.conflict = 'elsewhere'; this.paint(); return; }
    this._applyData(result.data);
    this._written.clear();
    this.conflict = null;
    this.paint();
  }

  /** The DOM is cleared; the draft is kept (it is synced first). */
  destroy() {
    this._sync();
    if (this.container) this.container.innerHTML = '';
  }
}

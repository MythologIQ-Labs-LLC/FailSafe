// FailSafe Command Center — Learn tab host (Phase 2A of plan-learn-tab-
// multimode-redesign). The Learn tab is now a TabGroup of sub-views:
//   read       — sectioned SWE-craft essays (Phase 1) + trigger-engine
//                contextual surfacing (FX610). Default active sub-view.
//   reference  — unified searchable glossary (SWE + FailSafe), Phase 2A.
//   practice   — guided prompt builder, added in Phase 3.
//
// Compliance bindings preserved from commit 9c40860:
//  - All sessionStorage state is webview-session-scoped; never transmitted.
//  - No scoring / grading / completion-% / level inference (EU AI Act Annex
//    III(3) exclusion). Read-time chip, in-essay sections, and prompt-builder
//    affordances are structural, not evaluative.
//
// Trigger-engine integration (FX610) MOVES into the Read sub-view's render
// path. Reference / Practice sub-view renders DO NOT consume the per-session
// nudge budget — that gate is sub-view-scoped now.
//
// Mount semantics:
//  - LearnRenderer.render() first checks `education.enabled`; if false, the
//    tab is rendered empty (no TabGroup, no pills) and the cap budget is
//    untouched.
//  - When enabled, the first render mounts the TabGroup (pill bar + content
//    container); subsequent renders propagate the hub update to the active
//    sub-view via `tabGroup.renderActive(hubData)`.
//  - The outer-container `.active` class (signalled by the tab-host fan-out
//    in `command-center.js`) is forwarded to sub-views via the synthesized
//    `hubData._learnTabActive` flag so the Read sub-view's trigger-engine
//    gate matches the v1 semantic (no invisible budget consumption).

import { TabGroup } from './tab-group.js';
import { renderEssayList, bindEssayAck } from './learn-essay-list.js';
import { LearnGlossary } from './learn-glossary.js';
import {
  evaluateTriggers,
  applyCaps,
  NUDGE_ANCHORS,
} from '../../../education/lessonTriggers.js';

const SESSION_START_KEY = 'fs-learn-session-start';
const NUDGE_COUNT_PREFIX = 'fs-learn-nudge-count:';
const NUDGE_DISMISSED_PREFIX = 'fs-learn-nudge-dismissed:';

function getSessionStore() {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage) return sessionStorage;
  } catch (_e) { /* sandboxed contexts */ }
  return null;
}

function readOrInitSessionStart() {
  const store = getSessionStore();
  if (!store) return null;
  try {
    let started = store.getItem(SESSION_START_KEY);
    if (!started) {
      started = new Date().toISOString();
      store.setItem(SESSION_START_KEY, started);
    }
    return started;
  } catch (_e) { return null; }
}

function readNudgeCounts() {
  const out = {};
  const store = getSessionStore();
  if (!store) return out;
  for (const a of NUDGE_ANCHORS) {
    try {
      const raw = store.getItem(NUDGE_COUNT_PREFIX + a);
      const n = raw == null ? 0 : parseInt(raw, 10);
      out[a] = Number.isFinite(n) && n >= 0 ? n : 0;
    } catch (_e) { out[a] = 0; }
  }
  return out;
}

function readDismissedFlags() {
  const out = {};
  const store = getSessionStore();
  if (!store) return out;
  for (const a of NUDGE_ANCHORS) {
    try { out[a] = store.getItem(NUDGE_DISMISSED_PREFIX + a) === '1'; }
    catch (_e) { out[a] = false; }
  }
  return out;
}

function incrementNudgeCount(anchor) {
  const store = getSessionStore();
  if (!store) return;
  try {
    const raw = store.getItem(NUDGE_COUNT_PREFIX + anchor);
    const n = raw == null ? 0 : parseInt(raw, 10);
    const next = (Number.isFinite(n) && n >= 0 ? n : 0) + 1;
    store.setItem(NUDGE_COUNT_PREFIX + anchor, String(next));
  } catch (_e) { /* ignore */ }
}

function educationEnabled(hubData) {
  const education = (hubData && hubData.education) || {};
  return education.enabled !== false;
}

function buildTriggerInput(hub) {
  const recent = (hub && hub.recentCheckpoints) || [];
  const first = recent.length > 0 ? recent[0] : null;
  return {
    activePlan: (hub && hub.activePlan) || null,
    lastCheckpointAt: first && first.timestamp ? first.timestamp : null,
    unattributedFileActivity: (hub && hub.unattributedFileActivity) || [],
    sessionStartedAt: readOrInitSessionStart(),
    recentNudgeCount: readNudgeCounts(),
    dismissed: readDismissedFlags(),
  };
}

/**
 * Read sub-view — sectioned essays + trigger-engine integration. Receives
 * its container assignment via TabGroup.renderActive (sets
 * `this.container = contentEl` before calling render).
 */
class LearnReadSubView {
  constructor() {
    this.container = null;
    this._lastHub = {};
  }

  render(hubData) {
    if (!this.container) return;
    if (hubData && Object.keys(hubData).length) this._lastHub = hubData;
    const hub = this._lastHub;
    const education = hub.education || {};
    if (!educationEnabled(hub)) {
      this.container.innerHTML = renderEssayList({ enabled: false });
      return;
    }
    const proficiency = education.proficiency || 'beginner';
    // Outer-tab activeness is forwarded by the host (LearnRenderer) via
    // `_learnTabActive` so we don't consume the cap budget while the Learn
    // panel is hidden.
    const isLearnActive = !!(hub && hub._learnTabActive);
    if (!isLearnActive) {
      this.container.innerHTML = renderEssayList({ enabled: true, proficiency, triggerResults: [] });
      bindEssayAck(this.container);
      return;
    }
    const triggerInput = buildTriggerInput(hub);
    const triggerResults = applyCaps(evaluateTriggers(triggerInput), triggerInput);
    this.container.innerHTML = renderEssayList({ enabled: true, proficiency, triggerResults });
    bindEssayAck(this.container);
    for (const r of triggerResults) incrementNudgeCount(r.anchor);
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
    this._lastHub = {};
  }
}

export class LearnRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this._readSub = new LearnReadSubView();
    this._glossarySub = new LearnGlossary();
    this._tabGroup = new TabGroup(containerId, [
      { key: 'read', label: 'Read', renderer: this._readSub },
      { key: 'glossary', label: 'Glossary', renderer: this._glossarySub },
    ]);
    this._mounted = false;
    this._lastHub = null;
    this._navListener = (e) => this._handleNav(e);
  }

  render(hubData) {
    if (!this.container) return;
    const education = (hubData && hubData.education) || {};
    if (!educationEnabled(hubData)) {
      // Gated: clear and unmount. Re-mounting on next enabled render is fine.
      if (this._mounted) {
        try { this.container.removeEventListener('learn:nav', this._navListener); }
        catch (_e) { /* ignore */ }
      }
      this.container.innerHTML = '';
      this._mounted = false;
      this._lastHub = null;
      return;
    }
    // Forward outer-tab active flag so the Read sub-view's trigger gate runs
    // only when the Learn panel itself is visible (matches v1 semantic).
    const isActive = this.container.classList.contains('active');
    const augmented = Object.assign({}, hubData || {}, { _learnTabActive: isActive });
    this._lastHub = augmented;
    if (!this._mounted) {
      this._tabGroup.render(augmented);
      this.container.addEventListener('learn:nav', this._navListener);
      this._mounted = true;
    } else {
      this._tabGroup.renderActive(augmented);
    }
  }

  destroy() {
    if (this._mounted && this.container) {
      try { this.container.removeEventListener('learn:nav', this._navListener); }
      catch (_e) { /* ignore */ }
    }
    this._tabGroup.destroy();
    this._mounted = false;
    this._lastHub = null;
  }

  // Cross-link routing: the `learn:nav` CustomEvent bubbles to this container
  // from sub-view internals (e.g., Read essay → Reference or Glossary anchor).
  // Listener is preserved as forward-compat infrastructure for the follow-up
  // Practice plan ("zoom-in evaluator"); v1 has no `tab: 'practice'` consumer
  // so practice-target events silently no-op.
  _handleNav(evt) {
    const detail = (evt && evt.detail) || {};
    const target = detail.tab;
    if (target !== 'read' && target !== 'glossary') return;
    if (target !== this._tabGroup.activeKey) {
      this._tabGroup.switchTo(target, this._lastHub);
    }
  }
}

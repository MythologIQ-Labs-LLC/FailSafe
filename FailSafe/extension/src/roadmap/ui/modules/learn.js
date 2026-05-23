// FailSafe Command Center — Learn tab renderer (FailSafe Learn v2).
//
// RD-3: tab-host renderer. The Learn tab is the primary surface for the
// FailSafe Learn — Software Development Craft component. It composes:
//   (1) the SWE-craft essay list (primary content; always-renders curriculum
//       directory) — sorted with contextual-trigger-relevant essays first;
//   (2) the FailSafe Glossary (secondary reference) — relocated here from
//       the v1 Settings tab.
//
// Contextual surfacing uses the pure trigger engine in
// `src/education/lessonTriggers.ts`: evaluator → applyCaps. Inputs come from
// the hub payload (`activePlan`, `recentCheckpoints`, `unattributedFileActivity`)
// plus webview-only sessionStorage state (session start + per-anchor nudge
// counts + per-anchor "Mark as read" dismissals). All three are
// **session-scoped (sessionStorage)**, NOT persistent — the cap budgets
// reset on webview reload, which is the intended "per session" semantic.
// Session-duration timing is **client-side only** — never transmitted
// server-side (GDPR binding contract).

import { renderEssayList, bindEssayAck } from './learn-essay-list.js';
import { renderGlossary } from './education-glossary.js';
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
  } catch (_e) { /* sessionStorage access can throw in sandboxed contexts */ }
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
  } catch (_e) {
    return null;
  }
}

function readNudgeCounts() {
  const out = {};
  const store = getSessionStore();
  if (!store) return out;
  for (const anchor of NUDGE_ANCHORS) {
    try {
      const raw = store.getItem(NUDGE_COUNT_PREFIX + anchor);
      const n = raw == null ? 0 : parseInt(raw, 10);
      out[anchor] = Number.isFinite(n) && n >= 0 ? n : 0;
    } catch (_e) {
      out[anchor] = 0;
    }
  }
  return out;
}

function readDismissedFlags() {
  const out = {};
  const store = getSessionStore();
  if (!store) return out;
  for (const anchor of NUDGE_ANCHORS) {
    try {
      out[anchor] = store.getItem(NUDGE_DISMISSED_PREFIX + anchor) === '1';
    } catch (_e) {
      out[anchor] = false;
    }
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

export class LearnRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this._lastHub = {};
  }

  render(hubData) {
    if (!this.container) return;
    if (hubData && Object.keys(hubData).length) this._lastHub = hubData;
    const hub = this._lastHub;
    const education = hub.education || {};

    // When education is disabled, render the (empty) gated surface and return
    // BEFORE evaluating triggers / consuming the per-session cap budget. The
    // user is not seeing any cards, so an invisible cap consumption would
    // burn the 1-per-anchor / 2-per-session budget silently and starve the
    // first legitimate badge after re-enabling.
    if (!education.enabled) {
      this.container.innerHTML = `
        ${renderEssayList({ enabled: false })}
        ${renderGlossary(education)}`;
      return;
    }

    // Only consume the nudge budget when the Learn tab is the *visible* tab.
    // The host fan-out (`command-center.js`) routes every hub tick to every
    // renderer; if we incremented counts here while the Learn panel is hidden,
    // a matching nudge could be counted (and then suppressed by the cap)
    // before the user has ever seen it. The tab-click handler re-invokes
    // `render` after adding `.active` to the panel, so the first visible
    // render after activation is where the relevant-now badge + count
    // increment legitimately land.
    const isActive = this.container.classList.contains('active');
    const proficiency = education.proficiency || 'beginner';

    if (!isActive) {
      // Pre-render the curriculum directory (so opening the tab is instant)
      // with NO trigger results and NO count increments.
      this.container.innerHTML = `
        ${renderEssayList({ enabled: true, proficiency, triggerResults: [] })}
        ${renderGlossary(education)}`;
      bindEssayAck(this.container);
      return;
    }

    const triggerInput = buildTriggerInput(hub);
    const triggerResults = applyCaps(evaluateTriggers(triggerInput), triggerInput);

    this.container.innerHTML = `
      ${renderEssayList({ enabled: true, proficiency, triggerResults })}
      ${renderGlossary(education)}`;

    bindEssayAck(this.container);

    // Persist that these anchors surfaced this session so the per-session
    // cap actually limits re-fires across subsequent hub updates. (Without
    // this the cap collapses to "max-per-render" and the same nudges
    // re-appear every hub cycle.)
    for (const r of triggerResults) incrementNudgeCount(r.anchor);
  }

  destroy() {
    if (this.container) this.container.innerHTML = '';
    this._lastHub = {};
  }
}

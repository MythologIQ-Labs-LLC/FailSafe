// Cross-component coherence test for the build-phase track (FX-MONITOR-COHERENCE).
//
// Pattern reference: monitor-state-coherence.test.ts.
//
// The Monitor paints (a) a phase-title heading ("PLAN" | "AUDIT" | etc.),
// (b) a phase-track of step chips with one carrying class "active", and (c)
// a "Recommended Next Step" copy line. The three must agree. The class of
// contradiction this guard catches: phase-title says AUDIT while phase-track
// shows PLAN as the active step.
//
// JSDOM-based: load actual HTML, paint phase-track fragment, run detector.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

interface PhasePaintedState {
  phaseTitle: string;
  activeStep: string;
  nextStep: string;
}

const PHASES = ['PLAN', 'AUDIT', 'IMPLEMENT', 'SUBSTANTIATE', 'RELEASE'];

function loadMonitorHtml(): JSDOM {
  const htmlPath = path.join(
    __dirname, '..', '..', '..', 'src', 'roadmap', 'ui', 'index.html',
  );
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const stripped = html
    .replace(/<link[^>]*>/g, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  return new JSDOM(stripped);
}

function paintPhaseTrack(doc: Document, title: string, activePhase: string, nextStep: string): void {
  const titleEl = doc.getElementById('phase-title');
  const trackEl = doc.getElementById('phase-track');
  const nextEl = doc.getElementById('next-step');
  if (!titleEl || !trackEl || !nextEl) {
    throw new Error('phase-* nodes missing from index.html');
  }
  titleEl.textContent = title;
  trackEl.innerHTML = PHASES.map((p) => {
    const status = p === activePhase ? 'active' : 'pending';
    return `<div class="step ${status}">${p}</div>`;
  }).join('');
  nextEl.textContent = nextStep;
}

function readPainted(doc: Document): PhasePaintedState {
  const activeEl = doc.querySelector('#phase-track .step.active');
  return {
    phaseTitle: doc.getElementById('phase-title')?.textContent?.trim() ?? '',
    activeStep: activeEl?.textContent?.trim() ?? '',
    nextStep: doc.getElementById('next-step')?.textContent?.trim() ?? '',
  };
}

interface CoherenceVerdict { coherent: boolean; reason?: string; }

function detectPhaseCoherence(state: PhasePaintedState): CoherenceVerdict {
  if (!state.phaseTitle || !state.activeStep) {
    return { coherent: true }; // empty defaults are not contradictory
  }
  const titleUpper = state.phaseTitle.toUpperCase();
  const activeUpper = state.activeStep.toUpperCase();
  if (titleUpper !== activeUpper) {
    return {
      coherent: false,
      reason: `phase-title="${state.phaseTitle}" != active-step="${state.activeStep}"`,
    };
  }
  if (state.nextStep && !state.nextStep.toUpperCase().includes(activeUpper)
    && !/continue|next|complete/i.test(state.nextStep)) {
    return {
      coherent: false,
      reason: `next-step copy "${state.nextStep}" does not reference active phase "${state.activeStep}"`,
    };
  }
  return { coherent: true };
}

suite('Build-phase cross-component coherence (FX-MONITOR-COHERENCE)', () => {
  test('initial HTML defaults are coherent (PLAN title, no active painted yet)', () => {
    const dom = loadMonitorHtml();
    const verdict = detectPhaseCoherence(readPainted(dom.window.document));
    assert.equal(verdict.coherent, true,
      `default state must be coherent. Reason: ${verdict.reason ?? 'n/a'}`);
  });

  test('coherent state — AUDIT title + AUDIT active + AUDIT-referencing next step', () => {
    const dom = loadMonitorHtml();
    paintPhaseTrack(dom.window.document, 'AUDIT', 'AUDIT', 'Continue AUDIT until clean.');
    const state = readPainted(dom.window.document);
    assert.equal(state.activeStep, 'AUDIT');
    const verdict = detectPhaseCoherence(state);
    assert.equal(verdict.coherent, true,
      `AUDIT-aligned state must be coherent. Reason: ${verdict.reason ?? 'n/a'}`);
  });

  test('coherent state — IMPLEMENT title + IMPLEMENT active + generic next-step copy', () => {
    const dom = loadMonitorHtml();
    paintPhaseTrack(dom.window.document, 'IMPLEMENT', 'IMPLEMENT', 'Continue the active build phase.');
    const verdict = detectPhaseCoherence(readPainted(dom.window.document));
    assert.equal(verdict.coherent, true,
      `IMPLEMENT-aligned state must be coherent. Reason: ${verdict.reason ?? 'n/a'}`);
  });

  test('detector trips — force-paint AUDIT title + PLAN active step contradicts', () => {
    const dom = loadMonitorHtml();
    paintPhaseTrack(dom.window.document, 'AUDIT', 'PLAN', 'Continue PLAN.');
    const state = readPainted(dom.window.document);
    const verdict = detectPhaseCoherence(state);
    assert.equal(verdict.coherent, false,
      'detector must flag title/active-step contradiction');
    assert.match(verdict.reason ?? '', /AUDIT[\s\S]*PLAN|PLAN[\s\S]*AUDIT/,
      'reason should reference both title and active step');
  });
});

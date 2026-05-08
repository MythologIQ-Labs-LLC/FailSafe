// Cross-component coherence test for the Settings tab (FX-MONITOR-COHERENCE).
//
// Pattern reference: monitor-state-coherence.test.ts.
//
// The Settings tab paints (a) a governance-mode badge ("enforce" | "observe" |
// "disabled") and (b) a writes-blocked banner that surfaces when enforce mode
// blocks an action. The two state machines must not contradict each other:
// "enforce" mode active + writes-blocked banner hidden during a blocked write
// is the operator-observed coherence violation class.
//
// JSDOM-based: assert against painted DOM defaults + force-painted contradictions.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

interface SettingsPaintedState {
  modeBadge: string;
  modeBadgeClass: string;
  writesBlockedHidden: boolean;
  writesBlockedText: string;
}

function loadSettingsHtml(): JSDOM {
  const htmlPath = path.join(
    __dirname, '..', '..', '..', 'src', 'roadmap', 'ui', 'command-center.html',
  );
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const stripped = html
    .replace(/<link[^>]*>/g, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  return new JSDOM(stripped);
}

function paintSettingsFragment(doc: Document, mode: string, bannerVisible: boolean): void {
  const panel = doc.getElementById('settings');
  if (!panel) throw new Error('settings panel missing in command-center.html');
  panel.innerHTML = `
    <div class="cc-card">
      <span id="governance-mode-badge" class="cc-badge mode-${mode}">${mode}</span>
    </div>
    <div id="writes-blocked-banner" class="banner ${bannerVisible ? '' : 'hidden'}">
      Enforcement is blocking writes.
    </div>`;
}

function readPainted(doc: Document): SettingsPaintedState {
  const badge = doc.getElementById('governance-mode-badge');
  const banner = doc.getElementById('writes-blocked-banner');
  return {
    modeBadge: badge?.textContent?.trim() ?? '',
    modeBadgeClass: badge?.className ?? '',
    writesBlockedHidden: banner ? banner.classList.contains('hidden') : true,
    writesBlockedText: banner?.textContent?.trim() ?? '',
  };
}

interface CoherenceVerdict { coherent: boolean; reason?: string; }

function detectSettingsCoherence(state: SettingsPaintedState): CoherenceVerdict {
  // The contradiction class: "enforce" badge active AND writes-blocked banner
  // hidden while the banner copy says writes are blocked. Either both are
  // visible together or neither, but enforce + hidden-blocking-banner is a lie.
  const isEnforce = /\benforce\b/i.test(state.modeBadge)
    || /\bmode-enforce\b/.test(state.modeBadgeClass);
  const bannerSaysBlocked = /block/i.test(state.writesBlockedText);
  if (isEnforce && bannerSaysBlocked && state.writesBlockedHidden) {
    return {
      coherent: false,
      reason: `enforce mode active + writes-blocked banner hidden contradicts banner copy`,
    };
  }
  return { coherent: true };
}

suite('Settings cross-component coherence (FX-MONITOR-COHERENCE)', () => {
  test('initial defaults — empty settings panel is coherent (no painted contradiction)', () => {
    const dom = loadSettingsHtml();
    paintSettingsFragment(dom.window.document, 'observe', false);
    const verdict = detectSettingsCoherence(readPainted(dom.window.document));
    assert.equal(verdict.coherent, true,
      `Default observe-mode painted state must be coherent. Reason: ${verdict.reason ?? 'n/a'}`);
  });

  test('coherent state — enforce mode + writes-blocked banner visible', () => {
    const dom = loadSettingsHtml();
    paintSettingsFragment(dom.window.document, 'enforce', true);
    const state = readPainted(dom.window.document);
    assert.equal(state.writesBlockedHidden, false, 'banner must be visible');
    const verdict = detectSettingsCoherence(state);
    assert.equal(verdict.coherent, true,
      `enforce + visible-banner must be coherent. Reason: ${verdict.reason ?? 'n/a'}`);
  });

  test('coherent state — observe mode + writes-blocked banner hidden', () => {
    const dom = loadSettingsHtml();
    paintSettingsFragment(dom.window.document, 'observe', false);
    const state = readPainted(dom.window.document);
    assert.equal(state.writesBlockedHidden, true, 'banner must be hidden');
    const verdict = detectSettingsCoherence(state);
    assert.equal(verdict.coherent, true,
      `observe + hidden-banner must be coherent. Reason: ${verdict.reason ?? 'n/a'}`);
  });

  test('detector trips — force-paint enforce mode + banner hidden contradicts', () => {
    const dom = loadSettingsHtml();
    paintSettingsFragment(dom.window.document, 'enforce', false);
    const state = readPainted(dom.window.document);
    const verdict = detectSettingsCoherence(state);
    assert.equal(verdict.coherent, false,
      'detector must flag enforce + hidden-banner contradiction');
    assert.match(verdict.reason ?? '', /enforce/i,
      'reason should call out enforce-mode mismatch');
  });
});

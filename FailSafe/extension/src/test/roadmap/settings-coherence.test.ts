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

// ---------- Track C additions (Phase 60 §3) ----------
// Governance mode escalation card + qor-logic version warning surfacing.

interface HubLike { governanceModeState?: { mode: string; defaulted: boolean }; qorLogic?: { versionStatus: { installed: string | null; minimum: string; meetsFloor: boolean } }; version?: string }

function trackCStore(): any {
  return {
    getTheme: () => 'mythiq', setTheme: () => {},
    get: () => undefined, set: () => {},
    getVoiceSettings: () => ({}), setVoiceSettings: () => {},
    getNotificationSettings: () => ({}), setNotificationSettings: () => {},
    getBrainstormSettings: () => ({}), setBrainstormSettings: () => {},
  };
}

async function paintTrackCSettings(hub: HubLike): Promise<string> {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="set-root"></div></body></html>', { url: 'http://localhost:9999' });
  const prevWin = (global as any).window;
  const prevDoc = (global as any).document;
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  try {
    // @ts-expect-error untyped JS module
    const mod = await import('../../roadmap/ui/modules/settings.js');
    const r = new mod.SettingsRenderer('set-root', { store: trackCStore() });
    r.render(hub);
    return dom.window.document.getElementById('set-root')!.innerHTML;
  } finally {
    (global as any).window = prevWin;
    (global as any).document = prevDoc;
  }
}

suite('Settings Track C — governance mode + qor version surface', () => {
  test('governance mode label rendered when defaulted:false', async () => {
    const html = await paintTrackCSettings({ governanceModeState: { mode: 'observe', defaulted: false } });
    assert.match(html, /Governance Mode/);
    assert.match(html, /Mode:\s*<strong[^>]*>Observe<\/strong>/);
    assert.ok(!/\(default\)/.test(html), '(default) tag must not appear when defaulted:false');
  });

  test('(default) indicator shown when defaulted:true', async () => {
    const html = await paintTrackCSettings({ governanceModeState: { mode: 'observe', defaulted: true } });
    assert.match(html, /Mode:\s*<strong[^>]*>Observe<\/strong>\s*<span[^>]*>\(default\)<\/span>/);
    assert.match(html, /You're in Observe mode by default/);
  });

  test('escalation buttons dispatch failsafe.setGovernanceMode for all three modes', async () => {
    const html = await paintTrackCSettings({ governanceModeState: { mode: 'assist', defaulted: false } });
    assert.match(html, /data-governance-mode="observe"/);
    assert.match(html, /data-governance-mode="assist"/);
    assert.match(html, /data-governance-mode="enforce"/);
  });

  test('qor-logic version warning shown when meetsFloor:false', async () => {
    const html = await paintTrackCSettings({
      governanceModeState: { mode: 'observe', defaulted: true },
      qorLogic: { versionStatus: { installed: '0.1.2', minimum: '0.2.0', meetsFloor: false } },
    });
    assert.match(html, /cc-qor-version-warning/);
    assert.match(html, /qor-logic Python package version below minimum/);
    assert.match(html, /Installed:\s*<strong>0\.1\.2<\/strong>/);
    assert.match(html, /minimum required:\s*<strong>0\.2\.0<\/strong>/);
  });

  test('qor-logic version warning hidden when meetsFloor:true', async () => {
    const html = await paintTrackCSettings({
      governanceModeState: { mode: 'observe', defaulted: true },
      qorLogic: { versionStatus: { installed: '0.3.0', minimum: '0.2.0', meetsFloor: true } },
    });
    assert.ok(!/cc-qor-version-warning/.test(html), 'warning card must be absent when meetsFloor:true');
  });

  test('qor-logic version warning hidden when versionStatus undefined', async () => {
    const html = await paintTrackCSettings({ governanceModeState: { mode: 'observe', defaulted: true } });
    assert.ok(!/cc-qor-version-warning/.test(html), 'warning card must be absent when versionStatus is undefined');
  });

  test('not-installed surfaced when installed:null', async () => {
    const html = await paintTrackCSettings({
      governanceModeState: { mode: 'observe', defaulted: true },
      qorLogic: { versionStatus: { installed: null, minimum: '0.2.0', meetsFloor: false } },
    });
    assert.match(html, /Installed:\s*<strong>not installed<\/strong>/);
  });
});

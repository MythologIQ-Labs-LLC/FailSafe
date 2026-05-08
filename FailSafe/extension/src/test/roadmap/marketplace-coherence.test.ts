// Cross-component coherence test for marketplace cards (FX-MONITOR-COHERENCE).
//
// Pattern reference: monitor-state-coherence.test.ts.
//
// Each marketplace card paints (a) item.status (e.g. "installed",
// "quarantined", "not-installed"), (b) a trust-tier badge, and (c) an
// install/uninstall button label. The contradiction class: status="installed"
// but the action button still says "Install" — the operator-observed UI lie.
//
// JSDOM-based: load actual HTML, paint a card fragment matching the shapes
// that marketplace.js renderCard() produces, then run detector.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

interface CardPaintedState {
  status: string;          // value of cc-badge text near card head
  trustTier: string;       // text of trust-tier badge
  buttonLabel: string;     // primary action button text
}

function loadCommandCenterHtml(): JSDOM {
  const htmlPath = path.join(
    __dirname, '..', '..', '..', 'src', 'roadmap', 'ui', 'command-center.html',
  );
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const stripped = html
    .replace(/<link[^>]*>/g, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  return new JSDOM(stripped);
}

function buttonForStatus(status: string): string {
  if (status === 'installed') return 'Uninstall';
  if (status === 'quarantined') return 'Remove';
  if (status === 'installing' || status === 'scanning') return 'Installing...';
  return 'Install';
}

function paintMarketplaceCard(doc: Document, status: string, trust: string, button: string): void {
  // Paint into the workspace tab-panel as a synthetic marketplace grid.
  const slot = doc.getElementById('workspace');
  if (!slot) throw new Error('workspace panel missing in command-center.html');
  slot.innerHTML = `
    <div class="cc-marketplace-grid cc-grid-2">
      <div class="cc-card cc-marketplace-card" data-id="agent-x">
        <div class="card-head">
          <strong>Agent X</strong>
          <span class="cc-badge cc-status-badge">${status}</span>
          <span class="cc-badge cc-trust-badge trust-${trust}">${trust}</span>
        </div>
        <div class="card-actions">
          <button class="cc-btn cc-btn--small cc-marketplace-action">${button}</button>
        </div>
      </div>
    </div>`;
}

function readPainted(doc: Document): CardPaintedState {
  const card = doc.querySelector('.cc-marketplace-card');
  return {
    status: card?.querySelector('.cc-status-badge')?.textContent?.trim() ?? '',
    trustTier: card?.querySelector('.cc-trust-badge')?.textContent?.trim() ?? '',
    buttonLabel: card?.querySelector('.cc-marketplace-action')?.textContent?.trim() ?? '',
  };
}

interface CoherenceVerdict { coherent: boolean; reason?: string; }

function detectMarketplaceCoherence(state: CardPaintedState): CoherenceVerdict {
  // Status -> action-button label is a one-way derivable pair. If they
  // disagree, the user is being lied to. Mirrors the renderCard branches
  // at marketplace.js:166-177.
  if (!state.status) return { coherent: true };
  const expected = buttonForStatus(state.status);
  if (state.buttonLabel !== expected) {
    return {
      coherent: false,
      reason: `status="${state.status}" but button label="${state.buttonLabel}" (expected "${expected}")`,
    };
  }
  // Trust badge cross-check: quarantined cards must not display "verified".
  if (state.status === 'quarantined' && /verified/i.test(state.trustTier)) {
    return {
      coherent: false,
      reason: `quarantined card displays verified trust tier — contradiction`,
    };
  }
  return { coherent: true };
}

suite('Marketplace cross-component coherence (FX-MONITOR-COHERENCE)', () => {
  test('coherent state — installed + Uninstall button + verified trust tier', () => {
    const dom = loadCommandCenterHtml();
    paintMarketplaceCard(dom.window.document, 'installed', 'verified', 'Uninstall');
    const verdict = detectMarketplaceCoherence(readPainted(dom.window.document));
    assert.equal(verdict.coherent, true,
      `installed/Uninstall must be coherent. Reason: ${verdict.reason ?? 'n/a'}`);
  });

  test('coherent state — quarantined + Remove button + community trust tier', () => {
    const dom = loadCommandCenterHtml();
    paintMarketplaceCard(dom.window.document, 'quarantined', 'community', 'Remove');
    const verdict = detectMarketplaceCoherence(readPainted(dom.window.document));
    assert.equal(verdict.coherent, true,
      `quarantined/Remove must be coherent. Reason: ${verdict.reason ?? 'n/a'}`);
  });

  test('coherent state — not-installed + Install button', () => {
    const dom = loadCommandCenterHtml();
    paintMarketplaceCard(dom.window.document, 'not-installed', 'community', 'Install');
    const verdict = detectMarketplaceCoherence(readPainted(dom.window.document));
    assert.equal(verdict.coherent, true,
      `not-installed/Install must be coherent. Reason: ${verdict.reason ?? 'n/a'}`);
  });

  test('detector trips — installed status + Install button label contradicts', () => {
    const dom = loadCommandCenterHtml();
    paintMarketplaceCard(dom.window.document, 'installed', 'verified', 'Install');
    const state = readPainted(dom.window.document);
    const verdict = detectMarketplaceCoherence(state);
    assert.equal(verdict.coherent, false,
      'detector must flag installed/Install contradiction');
    assert.match(verdict.reason ?? '', /installed[\s\S]*Install/,
      'reason should call out the status/button mismatch');
  });
});

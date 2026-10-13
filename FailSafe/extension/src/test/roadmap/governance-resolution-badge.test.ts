// FX947 (#367 tranche 3c review) — resolutionBadge() must style every
// ResolutionState AuditResolutionProjector can emit, including the new
// SUPERSEDED value this tranche added. A missing entry silently falls
// through to the generic "Unknown"/muted-gray fallback instead of a
// designed label — the exact gap an independent adversarial review found
// in this tranche's first push.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { GovernanceRenderer } from '../../roadmap/ui/modules/governance.js';

function withDom<T>(fn: () => T): T {
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  const prev = (global as { document?: unknown }).document;
  (global as { document: unknown }).document = dom.window.document;
  try { return fn(); } finally { (global as { document: unknown }).document = prev; }
}

function badgeFor(state: string | undefined): string {
  return withDom(() => {
    const renderer = new GovernanceRenderer('nonexistent-container', {});
    return renderer.resolutionBadge(state);
  });
}

suite('FX947 governance.js resolutionBadge() covers every ResolutionState', () => {
  test('SUPERSEDED gets a designed label, not the raw enum text', () => {
    const html = badgeFor('SUPERSEDED');
    assert.match(html, /Superseded \(re-scan clean\)/);
    assert.doesNotMatch(html, />SUPERSEDED</);
  });

  test('SUPERSEDED is styled distinctly from DECIDED_REJECTED (both would otherwise read as "resolved-and-gray")', () => {
    const superseded = badgeFor('SUPERSEDED');
    const rejected = badgeFor('DECIDED_REJECTED');
    const bgOf = (html: string) => html.match(/background:([^;]+);/)?.[1];
    assert.notEqual(bgOf(superseded), bgOf(rejected));
  });

  test('every other known ResolutionState still renders its own designed label (regression guard)', () => {
    assert.match(badgeFor('LIVE'), />Live</);
    assert.match(badgeFor('ESCALATED_UNDECIDED'), />Escalated · awaiting decision</);
    assert.match(badgeFor('DECIDED_APPROVED'), />Approved \(override\)</);
    assert.match(badgeFor('DECIDED_REJECTED'), />Rejected</);
  });

  test('an unknown/future state still falls back honestly instead of throwing', () => {
    const html = badgeFor('SOME_FUTURE_STATE');
    assert.match(html, />SOME_FUTURE_STATE</);
  });

  test('undefined state (no resolution computed) falls back to "Unknown"', () => {
    assert.match(badgeFor(undefined), />Unknown</);
  });
});

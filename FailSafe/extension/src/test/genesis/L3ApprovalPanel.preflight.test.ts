// FX557 — Phase 3 of plan-qor-b-int-2-preflight-l3 (B-INT-2).
// formatPreflightConflicts: returns escaped conflict-line HTML for drifted
// decisions, '' when there is no preflight evidence, escapes HTML
// metacharacters in decision titles.

import { strict as assert } from 'assert';
import { formatPreflightConflicts } from '../../genesis/panels/L3ApprovalPanel';

suite('L3ApprovalPanel.formatPreflightConflicts (FX557)', () => {
  test('drifted decision → HTML containing the title inside a conflict container', () => {
    const html = formatPreflightConflicts({
      preflight: { driftedDecisions: [{ decisionId: 'd1', title: 'X' }] },
    });
    assert.ok(html.includes('X'), html);
    assert.ok(html.includes('preflight-conflict'), html);
  });

  test('empty object and undefined → empty string', () => {
    assert.equal(formatPreflightConflicts({}), '');
    assert.equal(formatPreflightConflicts(undefined), '');
  });

  test('title with HTML metacharacters is escaped in the output', () => {
    const html = formatPreflightConflicts({
      preflight: { driftedDecisions: [{ decisionId: 'd1', title: '<script>alert(1)</script>' }] },
    });
    assert.ok(!html.includes('<script>'), `raw <script> present: ${html}`);
    assert.ok(html.includes('&lt;script&gt;'), `expected escaped marker missing: ${html}`);
  });
});

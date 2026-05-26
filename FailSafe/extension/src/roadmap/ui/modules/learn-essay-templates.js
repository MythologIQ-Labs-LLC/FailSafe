// FailSafe Command Center — Learn-tab essay templates (Section 4 razor split).
//
// Leaf data module — no DOM, no imports. Extracted from `learn-essay-list.js`
// to keep that renderer under the 250L razor. Hosts the two operator-binding
// templates rendered per-anchor: the acceptance-criteria template and the
// 6-row option-evaluation table.
//
// Operator-binding wording per the research-brief Codex addendum — these
// strings are operator-owned content. Templates render as inline callouts on
// the essay card (no `<details>` wrapper).

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const ACCEPTANCE_TEMPLATE =
  'I am changing [specific behavior] for [user/context] so that [outcome].\n' +
  'It is done when [observable condition 1], [observable condition 2], and ' +
  '[non-goal/risk boundary].\n' +
  'I will verify it by [command/manual check] and by checking [edge case].';

const OPTION_TABLE_ROWS = [
  ['Which option is smallest?', 'Smaller changes are easier to understand, test, and undo.'],
  ['Which option changes the fewest files?', 'More touched files usually means more blast radius.'],
  ['Which option adds dependencies or config?', 'Dependencies and config changes create maintenance and security risk.'],
  ['Which option can I verify clearly?', 'If the check is unclear, the option is not ready.'],
  ['Which option can I explain back?', 'If you cannot explain it, ask the agent for a smaller or clearer option.'],
  ['Which option is easiest to reverse?', 'Reversibility matters when the agent is wrong.'],
];

/**
 * Return the inline-template HTML for an essay anchor that owns one, or '' for
 * essays without a template. The `.cc-learn-essay-template` class and the
 * `.cc-learn-option-table` class are preserved for back-compat with existing
 * CSS + FX609 test assertions.
 *
 * @param {string} anchor  essay anchor (e.g. `learn.essay.acceptance-criteria`).
 * @returns {string} inline-callout HTML, or '' for anchors without a template.
 */
export function renderTemplate(anchor) {
  if (anchor === 'learn.essay.acceptance-criteria') {
    return [
      '<aside class="cc-learn-essay-template cc-learn-essay-template--inset" aria-label="Acceptance-criteria template">',
      '<h4 class="cc-learn-essay-template-title">Acceptance-criteria template</h4>',
      '<button type="button" class="cc-learn-essay-template-copy" data-acceptance-copy aria-label="Copy template to clipboard">Copy</button>',
      `<pre><code>${escapeHtml(ACCEPTANCE_TEMPLATE)}</code></pre>`,
      '</aside>',
    ].join('');
  }
  if (anchor === 'learn.essay.choose-agent-option') {
    const rows = OPTION_TABLE_ROWS.map(
      ([q, why]) =>
        `<tr><td>${escapeHtml(q)}</td><td>${escapeHtml(why)}</td></tr>`,
    ).join('');
    return [
      '<aside class="cc-learn-essay-template cc-learn-essay-template--inset" aria-label="Option-evaluation table">',
      '<h4 class="cc-learn-essay-template-title">Option-evaluation table</h4>',
      '<table class="cc-learn-option-table"><thead><tr><th>Question</th><th>Why it matters</th></tr></thead>',
      `<tbody>${rows}</tbody></table>`,
      '</aside>',
    ].join('');
  }
  return '';
}

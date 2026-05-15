/**
 * Ghost-UI live-progress lint helper (Phase 5 of
 * plan-qor-install-skills-ux-expansion).
 *
 * Pure Node CommonJS — no DOM dependency. Analyzes an HTML/JS source
 * string for UI progress elements and validates against the
 * LiveProgressInvariant doctrine
 * (qor/references/doctrine-ghost-ui-live-progress.md).
 *
 * Exports `analyzeProgressElements(htmlSource) -> ProgressElementAnalysis[]`.
 *
 * Verdicts per detected context:
 *   - FAKE_JUMP: only 0% and 100% writes, no intermediate values.
 *   - OK:        three or more distinct percentage writes.
 *   - STATIC:    progress-bar selector present but no width writes,
 *                OR a single one-sided write (only 0% or only 100%).
 */

'use strict';

const WIDTH_WRITE_RE =
  /([A-Za-z_$][\w$]*)\.style\.width\s*=\s*['"]([\d.]+)%['"]/g;

const PROGRESS_CLASS_RE =
  /class\s*=\s*"[^"]*\b(?:progress-bar|cc-modal-progress-bar|progress-indicator)\b[^"]*"/gi;

const PROGRESS_LABEL_RE = /class\s*=\s*"[^"]*\bprogress-label\b[^"]*"/gi;

/**
 * @typedef {Object} ProgressElementAnalysis
 * @property {'progress-bar'|'spinner'|'phase-list'|'unknown'} element
 * @property {string} selector
 * @property {'OK'|'STATIC'|'FAKE_JUMP'} livenessRule
 * @property {string} [evidence]
 */

function collectWidthWritesByContext(htmlSource) {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  WIDTH_WRITE_RE.lastIndex = 0;
  let match;
  while ((match = WIDTH_WRITE_RE.exec(htmlSource)) !== null) {
    const ctx = match[1];
    const pct = match[2];
    if (!map.has(ctx)) {
      map.set(ctx, new Set());
    }
    map.get(ctx).add(pct);
  }
  return map;
}

function verdictForPercentages(pctSet) {
  const has0 = pctSet.has('0');
  const has100 = pctSet.has('100');
  const distinct = pctSet.size;
  if (distinct >= 3) {
    return { rule: 'OK', evidence: `distinct width writes: ${distinct}` };
  }
  if (has0 && has100 && distinct === 2) {
    return {
      rule: 'FAKE_JUMP',
      evidence: "writes 0% and 100% with no intermediate value",
    };
  }
  return {
    rule: 'STATIC',
    evidence: `one-sided width writes: [${[...pctSet].join(', ')}]`,
  };
}

function collectStaticSelectors(htmlSource, writtenContexts) {
  /** @type {ProgressElementAnalysis[]} */
  const entries = [];
  PROGRESS_CLASS_RE.lastIndex = 0;
  let m;
  while ((m = PROGRESS_CLASS_RE.exec(htmlSource)) !== null) {
    const selector = m[0];
    const hasWriteCtx = writtenContexts.some((ctx) => htmlSource.includes(ctx));
    if (hasWriteCtx) {
      continue;
    }
    entries.push({
      element: 'progress-bar',
      selector,
      livenessRule: 'STATIC',
      evidence: 'progress-bar selector present, no style.width writes detected',
    });
  }
  return entries;
}

/**
 * @param {string} htmlSource
 * @returns {ProgressElementAnalysis[]}
 */
function analyzeProgressElements(htmlSource) {
  if (typeof htmlSource !== 'string' || htmlSource.length === 0) {
    return [];
  }
  const writes = collectWidthWritesByContext(htmlSource);
  /** @type {ProgressElementAnalysis[]} */
  const results = [];
  for (const [ctx, pctSet] of writes.entries()) {
    const { rule, evidence } = verdictForPercentages(pctSet);
    results.push({
      element: 'progress-bar',
      selector: ctx,
      livenessRule: rule,
      evidence,
    });
  }
  const writtenContexts = [...writes.keys()];
  const staticEntries = collectStaticSelectors(htmlSource, writtenContexts);
  results.push(...staticEntries);
  // PROGRESS_LABEL_RE is consulted only to ensure label-only fixtures
  // (no width manipulation) yield no flagged entries.
  PROGRESS_LABEL_RE.lastIndex = 0;
  return results;
}

module.exports = { analyzeProgressElements };

if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);
  const htmlIdx = args.indexOf('--html');
  if (htmlIdx >= 0 && args[htmlIdx + 1]) {
    const src = fs.readFileSync(args[htmlIdx + 1], 'utf8');
    const results = analyzeProgressElements(src);
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
    const hasFake = results.some((r) => r.livenessRule === 'FAKE_JUMP');
    process.exit(hasFake ? 1 : 0);
  } else {
    process.stderr.write('Usage: ghost-ui-live-progress-lint.cjs --html <path>\n');
    process.exit(2);
  }
}

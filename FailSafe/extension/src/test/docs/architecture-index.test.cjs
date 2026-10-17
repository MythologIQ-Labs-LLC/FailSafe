/**
 * FX1001 — docs/ARCHITECTURE_INDEX.md is the checked navigation spine for design intent (#530).
 *
 * Why this suite exists:
 * Issue #530 asks that a new contributor can go README -> index -> the canonical document, and that
 * an intentional duplicate architecture document fails validation with a link to the existing one.
 * `scripts/check-architecture-index.cjs` is that check. This suite holds it to every failure code it
 * claims: one in-memory fixture per code, each required to produce exactly that code, plus a clean
 * fixture that must produce none (a check that fired on everything would fail there), plus a golden
 * row against the real repository.
 *
 * The fixtures are plain text and a tracked-file list; no git is needed for them. Only the golden row
 * reads the repository and runs `git ls-files`.
 *
 * Runs standalone: node --test src/test/docs/architecture-index.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// src/test/docs -> src/test -> src -> extension -> FailSafe -> <repo root>
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'FailSafe', 'extension', 'scripts', 'check-architecture-index.cjs');
const checker = require(SCRIPT);

// Recorded at implementation (2026-10-17), from the real index and `git ls-files`.
const EXPECTED_GLOB_COUNT = 12;
const EXPECTED_NORMATIVE_COUNT = 9;
const TAIL = 'existing: docs/ARCHITECTURE_INDEX.md#registry';

const HEADER =
  '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';
const SEPARATOR = '|---|---|---|---|---|---|---|---|---|---|---|';

const ROW_NAV = [
  'architecture-navigation', 'architecture navigation', '[Architecture Index](ARCHITECTURE_INDEX.md)',
  'canonical', '/qor-plan', '-', '-', '[#530](https://github.com/example/repo/issues/530)', 'unknown',
  '`src/test/a.test.ts`', '/qor-plan',
];
const ROW_UI = [
  'ui-standard', 'ui standard', '[UI standard](ui/STANDARD.md)', 'canonical', '/qor-plan', '-',
  'architecture-navigation', '#101', '`src/a.ts`', 'unknown', '/qor-plan',
];
const ROW_GOV = [
  'governance-registry', 'governance registry', '[Governance Index](GOVERNANCE_INDEX.md)', 'descriptive',
  '/qor-substantiate', '-', '-', '-', 'unknown', 'unknown', '-',
];

const GLOBS = ['docs/ARCHITECTURE*.md', 'docs/ui/**/*.md', 'docs/architecture/**/*.md', 'docs/**/*_SPEC*.md'];
const LEGACY = ['docs/Planning/**'];
const TRACKED = [
  'README.md', 'docs/ARCHITECTURE_INDEX.md', 'docs/GOVERNANCE_INDEX.md', 'docs/ui/STANDARD.md',
  'docs/Planning/old.md', 'docs/Planning/ARCHITECTURE_SPEC_OLD.md', 'src/a.ts', 'src/test/a.test.ts',
];
const GOVERNANCE_ROWS = ['docs/ARCHITECTURE_INDEX.md', 'docs/ui/STANDARD.md'];
const README =
  '# Product\n\n**Developing?** Start with the [Architecture Index](docs/ARCHITECTURE_INDEX.md).\n\n## Install\n';

const tableRow = (cells) => '| ' + cells.join(' | ') + ' |';

function makeIndex({ rows = [ROW_NAV, ROW_UI, ROW_GOV], globs = GLOBS, legacy = LEGACY, prose = '' } = {}) {
  const lines = ['# Architecture Index', '', 'Governance lives in the [Governance Index](GOVERNANCE_INDEX.md).', prose, ''];
  lines.push('## Registry', '', HEADER, SEPARATOR, ...rows.map(tableRow), '');
  if (globs) lines.push('## Normative scope', '', '```architecture-normative', ...globs, '```', '');
  if (legacy) lines.push('## Legacy and historical documents', '', '```architecture-legacy', ...legacy, '```', '');
  return lines.join('\n');
}

function makeGovernance(registered = GOVERNANCE_ROWS, outOfTier = []) {
  const tier = registered.map((p) => `| \`${p}\` | purpose | owner |`);
  const out = outOfTier.map((p) => `| \`${p}\` | not governance |`);
  return ['# Governance Index', '', '## Tier 1 — Canonical Sources', '', '| Path | Purpose | Owner |', '|---|---|---|',
    ...tier, '', '## Out-of-tier paths', '', '| Path | What it is |', '|---|---|', ...out, ''].join('\n');
}

function fixture(over = {}) {
  return {
    indexText: makeIndex(over.index),
    readmeText: over.readmeText ?? README,
    governanceText: over.governanceText ?? makeGovernance(),
    tracked: over.tracked ?? TRACKED,
  };
}

const codesOf = (result) => [...new Set(result.problems.map((p) => p.code))].sort();
const lines = (result) => result.problems.map((p) => `${p.code}: ${p.detail}`);

function assertOnly(input, code) {
  const result = checker.validate(input);
  assert.deepEqual(codesOf(result), [code], `expected only ${code}, got:\n${lines(result).join('\n')}`);
  return result.problems;
}

const withRow = (cells, extra = {}) => fixture({ index: { rows: [ROW_NAV, ROW_UI, ROW_GOV, cells], ...extra } });
const replaceCell = (cells, column, value) => {
  const copy = cells.slice();
  copy[checker.COLUMNS.indexOf(column)] = value;
  return copy;
};

describe('FX1001 architecture index: glob matcher', () => {
  it('a single * never crosses a /', () => {
    assert.equal(checker.matchesGlob('docs/ARCHITECTURE*.md', 'docs/ARCHITECTURE_PLAN.md'), true);
    assert.equal(checker.matchesGlob('docs/ARCHITECTURE*.md', 'docs/architecture/NOTES.md'), false);
    assert.equal(checker.matchesGlob('docs/integrations/*STANDARD*.md', 'docs/integrations/x/A_STANDARD.md'), false);
  });

  it('**/ matches zero or more whole segments', () => {
    assert.equal(checker.matchesGlob('docs/**/*_SPEC*.md', 'docs/X_SPEC.md'), true);
    assert.equal(checker.matchesGlob('docs/**/*_SPEC*.md', 'docs/a/b/X_SPEC.md'), true);
    assert.equal(checker.matchesGlob('docs/**/*_SPEC*.md', 'docsX_SPEC.md'), false);
    assert.equal(checker.matchesGlob('docs/Planning/**', 'docs/Planning/a/b.md'), true);
  });

  it('matching is case-insensitive', () => {
    assert.equal(checker.matchesGlob('docs/design/**/*.md', 'DOCS/Design/Tracker.MD'), true);
    assert.equal(checker.matchesGlob('docs/**/*DESIGN*.md', 'docs/research/open_design_review.md'), true);
  });
});

describe('FX1001 architecture index: suggestions for an unregistered document', () => {
  it('ranks by shared tokens, then path, caps at five and always ends with the registry link', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x, i) => ({
      id: x, domain: 'x', status: 'descriptive', docPath: `docs/${x}/TRACKER${i === 6 ? '_UI_PANEL' : ''}.md`,
    }));
    const list = checker.suggestFor('docs/new/TRACKER_UI_PANEL.md', rows);
    assert.deepEqual(list, ['docs/g/TRACKER_UI_PANEL.md', 'docs/a/TRACKER.md', 'docs/b/TRACKER.md',
      'docs/c/TRACKER.md', 'docs/d/TRACKER.md']);
    assert.ok(checker.suggestionText(list).endsWith(TAIL));
    assert.ok(checker.suggestionText([]).endsWith(TAIL));
  });
});

describe('FX1001 architecture index: fixtures', () => {
  it('a clean fixture passes, and a legacy file matching a normative glob is not required', () => {
    const result = checker.validate(fixture());
    assert.deepEqual(lines(result), []);
    assert.deepEqual(result.normativeMatches, ['docs/ARCHITECTURE_INDEX.md', 'docs/ui/STANDARD.md']);
  });

  it('code 0 missing-section: no architecture-normative block', () => {
    assertOnly(fixture({ index: { globs: null } }), 'missing-section');
  });

  it('code 1 unregistered-normative: a duplicate in a directory with no canonical row gets token-matched suggestions', () => {
    const extra = ['wiki-nav', 'wiki navigation', '[nav](wiki/navigation-architecture-copy.md)', 'descriptive',
      '/qor-plan', '-', '-', '-', 'unknown', 'unknown', '-'];
    const input = withRow(extra);
    input.tracked = [...TRACKED, 'docs/wiki/navigation-architecture-copy.md', 'docs/architecture/ARCHITECTURE_NAVIGATION_COPY.md'];
    const [problem, ...rest] = assertOnly(input, 'unregistered-normative');
    assert.equal(rest.length, 0);
    assert.match(problem.detail, /^docs\/architecture\/ARCHITECTURE_NAVIGATION_COPY\.md /);
    assert.match(problem.detail, /suggestions: docs\/wiki\/navigation-architecture-copy\.md, docs\/ARCHITECTURE_INDEX\.md;/);
    assert.ok(problem.detail.endsWith(TAIL), problem.detail);
  });

  it('code 1 unregistered-normative: a new file beside a canonical row is pointed at that row', () => {
    const input = fixture({ tracked: [...TRACKED, 'docs/ui/PALETTE.md'] });
    const [problem] = assertOnly(input, 'unregistered-normative');
    assert.match(problem.detail, /suggestions: docs\/ui\/STANDARD\.md;/);
    assert.ok(problem.detail.endsWith(TAIL), problem.detail);
  });

  it('code 2 missing-path: a path-shaped contract that is not tracked', () => {
    assertOnly(fixture({ index: { rows: [ROW_NAV, replaceCell(ROW_UI, 'contract', '`src/missing.ts`'), ROW_GOV] } }), 'missing-path');
  });

  it('code 3 duplicate-id', () => {
    const dup = replaceCell(replaceCell(ROW_GOV, 'doc', '[Readme](../README.md)'), 'id', 'governance-registry');
    assertOnly(withRow(dup), 'duplicate-id');
  });

  it('code 4 duplicate-path', () => {
    assertOnly(withRow(replaceCell(ROW_GOV, 'id', 'governance-again')), 'duplicate-path');
  });

  it('code 5 conflicting-canonical: domains are compared after trim and lower-case, and both paths are named', () => {
    let rival = replaceCell(replaceCell(ROW_GOV, 'id', 'rival'), 'status', 'canonical');
    rival = replaceCell(replaceCell(replaceCell(rival, 'domain', 'ARCHITECTURE Navigation'), 'updated_by', '/qor-plan'), 'doc', '[Readme](../README.md)');
    const [problem] = assertOnly(withRow(rival), 'conflicting-canonical');
    assert.match(problem.detail, /docs\/ARCHITECTURE_INDEX\.md and README\.md/);
  });

  it('code 6 bad-status', () => {
    assertOnly(fixture({ index: { rows: [ROW_NAV, ROW_UI, replaceCell(ROW_GOV, 'status', 'active')] } }), 'bad-status');
  });

  it('code 7 bad-row: a wrong column count, and an empty updated_by on a canonical row', () => {
    assertOnly(fixture({ index: { rows: [ROW_NAV, ROW_UI, ROW_GOV.slice(0, 10)] } }), 'bad-row');
    assertOnly(fixture({ index: { rows: [ROW_NAV, replaceCell(ROW_UI, 'updated_by', ''), ROW_GOV] } }), 'bad-row');
  });

  it('code 8 dangling-ref', () => {
    assertOnly(fixture({ index: { rows: [ROW_NAV, replaceCell(ROW_UI, 'related', 'architecture-navigation, no-such-id'), ROW_GOV] } }), 'dangling-ref');
  });

  it('code 9 superseded-without-successor', () => {
    assertOnly(fixture({ index: { rows: [ROW_NAV, ROW_UI, replaceCell(ROW_GOV, 'status', 'superseded')] } }), 'superseded-without-successor');
  });

  it('code 10 supersede-cycle', () => {
    const a = replaceCell(ROW_GOV, 'supersedes', 'other-registry');
    const b = replaceCell(replaceCell(replaceCell(ROW_GOV, 'id', 'other-registry'), 'doc', '[Readme](../README.md)'), 'supersedes', 'governance-registry');
    assertOnly(fixture({ index: { rows: [ROW_NAV, ROW_UI, a, b] } }), 'supersede-cycle');
  });

  it('code 11 broken-link: a relative link in the index that is not tracked', () => {
    assertOnly(fixture({ index: { prose: 'See [the old plan](OLD_PLAN.md#scope).' } }), 'broken-link');
  });

  it('code 12 unsafe-link: an escaping link in the index, and an absolute one on the README off-ramp', () => {
    assertOnly(fixture({ index: { prose: 'See [outside](../../outside.md).' } }), 'unsafe-link');
    const readmeText = '# P\n\nStart at the [Architecture Index](docs/ARCHITECTURE_INDEX.md) or [C:](C:/repo/x.md).\n\n## A\n';
    assertOnly(fixture({ readmeText }), 'unsafe-link');
  });

  it('code 13 not-in-governance-index: a mention outside a tier row does not count', () => {
    const governanceText = makeGovernance(['docs/ui/STANDARD.md'], ['docs/ARCHITECTURE_INDEX.md']);
    assertOnly(fixture({ governanceText }), 'not-in-governance-index');
  });

  it('code 14 competing-index: the index declares a tier', () => {
    assertOnly(fixture({ index: { prose: '\n## Tier 1 — Canonical Sources\n' } }), 'competing-index');
  });

  it('code 15 missing-off-ramp: the README links the index only after its first section heading', () => {
    const readmeText = '# Product\n\nCustomer text.\n\n## Develop\n\nSee [Architecture Index](docs/ARCHITECTURE_INDEX.md).\n';
    assertOnly(fixture({ readmeText }), 'missing-off-ramp');
  });

  it('code 16 legacy-prefix-missing', () => {
    assertOnly(fixture({ index: { legacy: [...LEGACY, 'docs/archive/**'] } }), 'legacy-prefix-missing');
  });

  it('code 17 authority-in-legacy', () => {
    const old = replaceCell(replaceCell(replaceCell(ROW_UI, 'doc', '[Old](Planning/old.md)'), 'id', 'old-ui'), 'domain', 'old ui');
    const input = withRow(old);
    input.governanceText = makeGovernance([...GOVERNANCE_ROWS, 'docs/Planning/old.md']);
    assertOnly(input, 'authority-in-legacy');
  });

  it('code 18 not-dual-registered: a canonical doc under docs/ with no GOVERNANCE_INDEX tier row fails', () => {
    assertOnly(fixture({ governanceText: makeGovernance(['docs/ARCHITECTURE_INDEX.md']) }), 'not-dual-registered');
  });
});

describe('FX1001 architecture index: golden row', () => {
  it('the real repository passes with the recorded glob and normative counts', () => {
    const inputs = checker.loadRepoInputs(REPO_ROOT);
    assert.ok(inputs.tracked.length > 500, `git ls-files listed only ${inputs.tracked.length} files`);
    assert.ok(inputs.tracked.includes('docs/ARCHITECTURE_INDEX.md'), 'the index is not tracked (git add -f)');
    assert.ok(inputs.tracked.includes('FailSafe/extension/src/test/docs/architecture-index.test.cjs'),
      'this test is not tracked (the docs/ ignore rule matches src/test/docs; git add -f)');
    const result = checker.validate(inputs);
    assert.equal(result.globs.length, EXPECTED_GLOB_COUNT, `normative globs: ${result.globs.join(', ')}`);
    assert.equal(result.normativeMatches.length, EXPECTED_NORMATIVE_COUNT, `normative: ${result.normativeMatches.join(', ')}`);
    assert.deepEqual(lines(result), []);
  });
});

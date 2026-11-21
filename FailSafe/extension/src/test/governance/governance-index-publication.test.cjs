/**
 * FX939 — docs/GOVERNANCE_INDEX.md distinguishes published from private-by-design.
 *
 * Why this suite exists:
 * The index states "Every governance doc MUST be registered here. Drift in this index =
 * governance drift", and gives each tier a drift signal — but it had no vocabulary for
 * *published vs private*. `.gitignore:52-56` makes `docs/` and `.failsafe/` private by
 * default ("Private planning docs, transfer files, and governance records (licensing TBD)"),
 * published by exception via `git add -f`. So a clone reader saw 15 legitimately-private rows
 * and 1 outright broken row as indistinguishable absences.
 *
 * The broken one: `confidentiality.md` was registered as a root Tier 2 artifact while existing
 * nowhere in the repository — it is operator memory. Its contents are NOT imported here; per
 * CLAUDE.md it holds pricing and tier internals.
 *
 * Pattern rows are skipped deliberately. In the original audit, 14 of 68 paths were shapes, not files
 * (`plan-*.md`, `AUDIT_REPORT_<plan>.md`, `entry-<N>-body.md`); an existence check that did not
 * skip them would report 14 false positives on its first run. That was found by measuring
 * before writing the assertion, not by reasoning about it.
 *
 * Runs standalone: node --test src/test/governance/governance-index-publication.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// src/test/governance -> src/test -> src -> extension -> FailSafe -> <repo root>
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const INDEX = path.join(REPO_ROOT, 'docs', 'GOVERNANCE_INDEX.md');

function indexText() {
  return fs.readFileSync(INDEX, 'utf8');
}

/** A row path naming a shape rather than a file. */
function isPattern(p) {
  return p.includes('*') || p.includes('<');
}

/**
 * Every `.md` path appearing in the first cell of a TIER-table row.
 *
 * Everything from the `## Out-of-tier paths` heading onward is excluded. That
 * section exists, in its own words, "so they are not confused with governance" —
 * treating its rows as registered artifacts is exactly the confusion it was
 * written to prevent, and doing so made `confidentiality.md` look unexplained
 * after it had been correctly relocated there.
 */
function registeredPaths(text) {
  const cut = text.indexOf('## Out-of-tier paths');
  const tiers = cut === -1 ? text : text.slice(0, cut);
  return [...tiers.matchAll(/^\|\s*`([^`]+\.md)`/gm)].map((m) => m[1]);
}

/**
 * Prefixes the index declares private-by-default, read from the
 * `## Publication status` section rather than hardcoded here — a check that
 * carried its own copy of the list could not detect the list going stale.
 */
function declaredPrivatePrefixes(text) {
  const section = /^## Publication status$([\s\S]*?)^## /m.exec(text);
  if (!section) return [];
  return [...section[1].matchAll(/^- private-by-default:\s*`([^`]+)`/gm)].map((m) => m[1]);
}

function trackedFiles(repoRoot = REPO_ROOT) {
  const cwd = { cwd: repoRoot, encoding: 'utf8' };
  const probe = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], cwd);
  if (probe.status !== 0) return null; // distribution without a Git checkout
  assert.equal(probe.stdout.trim(), 'true', 'FX939 requires a non-bare Git checkout');

  // Commit tree is authoritative: git ls-files would also include index-only
  // staged files not present in this PR HEAD, falsely counting them as published.
  // -z prevents filenames containing newlines or whitespace from being mangled.
  const res = spawnSync('git', ['ls-tree', '-r', '-z', '--name-only', 'HEAD'], cwd);
  assert.equal(res.status, 0, 'FX939 could not read the committed HEAD tree: ' + res.stderr);
  return new Set(res.stdout.split('\0').filter(Boolean));
}

/**
 * FX939 publication census is row-based, not unique-path-based. It is deliberately
 * narrower than all Tier-1 registrations: the historical contract enumerates only
 * the first backticked .md path per tier table row.
 */
function measuredPublicationCensus(text, tracked) {
  const prefixes = declaredPrivatePrefixes(text);
  const paths = registeredPaths(text);
  const tally = { registered: paths.length, tracked: 0, private: 0, shapes: 0, unexplained: [] };
  for (const p of paths) {
    if (isPattern(p)) tally.shapes++;
    else if (tracked.has(p)) tally.tracked++;
    else if (prefixes.some((pre) => p.startsWith(pre))) tally.private++;
    else tally.unexplained.push(p);
  }
  return tally;
}

function claimedPublicationCensus(text) {
  // Do not accept an old count from a historical note outside the authoritative
  // publication section, or silently take the first of two conflicting claims.
  const section = /^## Publication status$([\s\S]*?)^## /m.exec(text);
  if (!section) throw new Error('Missing publication status section in GOVERNANCE_INDEX');
  const published = [...section[1].matchAll(/(\d+) of the (\d+) paths registered below have had that done;\s*(\d+) have not/g)];
  const patterns = [...section[1].matchAll(/(\d+) of the (\d+) are of that kind/g)];
  if (published.length !== 1 || patterns.length !== 1 || published[0][2] !== patterns[0][2]) {
    throw new Error('Missing or inconsistent publication census claims in GOVERNANCE_INDEX');
  }
  return {
    registered: Number(published[0][2]),
    tracked: Number(published[0][1]),
    private: Number(published[0][3]),
    shapes: Number(patterns[0][1]),
  };
}

function verifyPublicationCensus(text, tracked) {
  const measured = measuredPublicationCensus(text, tracked);
  assert.deepEqual(measured.unexplained, [], 'registered paths missing outside private-by-default prefixes');
  const { unexplained, ...counts } = measured;
  assert.deepEqual(counts, claimedPublicationCensus(text),
    'GOVERNANCE_INDEX publication status counts disagree with the actual tracked/declared-private tier rows');
  return counts;
}

describe('FX939 GOVERNANCE_INDEX publication status', () => {
  it('registers no path that is neither tracked nor under a declared-private prefix', () => {
    const text = indexText();
    const tracked = trackedFiles();
    if (tracked === null) return;            // no git: nothing to compare against
    const prefixes = declaredPrivatePrefixes(text);

    const unexplained = registeredPaths(text)
      .filter((p) => !isPattern(p))
      .filter((p) => !tracked.has(p))
      .filter((p) => !prefixes.some((pre) => p.startsWith(pre)));

    assert.deepEqual(
      unexplained,
      [],
      'registered but neither published nor declared private — a reader of a clone sees ' +
        `these as missing with no way to tell why: ${unexplained.join(', ')}`
    );
  });

  it('declares at least one private prefix, and every declared prefix matches a real row', () => {
    const text = indexText();
    const prefixes = declaredPrivatePrefixes(text);
    assert.ok(
      prefixes.length > 0,
      'no private-by-default prefixes declared in ## Publication status; the first ' +
        'assertion would then treat every private row as unexplained'
    );

    const paths = registeredPaths(text);
    const dead = prefixes.filter((pre) => !paths.some((p) => p.startsWith(pre)));
    assert.deepEqual(
      dead,
      [],
      `declared private prefixes matching no registered row — dead declaration: ${dead.join(', ')}`
    );
  });


  it('checks recorded publication totals against current tracked tree, rather than trusting historical prose', () => {
    const tracked = trackedFiles();
    if (tracked === null) return; // GitHub source review is separately required without a checkout.
    const census = verifyPublicationCensus(indexText(), tracked);
    assert.equal(census.registered, census.tracked + census.private + census.shapes);
  });

  it('rejects stale totals, omitted shape counts, and unexplained paths in planted census fixtures', () => {
    const rows = '| `docs/a.md` | published |\n| `docs/private.md` | private |\n| `docs/plan-*.md` | shape |\n';
    const section = '\n## Publication status\n- private-by-default: `docs/`\n';
    const ending = '\n## Out-of-tier paths\n';
    const make = (claim) => rows + section + claim + ending;
    const actual = make('1 of the 3 paths registered below have had that done; 1 have not.\n1 of the 3 are of that kind.\n');
    const tracked = new Set(['docs/a.md']);
    assert.deepEqual(verifyPublicationCensus(actual, tracked),
      { registered: 3, tracked: 1, private: 1, shapes: 1 });
    assert.throws(() => verifyPublicationCensus(
      make('2 of the 3 paths registered below have had that done; 0 have not.\n1 of the 3 are of that kind.\n'), tracked
    ), /publication status counts disagree/);
    assert.throws(() => verifyPublicationCensus(
      make('1 of the 3 paths registered below have had that done; 1 have not.\n'), tracked
    ), /Missing or inconsistent publication census claims/);
    assert.throws(() => verifyPublicationCensus(
      actual.replace('- private-by-default: `docs/`', '- private-by-default: `.failsafe/`'), tracked
    ), /registered paths missing outside private-by-default prefixes/);
  });

  it('uses committed HEAD, never a staged-only phantom, for publication evidence', (t) => {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'failsafe-fx939-git-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const git = (...args) => {
      const p = spawnSync('git', args, { cwd: tmp, encoding: 'utf8' });
      assert.equal(p.status, 0, p.stderr);
    };
    git('init', '-q');
    fs.writeFileSync(path.join(tmp, 'committed.md'), 'committed\n');
    git('add', 'committed.md');
    git('-c', 'user.name=FX939 Test', '-c', 'user.email=fx939@example.invalid',
      'commit', '-qm', 'initial');
    fs.writeFileSync(path.join(tmp, 'staged-only.md'), 'not published\n');
    git('add', 'staged-only.md');
    const tracked = trackedFiles(tmp);
    assert.equal(tracked.has('committed.md'), true);
    assert.equal(tracked.has('staged-only.md'), false);
  });

  it('accepts claims only inside one publication section, rejecting duplicate claims', () => {
    const actual = '| \`docs/a.md\` | published |\n| \`docs/private.md\` | private |\n'
      + '| \`docs/plan-*.md\` | shape |\n'
      + '## Publication status\n- private-by-default: \`docs/\`\n'
      + '1 of the 3 paths registered below have had that done; 1 have not.\n'
      + '1 of the 3 are of that kind.\n## Out-of-tier paths\n';
    const tracked = new Set(['docs/a.md']);
    const falseHistorical = '99 of the 100 paths registered below have had that done; 1 have not.\n'
      + '1 of the 100 are of that kind.\n';
    assert.deepEqual(verifyPublicationCensus(falseHistorical + actual, tracked),
      { registered: 3, tracked: 1, private: 1, shapes: 1 });
    assert.throws(() => verifyPublicationCensus(
      actual.replace('## Out-of-tier paths',
        '1 of the 3 paths registered below have had that done; 1 have not.\n## Out-of-tier paths'), tracked
    ), /Missing or inconsistent publication census claims/);
  });

  it('registers docs/README.md in some tier', () => {
    assert.ok(
      registeredPaths(indexText()).includes('docs/README.md'),
      'docs/README.md exists on disk but is registered in no tier; the index requires ' +
        'every governance doc to be registered'
    );
  });
});

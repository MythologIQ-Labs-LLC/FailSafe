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


/**
 * Tier 1 is an authority registry, not the historical Markdown publication census.
 * Inspect EVERY backticked path in its first column, including multi-path rows,
 * JSON and YAML. Otherwise a missing second agent instruction or version manifest
 * can remain invisible while FX939's first-.md-path census still reports green.
 */
function tierOneRegistrations(text) {
  const match = /^## Tier 1[^\n]*$/m.exec(text);
  assert.ok(match, 'Missing canonical Tier 1 section');
  const rest = text.slice(match.index + match[0].length);
  const next = rest.search(/^## /m);
  const section = next < 0 ? rest : rest.slice(0, next);
  const registrations = [];
  for (const line of section.split(/\r?\n/)) {
    if (!/^\|\s*\x60/.test(line)) continue;
    const cell = line.split('|')[1] || '';
    for (const m of cell.matchAll(/\x60([^\x60]+)\x60/g)) {
      registrations.push({ path: m[1], row: line });
    }
  }
  assert.ok(registrations.length, 'Tier 1 section contains no registered paths');
  return registrations;
}

/** Read committed object modes, never staged-only index paths or workspace links. */
function committedModes(repoRoot = REPO_ROOT) {
  const cwd = { cwd: repoRoot, encoding: 'utf8' };
  const probe = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], cwd);
  if (probe.status !== 0) return null;
  assert.equal(probe.stdout.trim(), 'true', 'Tier-1 census requires a Git checkout');
  const result = spawnSync('git', ['ls-tree', '-r', '-z', 'HEAD'], cwd);
  assert.equal(result.status, 0, 'Cannot inspect committed Tier-1 files: ' + result.stderr);
  const modes = new Map();
  for (const entry of result.stdout.split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    assert.ok(tab > 0, 'Malformed committed-tree entry');
    const metadata = entry.slice(0, tab).split(' ');
    assert.equal(metadata.length, 3, 'Malformed committed-tree metadata');
    modes.set(entry.slice(tab + 1), metadata[0]);
  }
  return modes;
}

function verifyTierOneRegistrations(text, modes) {
  const rows = tierOneRegistrations(text);
  const names = rows.map((row) => row.path);
  assert.equal(new Set(names).size, names.length, 'Tier 1 has duplicate canonical paths');
  const localOnly = 'docs/roadmap/tracker-config.yaml';
  for (const { path: registered, row } of rows) {
    if (registered === localOnly) {
      assert.ok(row.includes('A local file, not in the repository'),
        'The one operator-local Tier-1 exception must explicitly disclose its absence');
      assert.equal(modes.has(registered), false,
        'Operator-local tracker unexpectedly published; review its authority classification');
      continue;
    }
    assert.equal(modes.get(registered), '100644',
      'Tier-1 canonical authority is absent from committed HEAD or not a regular-file blob: ' + registered);
  }
  assert.ok(names.includes('FailSafe/extension/package.json'),
    'Canonical nested Node manifest must remain a registered Tier-1 authority');
  return { paths: names.length, committed: names.length - 1, localOnly };
}


describe('FX939 GOVERNANCE_INDEX publication status', () => {

  it('binds every explicit Tier-1 authority to a regular tracked HEAD blob, except one disclosed local YAML', () => {
    const modes = committedModes();
    if (modes === null) return; // Archive/package without Git: no branch-authority claim.
    const result = verifyTierOneRegistrations(indexText(), modes);
    assert.ok(result.paths >= 19, 'Tier-1 registration coverage unexpectedly contracted');
    assert.equal(result.committed, result.paths - 1);
  });

  it('rejects missing second-column paths, staged-only phantoms, symlinks and disguised local exceptions', () => {
    const text = indexText();
    const registrations = tierOneRegistrations(text);
    const names = registrations.map((row) => row.path);
    assert.ok(names.includes('.github/copilot-instructions.md'),
      'Fixture requires the agent-instruction multi-path row');
    const modes = new Map(names.filter((name) => name !== 'docs/roadmap/tracker-config.yaml')
      .map((name) => [name, '100644']));
    assert.equal(verifyTierOneRegistrations(text, modes).paths, names.length);
    modes.delete('GEMINI.md');
    assert.throws(() => verifyTierOneRegistrations(text, modes),
      /Tier-1 canonical authority is absent/);
    modes.set('GEMINI.md', '100644');
    modes.set('.github/copilot-instructions.md', '120000');
    assert.throws(() => verifyTierOneRegistrations(text, modes),
      /not a regular-file blob/);
    modes.set('.github/copilot-instructions.md', '100644');
    modes.set('docs/roadmap/tracker-config.yaml', '100644');
    assert.throws(() => verifyTierOneRegistrations(text, modes),
      /Operator-local tracker unexpectedly published/);
    modes.delete('docs/roadmap/tracker-config.yaml');
    assert.throws(() => verifyTierOneRegistrations(
      text.replace('A local file, not in the repository', 'published authority'), modes
    ), /operator-local Tier-1 exception/);
    assert.throws(() => verifyTierOneRegistrations(
      text.replace('\x60GEMINI.md\x60', '\x60AGENTS.md\x60'), modes
    ), /duplicate canonical paths/);
    assert.throws(() => verifyTierOneRegistrations(
      text.replace('\x60FailSafe/extension/package.json\x60', '\x60package.json\x60'), modes
    ), /Tier-1 canonical authority is absent/);
  });


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
      '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=' + path.join(tmp, 'no-hooks'),
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

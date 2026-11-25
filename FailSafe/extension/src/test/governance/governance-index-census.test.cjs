/**
 * #722 Tier-1 authority registry and publication census, read from docs/GOVERNANCE_INDEX.md.
 *
 * Tier 1 is an authority registry: every backticked first-cell path, including multi-path rows,
 * JSON and YAML, must be a regular blob in committed HEAD (one disclosed operator-local file
 * excepted). The publication totals stated in the index are recomputed from the committed tree
 * by FX939's first-backticked-.md-per-row rule and must match. Planted fixtures prove refusals.
 *
 * Runs standalone: node --test src/test/governance/governance-index-census.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  indexText, trackedFiles, verifyPublicationCensus, tierOneRegistrations, committedModes, verifyTierOneRegistrations,
} = require('./governanceIndexReaders.cjs');

describe('#722 GOVERNANCE_INDEX Tier-1 authority and publication census', () => {

  it('binds every explicit Tier-1 authority to a regular tracked HEAD blob, except one disclosed local YAML', () => {
    const modes = committedModes();
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
    modes.set('package.json', '100644'); // a committed root manifest still cannot replace the nested one
    assert.throws(() => verifyTierOneRegistrations(
      text.replace('\x60FailSafe/extension/package.json\x60', '\x60package.json\x60'), modes
    ), /Canonical nested Node manifest must remain/);
  });

  it('checks recorded publication totals against current tracked tree, rather than trusting historical prose', () => {
    const tracked = trackedFiles();
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
      make('1 of the 3 paths registered below have had that done; 1 have not.\n1 of the 4 are of that kind.\n'), tracked
    ), /Missing or inconsistent publication census claims/);
    assert.throws(() => verifyPublicationCensus(
      actual.replace('- private-by-default: `docs/`', '- private-by-default: `.failsafe/`'), tracked
    ), /registered paths missing outside private-by-default prefixes/);
  });

  it('refuses to census a directory that is not a Git checkout instead of passing vacuously', (t) => {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'failsafe-fx939-nogit-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    assert.throws(() => trackedFiles(tmp), /needs a Git checkout/);
    assert.throws(() => committedModes(tmp), /needs a Git checkout/);
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
});

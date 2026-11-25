'use strict';
/**
 * Readers for docs/GOVERNANCE_INDEX.md shared by the FX939 publication suite and the #722
 * Tier-1 authority and publication-census suite. Read-only: nothing here writes a file.
 */

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
  // A missing or refused checkout (for example git's dubious-ownership refusal) fails loudly.
  assert.equal(probe.status, 0, 'FX939 needs a Git checkout of the repository: ' + probe.stderr);
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
  const kindOf = (p) => {
    if (isPattern(p)) return 'shapes';
    if (tracked.has(p)) return 'tracked';
    return prefixes.some((pre) => p.startsWith(pre)) ? 'private' : 'unexplained';
  };
  for (const p of paths) {
    const kind = kindOf(p);
    if (kind === 'unexplained') tally.unexplained.push(p);
    else tally[kind]++;
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
  assert.equal(probe.status, 0, 'The Tier-1 census needs a Git checkout of the repository: ' + probe.stderr);
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

module.exports = {
  REPO_ROOT, indexText, isPattern, registeredPaths, declaredPrivatePrefixes, trackedFiles,
  measuredPublicationCensus, claimedPublicationCensus, verifyPublicationCensus,
  tierOneRegistrations, committedModes, verifyTierOneRegistrations,
};

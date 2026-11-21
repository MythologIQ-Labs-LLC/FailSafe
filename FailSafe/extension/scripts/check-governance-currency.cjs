#!/usr/bin/env node
'use strict';
/**
 * FailSafe Tier-1 release-marker reconciliation, proposal for #722.
 * Read-only. Does not alter canonical governance files or assert native audit PASS.
 * This checks explicit current-release claims, not historical release narratives.
 */
const fs = require('node:fs');
const path = require('node:path');

const REL = Object.freeze({
  manifest: 'FailSafe/extension/package.json',
  changelog: 'CHANGELOG.md',
  state: 'docs/SYSTEM_STATE.md',
  architecture: 'docs/ARCHITECTURE_PLAN.md',
  governance: 'docs/GOVERNANCE_INDEX.md',
  features: 'docs/FEATURE_INDEX.md',
});
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function parseArgs(argv) {
  const args = { root: process.cwd(), json: false, enforce: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--repo-root' && !seen.has(token) && argv[i + 1]) {
      args.root = argv[++i];
    } else if (token === '--format' && !seen.has(token) && argv[i + 1] === 'json') {
      i += 1;
      args.json = true;
    } else if (token === '--enforce' && !seen.has(token)) {
      args.enforce = true;
    } else {
      throw new Error('Usage: check-governance-currency.cjs [--repo-root PATH] [--format json] [--enforce]');
    }
    seen.add(token);
  }
  return args;
}

function realRepositoryRoot(root) {
  const absolute = path.resolve(root);
  const stat = fs.lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Repository root must be a real directory');
  return fs.realpathSync.native(absolute);
}

function trustedRead(root, relativePath) {
  let full = root;
  let st;
  for (const part of relativePath.split('/')) {
    full = path.join(full, part);
    st = fs.lstatSync(full);
    if (st.isSymbolicLink()) throw new Error(`Not a regular file (symlink component): ${relativePath}`);
  }
  if (!st.isFile()) throw new Error(`Not a regular file: ${relativePath}`);
  const resolved = fs.realpathSync.native(full);
  const rel = path.relative(root, resolved);
  if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`File outside repository: ${relativePath}`);
  }
  if (st.size > 3 * 1024 * 1024) throw new Error(`Oversized source: ${relativePath}`);
  return fs.readFileSync(resolved, 'utf8');
}

function singleHeader(source, regex, field) {
  const matches = [...source.matchAll(regex)];
  if (matches.length !== 1) throw new Error(`Expected exactly one ${field}; found ${matches.length}`);
  const marker = matches[0][1];
  if (!versionPattern.test(marker)) throw new Error(`Malformed ${field}: ${marker}`);
  return marker;
}

function releaseDate(day) {
  if (!isoDate.test(day)) throw new Error(`Invalid ISO release date ${JSON.stringify(day)}`);
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new Error(`Impossible release date ${JSON.stringify(day)}`);
  }
  return day;
}

function loadSources(rootArg) {
  const root = realRepositoryRoot(rootArg);
  return Object.fromEntries(Object.entries(REL).map(([key, rel]) => [key, trustedRead(root, rel)]));
}

function indexReviewDate(governance) {
  const matches = [...governance.matchAll(/^\*\*Last Reviewed\*\*:[ \t]*(\S+)/gm)];
  if (matches.length === 0) throw new Error('No GOVERNANCE_INDEX Last Reviewed record');
  return releaseDate(matches[0][1]);
}

/**
 * Verify that the current Tier-1 version authority is registered.
 * This checks the explicit manifest declaration, not historical references
 * or the full inventory of non-Markdown governance artifacts.
 */
function tier1ManifestIssue(governance) {
  const lines = governance.split(/\r?\n/);
  const start = lines.findIndex(line => /^## Tier 1(?:\s|$)/.test(line));
  if (start < 0) return 'Missing canonical Tier 1 registry section';
  const next = lines.findIndex((line, i) => i > start && /^## /.test(line));
  const tier = lines.slice(start + 1, next < 0 ? undefined : next);
  const rows = tier.filter(line => /^\|/.test(line) && line.split('|')[2]?.trim().startsWith('Authoritative version source'));
  if (rows.length !== 1) return `Expected exactly one Tier 1 version authority row; found ${rows.length}`;
  const declared = rows[0].split('|')[1]?.trim();
  if (declared !== '`FailSafe/extension/package.json`') {
    return `Tier 1 version authority declares ${declared || 'no path'}, but the canonical manifest is FailSafe/extension/package.json; verify the committed tree and reconcile the registry`;
  }
  return null;
}

/** Returns a report, not an audit verdict or publication authorization. */
function checkCurrency(rootArg) {
  const source = loadSources(rootArg);
  const manifest = JSON.parse(source.manifest);
  if (typeof manifest.version !== 'string' || !versionPattern.test(manifest.version)) {
    throw new Error('Extension manifest does not declare an unambiguous SemVer version');
  }
  const version = manifest.version;
  // Also explicitly verify the release date of this version. Never accept the
  // presence of a newer/older changelog section as a release verification.
  const sections = [...source.changelog.matchAll(/^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\] - (\d{4}-\d{2}-\d{2})\s*$/gm)];
  const published = sections.filter(m => m[1] === version);
  if (published.length !== 1) throw new Error(`Expected exactly one CHANGELOG heading for ${version}; got ${published.length}`);
  const publishedAt = releaseDate(published[0][2]);
  const findings = [];
  const error = (id, rel, message) => findings.push({ id, severity: 'error', path: rel, message });
  const warn = (id, rel, message) => findings.push({ id, severity: 'warning', path: rel, message });
  const newest = sections[0]?.[1];
  if (newest !== version) error('FC001', REL.changelog, `Newest release heading ${newest ?? "missing"} differs from extension manifest ${version}`);

  const stateRelease = singleHeader(source.state.slice(0, 12000), /^\*\*Current Release:\*\*[ \t]*v?(\S+)/gm, 'SYSTEM_STATE Current Release');
  if (stateRelease !== version) error('FC002', REL.state, `Current Release ${stateRelease} differs from ${version}`);

  const architectureRelease = singleHeader(source.architecture.slice(0, 2400), /^\*\*Current Release:\*\*[ \t]*v?(\S+)/gm, 'ARCHITECTURE_PLAN Current Release');
  if (architectureRelease !== version) error('FC003', REL.architecture, `Current Release ${architectureRelease} differs from ${version}`);

  const reviewedAt = indexReviewDate(source.governance);
  if (reviewedAt < publishedAt) {
    error('FC004', REL.governance, `Last Reviewed ${reviewedAt} predates CHANGELOG ${version} release date ${publishedAt}`);
  }

  const manifestIssue = tier1ManifestIssue(source.governance);
  if (manifestIssue) error('FC006', REL.governance, manifestIssue);

  const featureLead = source.features.slice(0, 550).match(/Single canonical cross-reference[^\n]*?v(\d+\.\d+\.\d+)/);
  if (featureLead && featureLead[1] !== version) {
    warn('FC005', REL.features, `Feature Index introduction names historical ${featureLead[1]}; current release ${version}. Review actual FX coverage, not just prose.`);
  }
  return { kind: 'candidate-document-currency', version, publishedAt, reviewedAt, findings, summary: {
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
  } };
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
    const result = checkCurrency(args.root);
    if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      process.stdout.write(`FailSafe Tier-1 candidate currency check: v${result.version} (${result.publishedAt})\n`);
      for (const f of result.findings) process.stdout.write(`${f.severity.toUpperCase()} ${f.id} ${f.path}: ${f.message}\n`);
      process.stdout.write(`Findings: ${result.summary.errors} errors, ${result.summary.warnings} warnings\n`);
    }
    return args.enforce && result.summary.errors > 0 ? 1 : 0;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (args?.json) process.stdout.write(`${JSON.stringify({ kind: 'candidate-document-currency', refused: message })}\n`);
    else process.stderr.write(`REFUSED document currency check: ${message}\n`);
    return 2;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { checkCurrency, parseArgs, main };

'use strict';
/** Shared fixture for the #722 currency-check suites: a minimal consistent repository in a temp dir. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'scripts', 'check-governance-currency.cjs');
// A Windows junction needs no symlink privilege and lstat reports it as a symbolic link.
const DIR_LINK = process.platform === 'win32' ? 'junction' : 'dir';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-doc-currency-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const tierOne = '\n## Tier 1 — Canonical Sources\n| Path | Purpose |\n| `FailSafe/extension/package.json` | Authoritative version source |\n';
  const write = (name, contents) => {
    // Existing fixtures target release markers. Keep unrelated canonical
    // registry authority valid unless a test provides a Tier-1 table itself.
    if (name === 'docs/GOVERNANCE_INDEX.md' && !contents.includes('## Tier 1')) contents += tierOne;
    const file = path.join(root, ...name.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  write('FailSafe/extension/package.json', '{ "version": "6.0.13" }\n');
  write('CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\n## [6.0.13] - 2026-11-13\n\n## [6.0.12] - 2026-11-10\n');
  write('docs/SYSTEM_STATE.md', '# System state\n**Current Release:** v6.0.13 (2026-11-13): verified\n');
  write('docs/ARCHITECTURE_PLAN.md', '# Architecture\n**Current Release:** v6.0.13\n');
  write('docs/GOVERNANCE_INDEX.md', '# Governance index\n**Last Reviewed**: 2026-11-13 (reviewed)\n**Last Reviewed**: 2026-10-22 (historical event)\n');
  write('docs/FEATURE_INDEX.md', '# Feature Index\nSingle canonical cross-reference for FailSafe v6.0.13\n');
  return { root, write, run: (...args) => spawnSync(process.execPath, [CLI, '--repo-root', root, ...args], { encoding: 'utf8' }) };
}

module.exports = { CLI, DIR_LINK, fixture };

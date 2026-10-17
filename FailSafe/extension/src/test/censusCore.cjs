// Census logic shared by census.cjs (in the extension host) and its node test
// (#531 LD7). Pure apart from the file write: enumerate one configuration's
// files from disk with that configuration's own patterns, and write
// { label, enumerated, executed, missing }. It reports only; it never touches
// the exit status.
'use strict';

const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');
const { CONFIGS, EXTENSION_ROOT } = require('./vscodeTestConfigs.cjs');

// Match runner.cjs normalizeCasing: lower-case Windows drive letters so the
// enumerated paths compare equal to the suite.file paths mocha reports.
function normalizeCase(p) {
  if (process.platform === 'win32' && /^[A-Z]:/.test(p)) {
    return p[0].toLowerCase() + p.slice(1);
  }
  return p;
}

/** Absolute, sorted test files of one label; [] for an unknown label. */
function enumerateFor(label, root = EXTENSION_ROOT) {
  const config = Object.prototype.hasOwnProperty.call(CONFIGS, label) ? CONFIGS[label] : null;
  if (!config) return [];
  return [...new Set(globSync([...config.files], { cwd: root, absolute: true, nodir: true }))]
    .map((f) => normalizeCase(path.resolve(f)))
    .sort();
}

/** Write the census file and return its one-line summary. */
function writeCensus({ label, enumerated, executed, censusPath }) {
  const executedList = Array.from(executed).sort();
  const missing = enumerated.filter((f) => !executed.has(f));
  fs.mkdirSync(path.dirname(censusPath), { recursive: true });
  fs.writeFileSync(censusPath, JSON.stringify({ label, enumerated, executed: executedList, missing }, null, 2));
  return `census[${label}]: executed ${enumerated.length - missing.length}/${enumerated.length} (missing ${missing.length})`;
}

module.exports = { normalizeCase, enumerateFor, writeCensus };

#!/usr/bin/env node
/**
 * FX932 - pre-merge ledger fork guard.
 *
 * Detects duplicate `### Entry #N:` numbers and unattested duplicate
 * `**Previous Hash**` values in docs/META_LEDGER.md, BEFORE merge. There is no
 * post-merge remedy: RECONCILED_ENTRIES_RE upstream is number-keyed, so an
 * attestation cannot disambiguate two entries that share a number.
 *
 * Chain arithmetic stays upstream (qor.scripts.ledger_hash). Field EXTRACTION
 * is owned here - extraction is not math.
 *
 * Plan: .failsafe/governance/plans/plan-ledger-fork-guard.md (iteration 5).
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Live-artifact baselines. Every value here was measured externally, never
// captured from this guard's own output.
const DUPLICATE_NUMBER_BASELINE = {
  113: 2, 204: 3, 205: 3, 218: 2, 222: 2, 223: 2, 224: 2, 225: 2, 226: 2,
  227: 2, 228: 2, 229: 2, 230: 2, 232: 2, 233: 2, 234: 2, 235: 2, 236: 2,
};

// 15 groups. [397,401] is NOT here: it is attested by Entry #447 and cleared
// by attestedGroups() before comparison.
const PREV_HASH_BASELINE = [
  [10, 32, 42], [13, 75], [14, 43, 330], [16, 26, 44], [17, 27], [18, 28, 40],
  [22, 25, 80], [23, 78, 84], [33, 77], [79, 228], [113, 113],
  [204, 204, 204], [205, 205], [248, 258], [259, 262],
];

const UNCLASSIFIED_BASELINE = [122, 123, 124, 125];
// labels / recovered / sentinel / inspected GROW with every legitimate append, so
// they are reported but never equality-pinned. The growth-stable degradation check
// is UNCLASSIFIED_BASELINE: any parser that stops recognising a form dumps those
// lines into `unclassified`, which blows the set.

const FENCE_RE = /```[\s\S]*?```/g;
const ENTRY_RE = /^### Entry #(\d+):/gm;
const LABEL_RE = /^\*\*Previous Hash\*\*:/;
const BACKTICK_RE = /^\*\*Previous Hash\*\*:[ \t]*`([0-9a-f]+)`/;
const INLINE_RE = /^\*\*Previous Hash\*\*:[ \t]*([0-9a-f]+)\b/;
const SENTINEL_RE = /^\*\*Previous Hash\*\*:[ \t]*`?(?:pending[-a-z]*|N\/A|none|GENESIS)/i;
const RECONCILED_RE = /^\*\*Reconciled Entries\*\*:\s*([#0-9,\s]+)/m;

function stripFences(text) {
  return text.replace(FENCE_RE, '');
}

/** Classify one `**Previous Hash**` line. Hex run is matched at FULL length -
 *  pinning it to 64 collapses every duplicate group to zero. */
function classifyPreviousHash(line) {
  if (SENTINEL_RE.test(line)) return { form: 'sentinel', value: null };
  const bt = BACKTICK_RE.exec(line);
  if (bt) return { form: 'backtick', value: bt[1] };
  const inl = INLINE_RE.exec(line);
  if (inl) return { form: 'inline', value: inl[1] };
  return { form: 'unclassified', value: null };
}

/** Field-recovery coverage. `labels` is counted independently of the
 *  classifier's return, so a classifier that drops lines still fails. */
function coverage(text, classifier = classifyPreviousHash) {
  const counts = { labels: 0, recovered: 0, sentinel: 0, unclassified: 0 };
  for (const line of text.split(/\r?\n/)) {
    if (!LABEL_RE.test(line)) continue;
    counts.labels += 1;
    const form = classifier(line).form;
    if (form === 'sentinel') counts.sentinel += 1;
    else if (form === 'unclassified') counts.unclassified += 1;
    else counts.recovered += 1;
  }
  return counts;
}

/** [entryNumber, body] pairs in file order, fences stripped. */
function entryBlocks(text) {
  const cleaned = stripFences(text);
  const blocks = [];
  const matches = [...cleaned.matchAll(ENTRY_RE)];
  for (let i = 0; i < matches.length; i++) {
    const end = i + 1 < matches.length ? matches[i + 1].index : cleaned.length;
    blocks.push([Number(matches[i][1]), cleaned.slice(matches[i].index, end)]);
  }
  return blocks;
}

function findDuplicateNumbers(text) {
  const counts = {};
  for (const [num] of entryBlocks(text)) counts[num] = (counts[num] || 0) + 1;
  const dups = {};
  for (const [num, n] of Object.entries(counts)) if (n > 1) dups[num] = n;
  return dups;
}

/** Groups of >=2 entries sharing a previous_hash. Entries whose value is null
 *  (sentinel / unclassified) are excluded - otherwise every sentinel would
 *  collapse into one enormous false group. */
function groupByPreviousHash(text) {
  const byValue = new Map();
  for (const [num, body] of entryBlocks(text)) {
    const line = body.split(/\r?\n/).find((l) => LABEL_RE.test(l));
    if (!line) continue;
    const { value } = classifyPreviousHash(line);
    if (!value) continue;
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push(num);
  }
  return [...byValue.values()].filter((members) => members.length > 1);
}

/** Entry numbers named on any `**Reconciled Entries**:` line. */
function attestedNumbers(text) {
  const named = new Set();
  for (const [, body] of entryBlocks(text)) {
    const m = RECONCILED_RE.exec(body);
    if (!m) continue;
    for (const tok of m[1].match(/\d+/g) || []) named.add(Number(tok));
  }
  return named;
}

/** Groups surviving attestation. A group clears only when EVERY member is
 *  named; partial naming does not clear. */
function attestedGroups(text) {
  const named = attestedNumbers(text);
  return groupByPreviousHash(text).filter(
    (members) => !members.every((n) => named.has(n))
  );
}

function inspect(text) {
  return {
    inspected: entryBlocks(text).length,
    duplicateNumbers: findDuplicateNumbers(text),
    unattestedPrevHashGroups: attestedGroups(text),
  };
}

function unclassifiedEntries(text) {
  const out = [];
  for (const [num, body] of entryBlocks(text)) {
    const line = body.split(/\r?\n/).find((l) => LABEL_RE.test(l));
    if (line && classifyPreviousHash(line).form === 'unclassified') out.push(num);
  }
  return out;
}

const key = (members) => members.join(',');
const baselineGroupKeys = new Set(PREV_HASH_BASELINE.map(key));

/** RULE S: live-derived pins run only in live mode. */
function coveragePins(text, live) {
  const violations = [];
  const cov = coverage(text);
  const unc = unclassifiedEntries(text);
  if (!live) {
    if (unc.length) violations.push(`unclassified previous_hash in fixture: ${unc}`);
    return violations;
  }
  if (key(unc) !== key(UNCLASSIFIED_BASELINE)) {
    violations.push(
      `coverage pin unclassified: expected ${UNCLASSIFIED_BASELINE}, got ${unc} ` +
      `(a previous_hash line matched no known form - either the artifact gained one, ` +
      `or the classifier stopped recognising a form it used to)`);
  }
  if (cov.recovered === 0 && cov.labels > 0) {
    violations.push(`coverage: ${cov.labels} previous_hash labels but 0 recovered`);
  }
  return violations;
}

/** RULE R: accumulate every violation, never fail fast. */
function violations(text, live) {
  const found = coveragePins(text, live);
  const state = inspect(text);
  if (state.inspected === 0) found.push('inspected 0 entries');
  for (const [num, n] of Object.entries(state.duplicateNumbers)) {
    if (DUPLICATE_NUMBER_BASELINE[num] !== n) {
      found.push(`duplicate entry number ${num} appears ${n} times`);
    }
  }
  for (const members of state.unattestedPrevHashGroups) {
    if (!baselineGroupKeys.has(key(members))) {
      found.push(`unattested duplicate previous_hash shared by entries ${key(members)}`);
    }
  }
  return { found, inspected: state.inspected };
}

function parseArgs(argv) {
  const out = { repoRoot: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo-root') out.repoRoot = argv[++i];
    else if (argv[i] === '--file') out.file = argv[++i];
    else return null;
  }
  if (Boolean(out.repoRoot) === Boolean(out.file)) return null;
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args) {
    process.stderr.write(
      'usage: check-ledger-fork (--repo-root <dir> | --file <path>)  [exactly one]\n');
    return 2;
  }
  const live = Boolean(args.repoRoot);
  const target = live
    ? path.resolve(args.repoRoot, 'docs', 'META_LEDGER.md')
    : path.resolve(args.file);
  const text = fs.readFileSync(target, 'utf-8');
  const { found, inspected } = violations(text, live);
  const cov = coverage(text);
  process.stdout.write(
    `check-ledger-fork: inspected ${inspected} entries; previous_hash labels ${cov.labels} ` +
    `(recovered ${cov.recovered}, sentinel ${cov.sentinel}, unclassified ${cov.unclassified})\n`);
  if (!found.length) return 0;
  for (const v of found) process.stderr.write(`FORK ${v}\n`);
  return 1;
}

module.exports = {
  stripFences, classifyPreviousHash, coverage, entryBlocks, findDuplicateNumbers,
  groupByPreviousHash, attestedGroups, inspect, unclassifiedEntries, main,
  DUPLICATE_NUMBER_BASELINE, PREV_HASH_BASELINE, UNCLASSIFIED_BASELINE,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));

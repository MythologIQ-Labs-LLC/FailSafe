/**
 * Architecture index validator core (#530 FX1001, #531 LD2).
 *
 * Pure functions shared by the repository check (`scripts/check-architecture-index.cjs`) and the
 * extension (`src/governance/architecture/architectureIndexCore.ts`, which esbuild inlines). Every
 * location comes from a profile built in `architecture-index-profiles.cjs`; this file names no
 * repository path:
 *
 *   indexPath, readmePath, governancePath   repository-relative POSIX paths
 *   linkBase                                posix.dirname(indexPath): registry and prose links resolve from it
 *   registryTail                            `existing: <indexPath>#registry`, ends every suggestion line
 *   dualRegistrationPrefix                  canonical/proposed docs under it need a governance tier row
 *   normativeGlobs, legacyGlobs             defaults for discovery and a bootstrapped index
 *   checks                                  the FailSafe-only policy checks, each on or off
 *
 * It compares strings only: metadata, links, listed state, uniqueness and registration. It cannot
 * prove that two documents do not overlap in meaning.
 *
 * Globs are matched by a small matcher defined here: `*` and `?` never cross `/`, `**` followed by
 * `/` matches zero or more whole segments, a trailing `**` matches the rest of the path, matching is
 * case-insensitive, and paths are POSIX (`git ls-files` output).
 */
'use strict';

const path = require('node:path');

const COLUMNS = ['id', 'domain', 'doc', 'status', 'owner', 'supersedes', 'related', 'governance_ref', 'contract',
  'verification', 'updated_by'];
const REQUIRED = ['id', 'domain', 'doc', 'status', 'owner'];
const STATUSES = ['canonical', 'proposed', 'descriptive', 'superseded', 'historical'];
const AUTHORITY = new Set(['canonical', 'proposed']);
const PATH_FIELDS = ['governance_ref', 'contract', 'verification'];
const STOP_TOKENS = new Set(['docs', 'md', 'the']);
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
/** The FailSafe-only policy checks a profile turns on or off. */
const POLICY_CHECKS = ['governanceRegistration', 'competingIndex', 'offRamp', 'legacyPrefixes', 'dualRegistration'];

// ---------------------------------------------------------------- globs

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*' && glob[i + 2] === '/') { re += '(?:[^/]+/)*'; i += 2; }
    else if (c === '*' && glob[i + 1] === '*') { re += '.*'; i += 1; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'i');
}

const matchesGlob = (glob, p) => globToRegExp(glob).test(p);

// ---------------------------------------------------------------- text helpers

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Lines of the `## <heading>` section, up to the next `## ` heading; null when absent. */
function sectionLines(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '## ' + heading);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) if (/^## /.test(lines[i])) { end = i; break; }
  return { start, end, lines: lines.slice(start + 1, end) };
}

/** Non-empty, non-comment lines of the first fenced block with this info tag; null when absent. */
function fencedList(text, tag) {
  const m = new RegExp('^```' + tag + '[ \\t]*\\r?\\n([\\s\\S]*?)^```', 'm').exec(text);
  if (!m) return null;
  return m[1].split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

const stripFences = (text) => text.replace(/^```[\s\S]*?^```/gm, '');
const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());
const isEmpty = (v) => v === undefined || v === '' || v === '-';
const idList = (cell) => (isEmpty(cell) ? [] : cell.split(',').map((s) => s.trim()).filter(Boolean));

function tokens(s) {
  return [...new Set(String(s).toLowerCase().split(/[_\-./\s]+/).filter((t) => t.length >= 3 && !STOP_TOKENS.has(t)))];
}

/** True when the text carries the registry header row (the exact column list). */
function hasRegistryHeader(text) {
  const want = COLUMNS.join('|');
  return text.split(/\r?\n/).some((l) => l.trim().startsWith('|') && splitRow(l).join('|') === want);
}

/**
 * Resolve a link target or backticked path to a repository-relative POSIX path.
 * kind: 'external' (http, https, mailto), 'anchor' (fragment only), 'unsafe' or 'path'.
 */
function resolveTarget(target, baseDir, { decode = true } = {}) {
  if (/^(https?:|mailto:)/i.test(target)) return { kind: 'external' };
  let t = target.replace(/#.*$/, '');
  if (t === '') return { kind: 'anchor' };
  if (decode) { try { t = decodeURIComponent(t); } catch { /* keep raw: it then fails as a missing path */ } }
  if (t.includes('\\')) return { kind: 'unsafe', target, reason: 'contains a backslash' };
  if (t.startsWith('/') || /^[A-Za-z]:/.test(t)) return { kind: 'unsafe', target, reason: 'is absolute' };
  const base = baseDir && baseDir !== '.' ? baseDir : '';
  const joined = path.posix.normalize(base ? `${base}/${t}` : t);
  if (joined === '..' || joined.startsWith('../')) return { kind: 'unsafe', target, reason: 'escapes the repository' };
  return { kind: 'path', target, path: joined.replace(/^\.\//, '') };
}

/** A backticked token is path-shaped when it contains `/` or ends in a file extension. */
function isPathShapedToken(t) {
  if (t === '-' || /^unknown$/i.test(t) || /^#\d+$/.test(t) || t.startsWith('/qor-')) return false;
  if (/^(https?:|mailto:)/i.test(t)) return false;
  return t.includes('/') || /\.[A-Za-z0-9]+$/.test(t);
}

/** Path-shaped values in a registry cell: relative link targets (from linkBase) and backticked paths (from the root). */
function pathValues(cell, profile) {
  const out = [];
  for (const m of cell.matchAll(LINK_RE)) {
    const r = resolveTarget(m[1], profile.linkBase);
    if (r.kind === 'path' || r.kind === 'unsafe') out.push(r);
  }
  for (const m of cell.replace(LINK_RE, '').matchAll(/`([^`]+)`/g)) {
    const t = m[1].trim();
    if (isPathShapedToken(t)) out.push(resolveTarget(t, '', { decode: false }));
  }
  return out;
}

/** FX939's rule: a backticked .md path in the first cell of a tier row, before `## Out-of-tier paths`. */
function governanceRegistered(text) {
  const cut = text.indexOf('## Out-of-tier paths');
  const tiers = cut === -1 ? text : text.slice(0, cut);
  return new Set([...tiers.matchAll(/^\|\s*`([^`]+\.md)`/gm)].map((m) => m[1]));
}

// ---------------------------------------------------------------- parsing

function parseRegistry(indexText, profile) {
  const problems = [];
  const rows = [];
  const section = sectionLines(indexText, 'Registry');
  const table = section ? section.lines.filter((l) => l.trim().startsWith('|')) : [];
  if (!section || table.length < 3) {
    problems.push({ code: 'missing-section', detail: `${profile.indexPath} has no ## Registry table with rows` });
    return { rows, problems };
  }
  if (splitRow(table[0]).join('|') !== COLUMNS.join('|')) {
    problems.push({ code: 'bad-row', detail: `registry header must be: ${COLUMNS.join(' | ')}` });
  }
  table.slice(2).forEach((line, i) => {
    const cells = splitRow(line);
    const label = `registry row ${i + 1}`;
    if (cells.length !== COLUMNS.length) {
      problems.push({ code: 'bad-row', detail: `${label} has ${cells.length} cells, expected ${COLUMNS.length}` });
      return;
    }
    const row = Object.fromEntries(COLUMNS.map((c, k) => [c, cells[k]]));
    const required = AUTHORITY.has(row.status) ? [...REQUIRED, 'updated_by'] : REQUIRED;
    for (const c of required) {
      if (isEmpty(row[c])) problems.push({ code: 'bad-row', detail: `${label} (${row.id || '?'}) has an empty ${c}` });
    }
    const link = /^\[[^\]]*\]\(([^)\s]+)\)$/.exec(row.doc);
    const doc = link ? resolveTarget(link[1], profile.linkBase) : null;
    if (doc && doc.kind === 'unsafe') {
      problems.push({ code: 'unsafe-link', detail: `${row.id}: doc link ${doc.target} ${doc.reason}` });
    } else if (!isEmpty(row.doc) && (!doc || doc.kind !== 'path')) {
      problems.push({ code: 'bad-row', detail: `${row.id}: doc must be a relative markdown link to a repository file` });
    }
    row.docPath = doc && doc.kind === 'path' ? doc.path : null;
    rows.push(row);
  });
  return { rows, problems };
}

// ---------------------------------------------------------------- checks (one per code)

function suggestFor(file, rows) {
  const dir = path.posix.dirname(file);
  const sameDir = rows.filter((r) => r.status === 'canonical' && r.docPath && path.posix.dirname(r.docPath) === dir)
    .map((r) => r.docPath).sort(cmp);
  const fileTokens = new Set(tokens(file));
  const shared = rows.filter((r) => r.docPath)
    .map((r) => ({ p: r.docPath, n: tokens(`${r.docPath} ${r.domain}`).filter((t) => fileTokens.has(t)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || cmp(a.p, b.p))
    .map((x) => x.p);
  const picked = [];
  for (const p of [...sameDir, ...shared]) if (!picked.includes(p) && picked.length < 5) picked.push(p);
  return picked;
}

const suggestionText = (list, profile) =>
  `suggestions: ${list.length ? list.join(', ') : 'none'}; ${profile.registryTail}`;

function checkUnregistered(ctx) {
  const registered = new Set(ctx.rows.map((r) => r.docPath).filter(Boolean));
  return ctx.normativeMatches.filter((p) => !registered.has(p)).map((p) => ({
    code: 'unregistered-normative',
    detail: `${p} (matches \`${ctx.globs.find((g) => matchesGlob(g, p))}\`) has no registry row; ` +
      suggestionText(suggestFor(p, ctx.rows), ctx.profile),
  }));
}

function checkMissingPaths(ctx) {
  const out = [];
  for (const row of ctx.rows) {
    if (row.docPath && !ctx.tracked.has(row.docPath)) {
      out.push({ code: 'missing-path', detail: `${row.id}: doc ${row.docPath} is not a tracked file` });
    }
    for (const field of PATH_FIELDS) {
      for (const v of pathValues(row[field], ctx.profile)) {
        if (v.kind === 'unsafe') out.push({ code: 'unsafe-link', detail: `${row.id}: ${field} ${v.target} ${v.reason}` });
        else if (!ctx.tracked.has(v.path)) out.push({ code: 'missing-path', detail: `${row.id}: ${field} ${v.path} is not a tracked file` });
      }
    }
  }
  return out;
}

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const v of values) { if (seen.has(v)) dupes.add(v); seen.add(v); }
  return [...dupes].sort(cmp);
}

function checkDuplicateIds(ctx) {
  return duplicates(ctx.rows.map((r) => r.id)).map((id) => ({ code: 'duplicate-id', detail: `id ${id} is registered more than once` }));
}

function checkDuplicatePaths(ctx) {
  return duplicates(ctx.rows.map((r) => r.docPath).filter(Boolean))
    .map((p) => ({ code: 'duplicate-path', detail: `${p} is registered by more than one row` }));
}

function checkConflictingCanonical(ctx) {
  const byDomain = new Map();
  const out = [];
  for (const row of ctx.rows.filter((r) => r.status === 'canonical')) {
    const key = row.domain.trim().toLowerCase();
    if (byDomain.has(key)) {
      out.push({ code: 'conflicting-canonical', detail: `domain "${key}" has two canonical documents: ${byDomain.get(key).docPath} and ${row.docPath}` });
    } else byDomain.set(key, row);
  }
  return out;
}

function checkStatuses(ctx) {
  return ctx.rows.filter((r) => !STATUSES.includes(r.status))
    .map((r) => ({ code: 'bad-status', detail: `${r.id}: status "${r.status}" is not one of ${STATUSES.join(', ')}` }));
}

function checkDanglingRefs(ctx) {
  const ids = new Set(ctx.rows.map((r) => r.id));
  const out = [];
  for (const row of ctx.rows) {
    for (const field of ['supersedes', 'related']) {
      for (const id of idList(row[field])) {
        if (!ids.has(id)) out.push({ code: 'dangling-ref', detail: `${row.id}: ${field} names unregistered id ${id}` });
      }
    }
  }
  return out;
}

function checkSupersededSuccessor(ctx) {
  const replaced = new Set(ctx.rows.flatMap((r) => idList(r.supersedes)));
  return ctx.rows.filter((r) => r.status === 'superseded' && !replaced.has(r.id))
    .map((r) => ({ code: 'superseded-without-successor', detail: `${r.id} is superseded but no row lists it in supersedes` }));
}

function checkSupersedeCycles(ctx) {
  const edges = new Map(ctx.rows.map((r) => [r.id, idList(r.supersedes)]));
  const state = new Map();
  const out = [];
  const visit = (id, trail) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'open') {
      out.push({ code: 'supersede-cycle', detail: `supersedes forms a cycle: ${[...trail.slice(trail.indexOf(id)), id].join(' -> ')}` });
      return;
    }
    state.set(id, 'open');
    for (const next of edges.get(id) || []) if (edges.has(next)) visit(next, [...trail, id]);
    state.set(id, 'done');
  };
  for (const id of [...edges.keys()].sort(cmp)) visit(id, []);
  return out;
}

function linkProblems(text, baseDir, where, tracked) {
  const out = [];
  for (const m of stripFences(text).matchAll(LINK_RE)) {
    const r = resolveTarget(m[1], baseDir);
    if (r.kind === 'unsafe') out.push({ code: 'unsafe-link', detail: `${where}: ${r.target} ${r.reason}` });
    else if (r.kind === 'path' && !tracked.has(r.path)) out.push({ code: 'broken-link', detail: `${where}: ${m[1]} -> ${r.path} is not a tracked file` });
  }
  return out;
}

/** README lines before the first `## ` heading that link to the index. */
function offRampLines(readmeText, profile) {
  const lines = readmeText.split(/\r?\n/);
  const end = lines.findIndex((l) => /^## /.test(l));
  return lines.slice(0, end === -1 ? lines.length : end)
    .filter((l) => [...l.matchAll(LINK_RE)].some((m) => resolveTarget(m[1], '').path === profile.indexPath));
}

function checkIndexLinks(ctx) {
  const section = sectionLines(ctx.indexText, 'Registry');
  const all = ctx.indexText.split(/\r?\n/);
  const prose = section ? [...all.slice(0, section.start), ...all.slice(section.end)].join('\n') : ctx.indexText;
  return linkProblems(prose, ctx.profile.linkBase, ctx.profile.indexPath, ctx.tracked);
}

function checkOffRampLinks(ctx) {
  return linkProblems(offRampLines(ctx.readmeText, ctx.profile).join('\n'), '', `${ctx.profile.readmePath} off-ramp`, ctx.tracked);
}

function checkGovernanceRegistration(ctx) {
  const { indexPath, governancePath } = ctx.profile;
  if (ctx.governanceSet.has(indexPath)) return [];
  return [{ code: 'not-in-governance-index', detail: `${indexPath} has no tier row in ${governancePath}` }];
}

function checkCompetingIndex(ctx) {
  const { indexPath, governancePath } = ctx.profile;
  return /^## Tier/m.test(stripFences(ctx.indexText))
    ? [{ code: 'competing-index', detail: `${indexPath} has a "## Tier" heading; tiers belong to ${governancePath}` }]
    : [];
}

function checkOffRamp(ctx) {
  const { indexPath, readmePath } = ctx.profile;
  return offRampLines(ctx.readmeText, ctx.profile).length
    ? []
    : [{ code: 'missing-off-ramp', detail: `${readmePath} has no link to ${indexPath} before its first ## heading` }];
}

function checkLegacyPrefixes(ctx) {
  return ctx.legacy.filter((g) => !ctx.trackedList.some((p) => matchesGlob(g, p)))
    .map((g) => ({ code: 'legacy-prefix-missing', detail: `legacy prefix \`${g}\` matches no tracked path` }));
}

function checkAuthorityInLegacy(ctx) {
  return ctx.rows.filter((r) => AUTHORITY.has(r.status) && r.docPath && ctx.legacy.some((g) => matchesGlob(g, r.docPath)))
    .map((r) => ({ code: 'authority-in-legacy', detail: `${r.id}: ${r.status} doc ${r.docPath} is under a legacy prefix` }));
}

function checkDualRegistration(ctx) {
  const { indexPath, governancePath, dualRegistrationPrefix } = ctx.profile;
  return ctx.rows
    .filter((r) => AUTHORITY.has(r.status) && r.docPath && r.docPath.startsWith(dualRegistrationPrefix) && r.docPath !== indexPath)
    .filter((r) => !ctx.governanceSet.has(r.docPath))
    .map((r) => ({ code: 'not-dual-registered', detail: `${r.id}: ${r.status} doc ${r.docPath} has no tier row in ${governancePath}` }));
}

// ---------------------------------------------------------------- entry point

/**
 * @param {{indexText: string, readmeText: string, governanceText: string, tracked: string[]}} input
 * @param {object} profile from architecture-index-profiles.cjs
 * @returns {{problems: {code: string, detail: string}[], rows: object[], globs: string[], legacy: string[], normativeMatches: string[]}}
 */
function validate({ indexText, readmeText, governanceText, tracked }, profile) {
  if (!profile || typeof profile.indexPath !== 'string') throw new TypeError('validate needs a profile');
  const on = profile.checks || {};
  const problems = [];
  const globs = fencedList(indexText, 'architecture-normative');
  const legacy = fencedList(indexText, 'architecture-legacy');
  if (!globs || globs.length === 0) problems.push({ code: 'missing-section', detail: 'no `architecture-normative` block with globs' });
  if (!legacy || legacy.length === 0) problems.push({ code: 'missing-section', detail: 'no `architecture-legacy` block with prefixes' });
  const registry = parseRegistry(indexText, profile);
  problems.push(...registry.problems);

  const trackedList = [...tracked].sort(cmp);
  const ctx = {
    profile, indexText, readmeText, rows: registry.rows, globs: globs || [], legacy: legacy || [],
    tracked: new Set(trackedList), trackedList, governanceSet: governanceRegistered(governanceText),
  };
  ctx.normativeMatches = trackedList.filter((p) => ctx.globs.some((g) => matchesGlob(g, p)) && !ctx.legacy.some((g) => matchesGlob(g, p)));

  problems.push(...checkUnregistered(ctx));          // 1
  problems.push(...checkMissingPaths(ctx));          // 2 (and 12 for unsafe cell paths)
  problems.push(...checkDuplicateIds(ctx));          // 3
  problems.push(...checkDuplicatePaths(ctx));        // 4
  problems.push(...checkConflictingCanonical(ctx));  // 5
  problems.push(...checkStatuses(ctx));              // 6
  problems.push(...checkDanglingRefs(ctx));          // 8
  problems.push(...checkSupersededSuccessor(ctx));   // 9
  problems.push(...checkSupersedeCycles(ctx));       // 10
  problems.push(...checkIndexLinks(ctx));            // 11, 12
  if (on.offRamp) problems.push(...checkOffRampLinks(ctx));                       // 11, 12
  if (on.governanceRegistration) problems.push(...checkGovernanceRegistration(ctx)); // 13
  if (on.competingIndex) problems.push(...checkCompetingIndex(ctx));             // 14
  if (on.offRamp) problems.push(...checkOffRamp(ctx));                           // 15
  if (on.legacyPrefixes) problems.push(...checkLegacyPrefixes(ctx));             // 16
  problems.push(...checkAuthorityInLegacy(ctx));     // 17
  if (on.dualRegistration) problems.push(...checkDualRegistration(ctx));         // 18

  return { problems, rows: ctx.rows, globs: ctx.globs, legacy: ctx.legacy, normativeMatches: ctx.normativeMatches };
}

module.exports = {
  COLUMNS, STATUSES, POLICY_CHECKS, globToRegExp, matchesGlob, tokens, resolveTarget, isPathShapedToken, pathValues,
  governanceRegistered, hasRegistryHeader, parseRegistry, suggestFor, suggestionText, validate,
};

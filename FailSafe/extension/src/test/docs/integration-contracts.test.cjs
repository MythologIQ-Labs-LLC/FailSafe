/**
 * FX1003 — integration customer-value contracts are held to the code (#532, plan-532a LD7).
 *
 * Why this suite exists:
 * #532 asks for one contract per integration, each stating what the customer gets, what leaves
 * the machine and which capability is real. A contract that drifts from the code is worse than
 * none, so this suite reads the code and the documents together:
 *
 *   - Coverage: the expected set is built from the code (the catalog ids parsed from
 *     `INTEGRATION_CATALOG`, every entry under `src/integrations/`, the hits of two network scans
 *     over every non-test source file, and the plan's named integrations). Every entry maps to a
 *     contract that owns it or to a row of the portfolio's Inventory reconciliation table. The
 *     scans are the claim: this certifies that every scan hit is owned or reconciled, not that the
 *     inventory is complete (the blind spots are stated in the portfolio).
 *   - Browser modules: every fetch, WebSocket and EventSource target under `roadmap/ui/` and
 *     `webui/` passes one of the accept rules (a)-(e), and the same-origin bases they rely on are
 *     asserted at their definitions.
 *   - Structure and citations: every contract has the LD2 sections in order; every citation
 *     `path:L` or `path:L-M` followed by an anchor resolves within 3 lines in the working tree;
 *     every factual line carries a citation or the word unverified.
 *   - Feature states, catalog capabilities, the legacy-review map, the Verified facts table, the
 *     portfolio matrix, the reported scan counts and the index registrations.
 *   - Tag check: with tag v6.0.8 present, every shipped-state anchor is in the tagged file and
 *     every main-unreleased anchor is not. Without the tag (PR CI) the test skips and says how
 *     many claims it left unchecked.
 *
 * Every rule is shown red by an in-memory fixture on every run, and the golden row runs the
 * whole check against this repository.
 *
 * Runs standalone: node --test src/test/docs/integration-contracts.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// src/test/docs -> src/test -> src -> extension -> FailSafe -> <repo root>
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SRC = 'FailSafe/extension/src';
const TEST_ROOT = `${SRC}/test/`;
const INTEGRATIONS_DIR = `${SRC}/integrations/`;
const CATALOG_FILE = `${SRC}/integrations/catalog/integration-catalog.ts`;
const CONTRACT_DIR = 'docs/architecture/integrations/';
const PORTFOLIO = 'docs/architecture/INTEGRATION_PORTFOLIO.md';
const SCENARIOS = 'docs/architecture/INTEGRATION_SCENARIOS.md';
const REVIEW_DIR = 'docs/research/integrations/';
const TAG = 'v6.0.8';
const { runnerFor } = require(path.join(REPO_ROOT, 'FailSafe', 'extension', 'scripts', 'test-file-discovery.cjs'));
const archChecker = require(path.join(REPO_ROOT, 'FailSafe', 'extension', 'scripts', 'check-architecture-index.cjs'));

/** plan-532a LD1: the integrations named outside the catalog and the integrations folder. */
const LD1_OTHER_IDS = [
  'bicameral', 'open-design', 'mcp-catalog', 'agt',
  'acp-devin', 'failsafe-mcp-server', 'voice-pack', 'marketplace', 'agt-adapter', 'governed-commit-pr',
  'tracker-manifest', 'agent-config-injection', 'shield-receipts', 'qor-logic-consumer', 'sentinel-llm',
  'governance-webhook', 'dependency-admission-lint', 'git-bootstrap',
];

/** plan-532a LD7 criterion (2): files the plan names as scan hits. */
const NAMED_HITS = {
  'scan-2': [
    `${SRC}/qorlogic/QorLogicPackageInstaller.ts`, `${SRC}/shared/gitBootstrap.ts`,
    `${SRC}/roadmap/services/MarketplaceInstaller.ts`, `${SRC}/roadmap/services/AdapterService.ts`,
    `${SRC}/extension/governedCommit.ts`,
  ],
  'scan-1': [
    `${SRC}/roadmap/services/QorRuntimeService.ts`, `${SRC}/sentinel/utils/llmTransport.ts`,
    `${SRC}/governance/GovernanceWebhook.ts`, `${SRC}/qorlogic/substrate/DependencyAdmissionLintModule.ts`,
    `${SRC}/roadmap/routes/SreApiRoute.ts`, `${SRC}/roadmap/routes/templates/SreTemplate.ts`,
  ],
};

const STATES = ['verified-shipped', 'shipped-unverified', 'shipped-inert', 'main-unreleased', 'proposed'];
const SHIPPED = new Set(['verified-shipped', 'shipped-unverified', 'shipped-inert']);
const DEPTHS = ['unit', 'route', 'jsdom', 'playwright-stubbed', 'installed-vscode', 'live-service'];
const DISPOSITIONS = ['INVEST', 'COMPLETE', 'MAINTAIN', 'RETIRE'];
/** #538: the owner's recorded decision on the dispositions, and the section a RETIRE contract carries. */
const OWNER_DECISION = { date: '2026-10-18', ref: '#538' };
const RETIREMENT_SECTION = 'Retirement review (#538)';
const SECTIONS = [
  'Customer job', 'Measurable value', 'Why not simply ask an agent', 'API documentation',
  'Privileges and scopes', 'Feature state', 'Inbound fields', 'Outbound fields and egress', 'Transformations',
  'Persisted artifacts', 'Graph links', 'Customer UI and actions', 'Governance policy and enforceability limits',
  'Failure, offline, stale and permission semantics', 'End-to-end scenario and measurable acceptance',
  'Recommended disposition', 'Open defects',
];
const NON_FACTUAL = new Set(['Customer job', 'Why not simply ask an agent', 'Recommended disposition']);
const FACT_IDS = Array.from({ length: 20 }, (_, i) => `F${String(i + 1).padStart(2, '0')}`);
const BROWSER_PREFIXES = [`${SRC}/roadmap/ui/`, `${SRC}/webui/`];
const SAME_ORIGIN = 'not an integration: same-origin Console API';
const SCAN_COUNT_KEYS = ['scan-1-files', 'scan-1-call-sites', 'scan-2-files', 'browser-files', 'browser-targets',
  'loopback-targets', 'catalog-ids', 'integration-entries', 'contracts'];

// ------------------------------------------------------------------ text helpers

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const isRelative = (v) => !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(v) && !v.startsWith('//');
const LOOPBACK_RE = /^(?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1)(?:[:/]|$)/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Index just past the balanced group that opens at `open` (a `(`), or -1. Skips strings and templates. */
function closeOf(text, open) {
  const stack = [];
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '\'' || c === '"') {
      for (i += 1; i < text.length && text[i] !== c; i += 1) if (text[i] === '\\') i += 1;
    } else if (c === '`') {
      i = templateEnd(text, i) - 1;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2); if (i < 0) return -1; i += 1;
    } else if ('([{'.includes(c)) stack.push(c);
    else if (')]}'.includes(c)) { stack.pop(); if (!stack.length) return i + 1; }
  }
  return -1;
}

/** Index just past the template literal that opens at `start`. */
function templateEnd(text, start) {
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] === '\\') { i += 1; continue; }
    if (text[i] === '`') return i + 1;
    if (text[i] === '$' && text[i + 1] === '{') {
      let depth = 0;
      for (let j = i + 1; j < text.length; j += 1) {
        if (text[j] === '`') { j = templateEnd(text, j) - 1; continue; }
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') { depth -= 1; if (!depth) { i = j; break; } }
      }
    }
  }
  return text.length;
}

/** Split the top-level comma-separated arguments of the call whose `(` is at `open`. */
function callArgs(text, open) {
  const end = closeOf(text, open);
  if (end < 0) return [];
  const body = text.slice(open + 1, end - 1);
  const out = [];
  let depth = 0; let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === '\'' || c === '"') { for (i += 1; i < body.length && body[i] !== c; i += 1) if (body[i] === '\\') i += 1; }
    else if (c === '`') i = templateEnd(body, i) - 1;
    else if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (c === ',' && depth === 0) { out.push(body.slice(start, i).trim()); start = i + 1; }
  }
  const last = body.slice(start).trim();
  if (last) out.push(last);
  return out;
}

/** Split `cond ? a : b` at top level into its branches; anything else is returned as is. */
function branches(expr) {
  let depth = 0; let q = -1;
  for (let i = 0; i < expr.length; i += 1) {
    const c = expr[i];
    if (c === '\'' || c === '"') { for (i += 1; i < expr.length && expr[i] !== c; i += 1) if (expr[i] === '\\') i += 1; }
    else if (c === '`') i = templateEnd(expr, i) - 1;
    else if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (depth === 0 && c === '?' && expr[i + 1] !== '?' && expr[i + 1] !== '.' && q < 0) q = i;
    else if (depth === 0 && c === ':' && q >= 0) return [...branches(expr.slice(q + 1, i).trim()), ...branches(expr.slice(i + 1).trim())];
  }
  return [expr.trim()];
}

// ------------------------------------------------------------------ scans (LD1)

/**
 * The text with every comment replaced by spaces (newlines kept, so line numbers hold). String and
 * template literals are kept; a backslash escapes the next character everywhere, so a regex literal
 * such as /https?:\/\// is not read as a comment. A call in a comment is not a call.
 */
function blankComments(text) {
  const out = text.split('');
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '\\') { i += 1; continue; }
    if (c === '\'' || c === '"') { for (i += 1; i < text.length && text[i] !== c && text[i] !== '\n'; i += 1) if (text[i] === '\\') i += 1; continue; }
    if (c === '`') { i = templateEnd(text, i) - 1; continue; }
    if (c === '/' && text[i + 1] === '/') { for (; i < text.length && text[i] !== '\n'; i += 1) out[i] = ' '; continue; }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      for (; i < stop; i += 1) if (text[i] !== '\n' && text[i] !== '\r') out[i] = ' ';
      i -= 1;
    }
  }
  return out.join('');
}

const SCAN1 = [
  { name: 'fetch(', re: /(?<![\w.$])fetch\(/g, call: true },
  { name: 'http.request(', re: /(?<![\w$])https?\.request\(/g },
  { name: 'http.get(', re: /(?<![\w$])https?\.get\(/g },
  { name: 'net.connect(', re: /(?<![\w$])net\.connect\(/g },
  { name: 'tls.connect(', re: /(?<![\w$])tls\.connect\(/g },
  { name: 'new WebSocket(', re: /\bnew WebSocket\(/g, call: true },
  { name: 'new EventSource(', re: /\bnew EventSource\(/g, call: true },
  { name: 'fetchImpl(', re: /(?<![\w$])fetchImpl\(/g, call: true },
  { name: 'globalThis.fetch', re: /\bglobalThis\.fetch\b/g },
];

/** True when the `fetch(` at `index` is a method definition (`async fetch() {`, `fetch(a) {`, `function fetch(`). */
function isMethodDefinition(text, index, matchLength) {
  const before = text.slice(Math.max(0, index - 12), index);
  if (/(?:async|function)\s+$/.test(before)) return true;
  const end = closeOf(text, index + matchLength - 1);
  return end > 0 && /^\s*(?::[^;{=]*)?\{/.test(text.slice(end, end + 80));
}

/** Scan 1: in-process network calls, one record per call site. */
function scan1(file) {
  const sites = [];
  const text = blankComments(file.text);
  for (const p of SCAN1) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text))) {
      if (p.name === 'fetch(' && isMethodDefinition(text, m.index, m[0].length)) continue;
      const open = m.index + m[0].length - 1;
      sites.push({ path: file.path, line: lineOf(text, m.index), kind: p.name,
        arg: p.call ? (callArgs(text, open)[0] ?? '') : null });
    }
  }
  return sites;
}

// A child-process or runner call. `.`-qualified forms (`cp.spawn(`, `child_process.execFile(`,
// `deps.runner(`) count; `exec(` counts only bare or as `cp.exec(` / `child_process.exec(`, so
// `RegExp.prototype.exec` is not mistaken for a process call; `git(` counts only bare.
const SCAN2_CALL = /(?<![\w$])(?:[\w$]+\.)?(?:spawn|spawnSync|execFile|execFileSync|execSync|runner)\(|(?<![\w$.])(?:(?:cp|child_process|childProcess)\.)?exec\(|(?<![\w$.])git\(/;
const SCAN2_WORD = /(['"`])(install|clone|push|pull|fetch|download|upgrade|pip|pip3)\1/;

/** Scan 2: process egress, file level (a process call and a whole quoted network word). */
const scan2 = (file) => { const t = blankComments(file.text); return SCAN2_CALL.test(t) && SCAN2_WORD.test(t); };

const isBrowser = (p) => BROWSER_PREFIXES.some((pre) => p.startsWith(pre));

// ------------------------------------------------------------------ browser accept rules

/** The leading fixed text of a template literal and its first expression. */
function templateParts(t) {
  const inner = t.slice(1, -1);
  const at = inner.indexOf('${');
  if (at < 0) return { lead: inner, expr: null };
  let depth = 0; let end = inner.length;
  for (let i = at + 1; i < inner.length; i += 1) {
    if (inner[i] === '{') depth += 1;
    else if (inner[i] === '}') { depth -= 1; if (!depth) { end = i; break; } }
  }
  return { lead: inner.slice(0, at), expr: inner.slice(at + 2, end).trim() };
}

/**
 * Classify one target expression of a browser module. Returns { rule, ok, why }.
 *   (a) a relative literal, or a template whose fixed leading text starts with `/`, `./` or `../`;
 *   (b) a template whose leading expression is an allowlisted same-origin base;
 *   (c) an identifier every value assigned to which (in the same file) passes (a) or (b); a function
 *       parameter is checked at its call sites in the same file;
 *   (d) a literal localhost / 127.0.0.1 target (needs a per-file reconciliation row);
 *   (e) `ws://${window.location.host}` / `wss://...`, or `this.wsUrl`.
 */
function classifyTarget(expr, file, allow, depth = 0) {
  const e = expr.trim();
  if (depth > 4) return { rule: '?', ok: false, why: `${e}: resolution too deep` };
  if (/^(['"])[\s\S]*\1$/.test(e)) {
    const v = e.slice(1, -1);
    if (LOOPBACK_RE.test(v)) return { rule: 'd', ok: true };
    return isRelative(v) ? { rule: 'a', ok: true } : { rule: 'a', ok: false, why: `${e} is not relative` };
  }
  if (e.startsWith('`') && e.endsWith('`')) {
    const { lead, expr: first } = templateParts(e);
    if (lead) {
      if (/^wss?:\/\/$/.test(lead) && first === 'window.location.host') return { rule: 'e', ok: true };
      if (LOOPBACK_RE.test(lead)) return { rule: 'd', ok: true };
      if (/^(?:\/(?!\/)|\.\.?\/)/.test(lead)) return { rule: 'a', ok: true };
      return { rule: 'a', ok: false, why: `${e}: the fixed leading text is not relative` };
    }
    if (first && allow.has(first)) return { rule: 'b', ok: true };
    return { rule: 'b', ok: false, why: `${e}: leading expression ${first} is not an allowlisted same-origin base` };
  }
  if (e === 'this.wsUrl' && allow.has('this.wsUrl')) return { rule: 'e', ok: true };
  if (/^[A-Za-z_$][\w$]*$/.test(e)) {
    const values = assignedValues(file.text, e);
    if (values.length) {
      const bad = values.map((v) => classifyTarget(v, file, allow, depth + 1)).filter((r) => !r.ok || r.rule === 'd');
      return bad.length ? { rule: 'c', ok: false, why: `${e}: ${bad.map((b) => b.why || 'a loopback value').join('; ')}` } : { rule: 'c', ok: true };
    }
    const args = parameterCallArgs(file.text, e);
    if (args === null) return { rule: 'c', ok: false, why: `${e} has no assignment and is not a parameter of a named function in this file` };
    if (!args.length) return { rule: 'c', ok: false, why: `${e} is a parameter with no call site in this file` };
    const bad = args.map((a) => classifyTarget(a, file, allow, depth + 1)).filter((r) => !r.ok || r.rule === 'd');
    return bad.length ? { rule: 'c', ok: false, why: `${e} (parameter): ${bad.map((b) => b.why || 'a loopback value').join('; ')}` } : { rule: 'c', ok: true };
  }
  return { rule: '?', ok: false, why: `${e}: no accept rule applies` };
}

/** Right-hand sides assigned to identifier `name` anywhere in the file, split into ternary branches. */
function assignedValues(text, name) {
  const re = new RegExp(`(?:\\b(?:const|let|var)\\s+${escapeRe(name)}\\s*=(?!=)|(?<![\\w$.])${escapeRe(name)}\\s*=(?![=>]))`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length;
    let depth = 0; const start = i;
    for (; i < text.length; i += 1) {
      const c = text[i];
      if (c === '\'' || c === '"') { for (i += 1; i < text.length && text[i] !== c; i += 1) if (text[i] === '\\') i += 1; }
      else if (c === '`') i = templateEnd(text, i) - 1;
      else if ('([{'.includes(c)) depth += 1;
      else if (')]}'.includes(c)) { if (!depth) break; depth -= 1; }
      else if ((c === ';' || c === ',') && depth === 0) break;
      else if (c === '\n' && depth === 0 && !/[?:|&+]\s*$/.test(text.slice(start, i)) && !/^\s*[?:]/.test(text.slice(i + 1, i + 40))) break;
    }
    out.push(...branches(text.slice(start, i).trim()));
  }
  return out;
}

/**
 * For a parameter `name`: the arguments at its position at every call site in the same file of
 * the named function (or the arrow assigned to a name) that declares it. null when no such
 * function declares it.
 */
function parameterCallArgs(text, name) {
  const decls = [
    ...text.matchAll(/(?:\bfunction\s+([A-Za-z_$][\w$]*)\s*|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[^;\n]*?\|\|\s*)?\(?\s*(?:async\s*)?)\(([^()]*)\)\s*(?:=>|\{)/g),
  ];
  const out = [];
  let found = false;
  for (const d of decls) {
    const fn = d[1] || d[2];
    const params = d[3].split(',').map((p) => p.trim().replace(/\s*=.*$/, ''));
    const idx = params.indexOf(name);
    if (idx < 0) continue;
    found = true;
    const callRe = new RegExp(`(?<![\\w$.])${escapeRe(fn)}\\(`, 'g');
    let m;
    while ((m = callRe.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 10), m.index);
      if (/function\s+$/.test(before)) continue;
      const args = callArgs(text, m.index + m[0].length - 1);
      if (m.index >= d.index && m.index < d.index + d[0].length) continue;
      if (args[idx] !== undefined) out.push(args[idx]);
    }
  }
  return found ? out : null;
}

/** The same-origin bases a browser module may lead a template with. */
function allowlistFor(p) {
  const allow = new Set(['this.baseUrl', 'this.client.baseUrl', 'this.wsUrl']);
  if (p.endsWith('/roadmap/ui/modules/rest-api.js')) allow.add('baseUrl');
  return allow;
}

/**
 * Rule (b)/(e) definitions: the allowlisted bases are only ever the values the plan names.
 * Returns a list of problems (empty when every definition holds).
 */
function baseDefinitionProblems(read, sources) {
  const out = [];
  const conn = `${SRC}/roadmap/ui/modules/connection.js`;
  const ct = read(conn);
  if (ct === null) return [`${conn} is missing`];
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const baseVals = assignedValues(ct, 'this.baseUrl').map(norm);
  const okBase = (v) => v === "options.baseUrl || ''" || /^`http:\/\/localhost:\$\{port\}`$/.test(v);
  if (!baseVals.length || baseVals.some((v) => !okBase(v))) out.push(`${conn}: this.baseUrl is assigned ${JSON.stringify(baseVals)}; allowed: options.baseUrl || '' and \`http://localhost:\${port}\``);
  const wsVals = assignedValues(ct, 'this.wsUrl').map(norm);
  const okWs = (v) => v === 'options.wsUrl || `ws://${window.location.host}`' || v === '`ws://localhost:${port}`';
  if (!wsVals.length || wsVals.some((v) => !okWs(v))) out.push(`${conn}: this.wsUrl is assigned ${JSON.stringify(wsVals)}`);
  const rest = `${SRC}/roadmap/ui/modules/rest-api.js`;
  const restCalls = sources.flatMap((f) => [...f.text.matchAll(/(?<![\w$.])createRestApi\(([^)]*)\)/g)].map((m) => `${f.path}: ${m[1].trim()}`))
    .filter((c) => !c.startsWith(`${rest}: baseUrl`));
  if (restCalls.length === 0 || restCalls.some((c) => !c.endsWith(': this.baseUrl') || !c.startsWith(`${conn}:`))) out.push(`createRestApi callers must pass this.baseUrl from connection.js; found ${JSON.stringify(restCalls)}`);
  const ctor = sources.flatMap((f) => [...f.text.matchAll(/\bnew ConnectionClient\(([^)]*)\)/g)].map((m) => ({ path: f.path, args: m[1].trim() })));
  if (ctor.length !== 1 || ctor[0].args !== '') out.push(`exactly one \`new ConnectionClient()\` with no baseUrl or wsUrl is allowed; found ${JSON.stringify(ctor)}`);
  const definesBase = [conn, `${SRC}/webui/protocol.ts`, `${SRC}/webui/lib/failsafe-client.ts`];
  for (const f of sources.filter((s) => isBrowser(s.path) && /\$\{this\.(?:baseUrl|wsUrl)\}/.test(s.text) && !definesBase.includes(s.path))) {
    out.push(`${f.path}: leads a target with this.baseUrl or this.wsUrl, but only ${definesBase.join(', ')} have asserted definitions`);
  }
  for (const f of sources.filter((s) => /this\.client\.baseUrl/.test(s.text))) {
    if (!/this\.client = deps\.client \|\| null;/.test(f.text)) out.push(`${f.path}: uses this.client.baseUrl but does not take the client from deps.client`);
  }
  const clientPass = sources.filter((f) => isBrowser(f.path)).flatMap((f) => [...f.text.matchAll(/\{\s*client:\s*([^,}\n]+?)\s*\}/g)].map((m) => `${f.path}: ${m[1]}`))
    .filter((c) => !c.endsWith(': this.client') && !c.endsWith(': client'));
  if (clientPass.length) out.push(`a { client } dependency must be the ConnectionClient (this.client or client); found ${JSON.stringify(clientPass)}`);
  const DEFAULT = 'typeof (globalThis as any).window !== "undefined" ? (globalThis as any).window.location.origin : "http://localhost:9376"';
  for (const [file, re] of [[`${SRC}/webui/protocol.ts`, /private baseUrl = ([^)]*?\)[^)]*?\)[\s\S]*?"http:\/\/localhost:\d+")/],
    [`${SRC}/webui/protocol.ts`, /apiBaseUrl = ([\s\S]*?"http:\/\/localhost:\d+")/],
    [`${SRC}/webui/lib/failsafe-client.ts`, /private baseUrl = ([\s\S]*?"http:\/\/localhost:\d+")/]]) {
    const t = read(file);
    const m = t === null ? null : re.exec(t);
    if (!m || norm(m[1]) !== DEFAULT) out.push(`${file}: the default base is not window.location.origin with a localhost:9376 fallback`);
  }
  // The webui bridges have no callers on main; the first new caller is checked here (fold-in 7).
  const webuiCallers = sources.filter((f) => !f.path.startsWith(`${SRC}/webui/`))
    .flatMap((f) => [...f.text.matchAll(/\b(?:new ApiHostBridge|createHostBridge|new FailSafeClient)\(/g)].map(() => f.path));
  if (webuiCallers.length) out.push(`webui bridges gained callers outside webui/ (check that they pass a same-origin base): ${webuiCallers.join(', ')}`);
  const inner = sources.filter((f) => f.path.startsWith(`${SRC}/webui/`))
    .flatMap((f) => [...f.text.matchAll(/\b(new ApiHostBridge|new FailSafeClient)\(([^)]*)\)/g)].map((m) => m[2].trim()))
    .filter((a) => a !== 'apiBaseUrl');
  if (inner.length) out.push(`a webui bridge is constructed with a base other than createHostBridge's defaulted parameter: ${inner.join(', ')}`);
  // postAction / postGated callers pass Console API paths (the trailing segment of rule (b)).
  for (const f of sources.filter((s) => isBrowser(s.path))) {
    for (const m of f.text.matchAll(/\bthis\.client\.(?:postAction|postGated)\(/g)) {
      const a = callArgs(f.text, m.index + m[0].length - 1)[0] || '';
      const lit = /^'([^']*)'$/.exec(a);
      if (lit ? !lit[1].startsWith('/api/') : a !== 'btn.dataset.action') out.push(`${f.path}:${lineOf(f.text, m.index)}: postAction/postGated endpoint ${a} is not a literal /api/ path`);
      if (a === 'btn.dataset.action') {
        const actions = [...f.text.matchAll(/data-action="([^"]*)"/g)].map((x) => x[1]);
        if (!actions.length || actions.some((x) => !x.startsWith('/api/'))) out.push(`${f.path}: data-action values ${JSON.stringify(actions)} are not all /api/ paths`);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ catalog

/** Catalog ids and capabilities from quoted string literals inside the INTEGRATION_CATALOG array only. */
function parseCatalog(text) {
  const start = text.indexOf('export const INTEGRATION_CATALOG');
  if (start < 0) return null;
  const open = text.indexOf('[', text.indexOf('=', start));
  const body = text.slice(open, closeOf(text.replace(/\[/g, '(').replace(/\]/g, ')'), open));
  const out = [];
  for (const m of body.matchAll(/\bid:\s*'([^']+)'[\s\S]*?\bcapabilities:\s*\[([^\]]*)\]/g)) {
    out.push({ id: m[1], capabilities: [...m[2].matchAll(/'([^']+)'/g)].map((c) => c[1]) });
  }
  return out;
}

// ------------------------------------------------------------------ citations (LD7 grammar)

const CITATION_RE = /`([A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?` \(`([^`]*)`\)/g;
const SHAPE_RE = /`([^`]*?[\w./-]+\.\w+:\d+[^`]*)`/g;

/** Every citation on a line, with the problems of malformed citation-shaped tokens. */
function citationsOn(line) {
  const cites = [];
  const spans = [];
  CITATION_RE.lastIndex = 0;
  let m;
  while ((m = CITATION_RE.exec(line))) {
    cites.push({ path: m[1], from: Number(m[2]), to: Number(m[3] || m[2]), anchor: m[4] });
    spans.push([m.index, m.index + m[1].length + m[2].length + (m[3] ? m[3].length + 1 : 0) + 3]);
  }
  const bad = [];
  SHAPE_RE.lastIndex = 0;
  while ((m = SHAPE_RE.exec(line))) {
    if (!/[\w./-]+\.\w+:\d+/.test(m[1])) continue;
    if (!spans.some(([s]) => s === m.index)) bad.push(m[0]);
  }
  return { cites, bad };
}

/** Problems of one citation against the working tree (`read` returns text or null). */
function citationProblems(c, read) {
  const out = [];
  if (c.path.startsWith('/') || c.path.includes('\\') || /^[A-Za-z]:/.test(c.path) || c.path.split('/').includes('..')) {
    return [`${c.path}: not a repository-root-relative POSIX path`];
  }
  if (c.from < 1 || c.to < c.from) out.push(`${c.path}:${c.from}-${c.to}: L must be at least 1 and no greater than M`);
  if (c.anchor.length < 8) out.push(`${c.path}:${c.from}: anchor "${c.anchor}" is shorter than 8 characters`);
  if (c.anchor.includes('|')) out.push(`${c.path}:${c.from}: anchor contains |`);
  const text = read(c.path);
  if (text === null) return [...out, `${c.path} does not exist`];
  const lines = text.split(/\r?\n/);
  if (c.from > lines.length) return [...out, `${c.path}:${c.from} is past the end of the file (${lines.length} lines)`];
  const window = lines.slice(Math.max(0, c.from - 4), Math.min(lines.length, c.to + 3)).join('\n');
  if (!window.includes(c.anchor)) out.push(`${c.path}:${c.from}${c.to !== c.from ? `-${c.to}` : ''}: anchor "${c.anchor}" is not within 3 lines`);
  return out;
}

/**
 * #538 whole-file citations, `path` (`anchor`) with no line: accepted only inside a Retirement review, for
 * documents that grow at the top (indexes, changelogs, READMEs), where a line number would rot. The anchor
 * must occur somewhere in the file. Only a path under docs/ or a root or extension CHANGELOG.md or README.md
 * qualifies; source and test files are always cited by line, and a contract never cites itself this way.
 */
const GROWING_DOCUMENT = (p) => p.startsWith('docs/')
  || ['CHANGELOG.md', 'README.md', 'FailSafe/extension/CHANGELOG.md', 'FailSafe/extension/README.md'].includes(p);
const FILE_CITATION_RE = /`([A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+)` \(`([^`]*)`\)/g;
function fileCitationsOn(line) {
  const out = [];
  FILE_CITATION_RE.lastIndex = 0;
  let m;
  while ((m = FILE_CITATION_RE.exec(line))) out.push({ path: m[1], anchor: m[2] });
  return out;
}
function fileCitationProblems(c, read, from) {
  if (c.path.startsWith('/') || c.path.includes('\\') || /^[A-Za-z]:/.test(c.path) || c.path.split('/').includes('..')) {
    return [`${c.path}: not a repository-root-relative POSIX path`];
  }
  if (c.path === from) return [`${c.path}: a contract cites itself by whole file; say "this contract" instead`];
  const out = [];
  if (c.path.startsWith(`${SRC}/`)) out.push(`${c.path}: a source or test file is cited by line, \`path:L\` (\`anchor\`)`);
  else if (!GROWING_DOCUMENT(c.path)) out.push(`${c.path}: the whole-file form is only for a growing document (docs/, CHANGELOG.md, README.md); cite this file by line`);
  if (c.anchor.length < 8) out.push(`${c.path}: anchor "${c.anchor}" is shorter than 8 characters`);
  if (c.anchor.includes('|')) out.push(`${c.path}: anchor contains |`);
  const text = read(c.path);
  if (text === null) return [...out, `${c.path} does not exist`];
  if (!text.includes(c.anchor)) out.push(`${c.path}: anchor "${c.anchor}" is not in the file`);
  return out;
}

// ------------------------------------------------------------------ markdown helpers

const cellsOf = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isSeparator = (line) => /^\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line.trim());

/** `## ` sections of a document: [{ name, start, lines: [{ text, no }] }]. */
function sectionsOf(text) {
  const out = [];
  let cur = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const h = /^## (.+?)\s*$/.exec(line);
    if (h) { cur = { name: h[1], no: i + 1, lines: [] }; out.push(cur); }
    else if (cur) cur.lines.push({ text: line, no: i + 1 });
  });
  return out;
}

/** Rows (cells + line number) of the first table under a section whose header has `firstHeader` as its first cell. */
function tableRows(section, firstHeader) {
  if (!section) return null;
  const ls = section.lines;
  for (let i = 0; i + 1 < ls.length; i += 1) {
    if (ls[i].text.trim().startsWith('|') && isSeparator(ls[i + 1].text) && cellsOf(ls[i].text)[0].toLowerCase() === firstHeader.toLowerCase()) {
      const rows = [];
      for (let j = i + 2; j < ls.length && ls[j].text.trim().startsWith('|'); j += 1) rows.push({ cells: cellsOf(ls[j].text), no: ls[j].no, text: ls[j].text });
      return { header: cellsOf(ls[i].text), rows };
    }
  }
  return null;
}

const backticked = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const stripCitations = (cell) => cell.replace(CITATION_RE, ' ');

// ------------------------------------------------------------------ contracts (LD2)

function parseContract(c) {
  const problems = [];
  const where = (no) => `${c.path}:${no}`;
  const text = c.text;
  const sections = sectionsOf(text);
  const names = sections.map((s) => s.name);
  const missing = SECTIONS.filter((w) => names.filter((n) => n === w).length !== 1);
  for (const w of missing) problems.push({ code: 'contract-section', detail: `${c.path}: section "## ${w}" must appear exactly once` });
  const order = names.filter((n) => SECTIONS.includes(n));
  if (!missing.length && order.join('|') !== SECTIONS.join('|')) {
    problems.push({ code: 'contract-section', detail: `${c.path}: sections are out of LD2 order: ${order.join(' > ')}` });
  }
  // Owned files: the preamble bullet list after **Owned files:**.
  const pre = text.split(/\r?\n/);
  const firstH2 = pre.findIndex((l) => l.startsWith('## '));
  const ownedAt = pre.findIndex((l, i) => (firstH2 < 0 || i < firstH2) && /^\*\*Owned files:\*\*/.test(l));
  const owned = [];
  if (ownedAt < 0) problems.push({ code: 'contract-owned', detail: `${c.path}: no **Owned files:** list before the first section` });
  else {
    for (let i = ownedAt + 1; i < pre.length && /^- /.test(pre[i]); i += 1) {
      const m = /^- `([^`]+)`/.exec(pre[i]);
      if (m) owned.push({ path: m[1], no: i + 1 });
    }
    if (!owned.length) problems.push({ code: 'contract-owned', detail: `${where(ownedAt + 1)}: the Owned files list is empty` });
  }
  // Citations everywhere; the factual-line rule in factual sections.
  const citations = [];
  pre.forEach((line, i) => {
    const { cites, bad } = citationsOn(line);
    for (const b of bad) problems.push({ code: 'citation-grammar', detail: `${where(i + 1)}: ${b} is citation-shaped but not \`path:L\` (\`anchor\`)` });
    for (const ct of cites) citations.push({ ...ct, no: i + 1 });
  });
  // A Retirement review (#538) is factual too; only there a document may be cited by whole file.
  const fileCitations = [];
  for (const s of sections) {
    const review = s.name === RETIREMENT_SECTION;
    if (NON_FACTUAL.has(s.name) || (!SECTIONS.includes(s.name) && !review)) continue;
    s.lines.forEach((l, i) => {
      const t = l.text.trim();
      if (!t || t.startsWith('#') || isSeparator(t)) return;
      if (review && t.startsWith('```')) {
        problems.push({ code: 'retirement', detail: `${where(l.no)}: fenced blocks are not allowed in a ${RETIREMENT_SECTION}; write each line as a cited sentence` });
        return;
      }
      if (t.startsWith('|') && s.lines[i + 1] && isSeparator(s.lines[i + 1].text)) return;
      const files = review ? fileCitationsOn(t) : [];
      for (const fc of files) fileCitations.push({ ...fc, no: l.no });
      if (citationsOn(t).cites.length === 0 && !files.length && !/\bunverified\b/i.test(t)) {
        problems.push({ code: 'uncited-line', detail: `${where(l.no)} (${s.name}): a factual line carries no citation and does not say unverified` });
      }
    });
  }
  if (!citations.length) problems.push({ code: 'no-citation', detail: `${c.path}: no citation parsed` });
  // Feature state rows.
  const fsTable = tableRows(sections.find((s) => s.name === 'Feature state'), 'Capability');
  const rows = [];
  if (!fsTable) problems.push({ code: 'feature-state', detail: `${c.path}: Feature state has no table headed | Capability | State | Symbol | Reached from | Test (depth) | Notes |` });
  else {
    for (const r of fsTable.rows) {
      const [capability = '', state = '', symbol = '', reached = '', test = '', notes = ''] = r.cells;
      rows.push({ capability: capability.replace(/`/g, '').trim(), state, symbolCell: symbol, reached, test, notes, no: r.no, text: r.text });
    }
  }
  // Disposition.
  const disp = sections.find((s) => s.name === 'Recommended disposition');
  const dispText = disp ? disp.lines.map((l) => l.text).join('\n') : '';
  const bold = DISPOSITIONS.filter((d) => dispText.includes(`**${d}**`));
  if (bold.length !== 1) problems.push({ code: 'disposition', detail: `${c.path}: Recommended disposition must name exactly one of ${DISPOSITIONS.map((d) => `**${d}**`).join(', ')}` });
  if (disp && !dispText.includes(`Owner decision ${OWNER_DECISION.date} (${OWNER_DECISION.ref})`)) {
    problems.push({ code: 'disposition', detail: `${c.path}: the disposition does not record the owner decision as "Owner decision ${OWNER_DECISION.date} (${OWNER_DECISION.ref})"` });
  }
  const reviews = sections.filter((s) => s.name === RETIREMENT_SECTION);
  return { ...c, sections, owned, citations, fileCitations, reviews, rows, disposition: bold[0], problems };
}

/** Feature-state rules (LD7) for one contract's rows. */
function featureStateProblems(ct, ctx) {
  const out = [];
  for (const r of ct.rows) {
    const at = `${ct.path}:${r.no}`;
    if (!STATES.includes(r.state)) { out.push({ code: 'feature-state', detail: `${at}: state "${r.state}" is not one of ${STATES.join(', ')}` }); continue; }
    const symCites = citationsOn(r.symbolCell).cites;
    const symbol = backticked(stripCitations(r.symbolCell))[0];
    const hasSwitch = /\b(?:Switch:|Absent call site:)/.test(r.text);
    if (hasSwitch && r.state !== 'shipped-inert') out.push({ code: 'precedence', detail: `${at}: a row with Switch: or Absent call site: must be shipped-inert (it is ${r.state})` });
    if (r.state === 'shipped-inert' && !hasSwitch) out.push({ code: 'precedence', detail: `${at}: shipped-inert must cite its Switch: or Absent call site:` });
    if (r.state === 'shipped-inert' && /\bSwitch:/.test(r.text) && !citationsOn(r.text.slice(r.text.indexOf('Switch:'))).cites.length) out.push({ code: 'precedence', detail: `${at}: Switch: carries no citation` });
    if (r.state !== 'proposed' && (!symbol || !symCites.length)) out.push({ code: 'feature-symbol', detail: `${at}: a ${r.state} capability needs a backticked symbol and its citation in the Symbol cell` });
    if (r.state === 'verified-shipped' || r.state === 'shipped-unverified') {
      const implPaths = new Set(symCites.map((s) => s.path));
      const reach = citationsOn(r.reached).cites;
      if (!reach.length) out.push({ code: 'reached-from', detail: `${at}: a ${r.state} capability needs a Reached from: citation` });
      else if (reach.every((x) => implPaths.has(x.path))) out.push({ code: 'reached-from', detail: `${at}: Reached from must cite a file other than the implementation file` });
    }
    if (r.state === 'verified-shipped') {
      const tm = /`([^`]+)`\s*\(([\w-]+)\)/.exec(r.test);
      if (!tm) { out.push({ code: 'proving-test', detail: `${at}: verified-shipped needs \`test path\` (depth) in the Test cell` }); continue; }
      const [, tpath, depth] = tm;
      const ttext = ctx.read(tpath);
      if (!DEPTHS.includes(depth)) out.push({ code: 'test-depth', detail: `${at}: depth "${depth}" is not one of ${DEPTHS.join(' | ')}` });
      if (ttext === null || !tpath.startsWith(TEST_ROOT)) { out.push({ code: 'proving-test', detail: `${at}: ${tpath} is not an existing file under ${TEST_ROOT}` }); continue; }
      const runner = ctx.runnerFor(tpath.slice(TEST_ROOT.length));
      if (!runner) out.push({ code: 'proving-test', detail: `${at}: ${tpath} is collected by no CI runner (test-file-discovery)` });
      if (symbol && !ttext.includes(symbol)) out.push({ code: 'proving-test', detail: `${at}: ${tpath} does not contain the symbol ${symbol}` });
      const isVs = runner && runner.startsWith('vscode-test');
      const isNode = runner && runner.startsWith('node --test');
      const isPw = runner === 'playwright';
      const okDepth = depth === 'installed-vscode' ? isVs
        : depth === 'playwright-stubbed' ? isPw
          : depth === 'jsdom' ? (isVs || isNode) && /jsdom/i.test(ttext)
            : depth === 'live-service' ? !!runner : (isVs || isNode);
      if (runner && DEPTHS.includes(depth) && !okDepth) out.push({ code: 'test-depth', detail: `${at}: depth ${depth} does not match ${tpath}'s runner (${runner})` });
    }
  }
  if (ct.catalog) {
    const have = new Set(ct.rows.map((r) => r.capability));
    for (const cap of ct.catalog.capabilities) if (!have.has(cap)) out.push({ code: 'catalog-capability', detail: `${ct.path}: the catalog declares ${cap} for ${ct.id}; the Feature state table has no row for it` });
  }
  return out;
}

// ------------------------------------------------------------------ portfolio (LD4)

function parsePortfolio(text, file = PORTFOLIO) {
  const problems = [];
  const secs = sectionsOf(text || '');
  const sec = (name) => secs.find((s) => s.name === name);
  const need = (name, first) => {
    const t = tableRows(sec(name), first);
    if (!t) problems.push({ code: 'portfolio', detail: `${file}: "## ${name}" has no table headed | ${first} | ...` });
    return t ? t.rows : [];
  };
  const matrix = need('Portfolio matrix', 'Integration').map((r) => {
    const link = /\[([^\]]+)\]\(integrations\/([^)]+)\.md\)/.exec(r.cells[0] || '');
    return { id: link ? link[2] : null, label: link ? link[1] : r.cells[0], states: r.cells[2] || '', egress: r.cells[3] || '',
      depth: r.cells[4] || '', disposition: (r.cells[5] || '').replace(/\*/g, '').trim(), priority: (r.cells[6] || '').trim(), no: r.no };
  });
  const recon = need('Inventory reconciliation', 'Entry').map((r) => ({
    entry: backticked(r.cells[0] || '')[0] || (r.cells[0] || '').trim(), kind: (r.cells[1] || '').trim(), ld1: r.cells[2] || '',
    evidence: r.cells[3] || '', no: r.no, text: r.text }));
  const facts = need('Verified facts', 'Id').map((r) => ({ id: (r.cells[0] || '').trim(), fact: r.cells[1] || '', kind: (r.cells[2] || '').trim(),
    status: (r.cells[3] || '').trim(), evidence: r.cells[4] || '', backlog: (r.cells[5] || '').trim(), no: r.no, text: r.text }));
  const reviews = need('Legacy review map', 'Review').map((r) => ({ review: backticked(r.cells[0] || '')[0], contract: (r.cells[1] || '').replace(/`/g, '').trim(), no: r.no }));
  const counts = {};
  for (const r of need('Scan counts', 'Measure')) counts[backticked(r.cells[0] || '')[0] || r.cells[0]] = Number((r.cells[1] || '').trim());
  // #538: the dispositions are the owner's recorded decision, and COMPLETE is defined as finishing the named gaps.
  const decision = sec(`Owner decision (${OWNER_DECISION.ref})`);
  const decisionText = decision ? decision.lines.map((l) => l.text).join('\n') : '';
  if (!decision) problems.push({ code: 'portfolio', detail: `${file}: has no "## Owner decision (${OWNER_DECISION.ref})" section` });
  else if (!decisionText.includes(OWNER_DECISION.date) || !decisionText.includes(OWNER_DECISION.ref)) problems.push({ code: 'portfolio', detail: `${file}: the owner decision section does not record ${OWNER_DECISION.date} and ${OWNER_DECISION.ref}` });
  else if (!decisionText.includes('COMPLETE means finish the named gaps')) problems.push({ code: 'portfolio', detail: `${file}: the owner decision section must say "COMPLETE means finish the named gaps"` });
  // The stale framing is looked for where framing lives, the preamble and the decision section; a later
  // section may quote it as history.
  const preamble = (text || '').split(/\r?\n/).slice(0, secs.length ? secs[0].no - 1 : undefined).join('\n');
  if (/decision is recorded later/i.test(`${preamble}\n${decisionText}`)) problems.push({ code: 'portfolio', detail: `${file}: still says the owner's decision is recorded later` });
  // The stated Totals line agrees with the matrix rows.
  const totals = ((sec('Portfolio matrix') || { lines: [] }).lines.find((l) => /^Totals:/.test(l.text.trim())) || {}).text;
  const tm = totals && /^Totals: (\d+) contracts; [^;]*?(\d+) COMPLETE, (\d+) MAINTAIN, (\d+) RETIRE, (\d+) INVEST; priorities (\d+) at 1, (\d+) at 2, (\d+) at 3\.?$/.exec(totals.trim());
  if (!tm) problems.push({ code: 'totals', detail: `${file}: Portfolio matrix has no Totals line of the form "Totals: N contracts; ... N COMPLETE, N MAINTAIN, N RETIRE, N INVEST; priorities N at 1, N at 2, N at 3."` });
  else {
    const n = (f) => matrix.filter(f).length;
    const want = [['contracts', matrix.length],
      ...['COMPLETE', 'MAINTAIN', 'RETIRE', 'INVEST'].map((d) => [d, n((m) => m.disposition === d)]),
      ...['1', '2', '3'].map((p) => [`priority ${p}`, n((m) => m.priority === p)])];
    want.forEach(([label, count], i) => {
      if (Number(tm[i + 1]) !== count) problems.push({ code: 'totals', detail: `${file}: Totals states ${tm[i + 1]} for ${label}; the matrix has ${count}` });
    });
  }
  // Every citation in the portfolio uses the grammar (resolution is checked by the caller).
  const citations = [];
  (text || '').split(/\r?\n/).forEach((line, i) => {
    const { cites, bad } = citationsOn(line);
    for (const b of bad) problems.push({ code: 'citation-grammar', detail: `${file}:${i + 1}: ${b} is citation-shaped but not \`path:L\` (\`anchor\`)` });
    for (const c of cites) citations.push({ ...c, no: i + 1 });
  });
  return { matrix, recon, facts, reviews, counts, citations, problems };
}

/** `folded into <id>`, `shared by <id>, <id>` or `not an integration: <reason>`; returns the ids it names. */
function reconKind(kind) {
  let m;
  if ((m = /^folded into `?([\w-]+)`?$/.exec(kind))) return { type: 'folded', ids: [m[1]] };
  if ((m = /^shared by (.+)$/.exec(kind))) return { type: 'shared', ids: m[1].split(',').map((s) => s.replace(/`/g, '').trim()) };
  if (/^not an integration: \S/.test(kind)) return { type: 'not', ids: [], reason: kind };
  return null;
}

// ------------------------------------------------------------------ validation

/**
 * inputs: { sources: [{path,text}], read(path) -> text|null, listDir(dirPath) -> [rel paths of files under it],
 *   exists(path) -> bool, integrationEntries: [names], reviews: [paths], contracts: [{id,path,text}],
 *   portfolioText, backlogText, archIndexText, govIndexText, requiredIds, runnerFor }
 */
function validate(inputs) {
  const problems = [];
  const add = (code, detail) => problems.push({ code, detail });
  const read = inputs.read;

  // Scans.
  const sites = inputs.sources.flatMap(scan1);
  const scan1Files = [...new Set(sites.map((s) => s.path))].sort();
  const scan2Files = inputs.sources.filter(scan2).map((f) => f.path).sort();
  const hits = [...new Set([...scan1Files, ...scan2Files])].sort();

  // Catalog.
  const catalog = parseCatalog(read(CATALOG_FILE) || '') || [];
  if (!catalog.length) add('catalog', `${CATALOG_FILE}: no ids parsed from INTEGRATION_CATALOG`);

  // Contracts.
  const parsed = inputs.contracts.map((c) => parseContract(c));
  const byId = new Map(parsed.map((c) => [c.id, c]));
  for (const c of parsed) {
    c.catalog = catalog.find((e) => e.id === c.id) || null;
    problems.push(...c.problems);
    for (const ct of c.citations) for (const p of citationProblems(ct, read)) add('citation', `${c.path}:${ct.no}: ${p}`);
    problems.push(...featureStateProblems(c, { read, runnerFor: inputs.runnerFor }));
  }
  // Ownership: every owned path exists; no file is owned twice.
  const owner = new Map();
  for (const c of parsed) {
    for (const o of c.owned) {
      const files = o.path.endsWith('/') ? inputs.listDir(o.path) : (inputs.exists(o.path) ? [o.path] : []);
      if (!files.length) { add('owned-missing', `${c.path}:${o.no}: owned path ${o.path} does not exist`); continue; }
      for (const f of files) {
        if (owner.has(f) && owner.get(f) !== c.id) add('owned-twice', `${f} is owned by both ${owner.get(f)} and ${c.id}`);
        else owner.set(f, c.id);
      }
    }
  }
  const ownedDirs = new Set(parsed.flatMap((c) => c.owned.map((o) => o.path)));

  // Portfolio.
  const pf = parsePortfolio(inputs.portfolioText);
  problems.push(...pf.problems);
  for (const ct of pf.citations) for (const p of citationProblems(ct, read)) add('citation', `${PORTFOLIO}:${ct.no}: ${p}`);
  // The scenarios document claims nothing as built without a citation that resolves.
  (inputs.scenariosText || '').split(/\r?\n/).forEach((line, i) => {
    const { cites, bad } = citationsOn(line);
    for (const b of bad) add('citation-grammar', `${SCENARIOS}:${i + 1}: ${b} is citation-shaped but not \`path:L\` (\`anchor\`)`);
    for (const ct of cites) for (const p of citationProblems(ct, read)) add('citation', `${SCENARIOS}:${i + 1}: ${p}`);
  });
  const recon = new Map();
  for (const r of pf.recon) {
    const k = reconKind(r.kind);
    if (!k) { add('reconciliation', `${PORTFOLIO}:${r.no}: "${r.kind}" is not folded into <id>, shared by <id>, <id> or not an integration: <reason>`); continue; }
    for (const id of k.ids) if (!byId.has(id)) add('reconciliation', `${PORTFOLIO}:${r.no}: ${id} is not a contract id`);
    if (!citationsOn(r.evidence).cites.length && !/\bunverified\b/i.test(r.evidence)) add('reconciliation', `${PORTFOLIO}:${r.no}: the row carries no citation and does not say unverified`);
    if (recon.has(r.entry)) add('reconciliation', `${PORTFOLIO}:${r.no}: ${r.entry} has two rows`);
    recon.set(r.entry, { ...r, k });
  }
  const covered = (entry) => byId.has(entry) || ownedDirs.has(entry) || owner.has(entry) || recon.has(entry);

  // Coverage: catalog ids (a contract each), integrations entries, LD1 ids, scan hits.
  for (const e of catalog) if (!byId.has(e.id)) add('coverage', `catalog id ${e.id} has no contract ${CONTRACT_DIR}${e.id}.md`);
  for (const id of inputs.requiredIds) if (!byId.has(id) && !recon.has(id)) add('coverage', `LD1 integration ${id} has no contract and no reconciliation row`);
  for (const name of inputs.integrationEntries) {
    const entry = name.includes('.') ? `${INTEGRATIONS_DIR}${name}` : `${INTEGRATIONS_DIR}${name}/`;
    if (!covered(entry)) add('coverage', `${entry} is owned by no contract and has no reconciliation row`);
  }
  const browserRows = BROWSER_PREFIXES.filter((p) => recon.has(p) && recon.get(p).kind === SAME_ORIGIN);
  let browserTargets = 0; let loopbackTargets = 0; const targets = [];
  const browserFiles = hits.filter(isBrowser);
  for (const f of hits) {
    const dirRow = [...recon.keys()].find((k) => k.endsWith('/') && k.startsWith(INTEGRATIONS_DIR) && f.startsWith(k));
    const ownedByDir = [...ownedDirs].some((d) => d.endsWith('/') && f.startsWith(d));
    const prefixRow = browserRows.find((p) => f.startsWith(p));
    if (!(owner.has(f) || recon.has(f) || ownedByDir || dirRow || prefixRow)) add('coverage', `scan hit ${f} is owned by no contract and has no reconciliation row`);
  }
  for (const f of browserFiles) {
    const file = { path: f, text: read(f) || '' };
    const allow = allowlistFor(f);
    for (const s of sites.filter((x) => x.path === f && x.arg !== null)) {
      browserTargets += 1;
      const v = classifyTarget(s.arg, file, allow);
      targets.push({ path: f, line: s.line, kind: s.kind, arg: s.arg, ...v });
      if (!v.ok) add('browser-target', `${f}:${s.line}: ${s.kind} target fails rules (a)-(e): ${v.why}`);
      else if (v.rule === 'd') {
        loopbackTargets += 1;
        const row = recon.get(f);
        if (!row || !(row.k.type === 'folded' || /^not an integration: loopback/.test(row.kind))) add('browser-loopback', `${f}:${s.line}: a loopback target needs a per-file row (not an integration: loopback, or folded into <id>)`);
      }
    }
    if (!prefixRowFor(f, browserRows) && !owner.has(f) && !recon.has(f)) add('coverage', `browser module ${f} is not under a "${SAME_ORIGIN}" prefix row`);
  }
  for (const p of baseDefinitionProblems(read, inputs.sources)) add('browser-base', p);

  // Matrix: one row per contract; values in their vocabularies; dispositions agree.
  const seen = new Set();
  for (const m of pf.matrix) {
    if (!m.id || !byId.has(m.id)) { add('matrix', `${PORTFOLIO}:${m.no}: ${m.label} links to no contract`); continue; }
    if (seen.has(m.id)) add('matrix', `${PORTFOLIO}:${m.no}: ${m.id} has two matrix rows`);
    seen.add(m.id);
    const states = m.states.split(',').map((s) => s.trim()).filter(Boolean);
    if (!states.length || states.some((s) => !STATES.includes(s))) add('matrix', `${PORTFOLIO}:${m.no}: feature state "${m.states}" is not a list of the five states`);
    const rowStates = [...new Set(byId.get(m.id).rows.map((r) => r.state))].sort();
    if (JSON.stringify([...new Set(states)].sort()) !== JSON.stringify(rowStates)) add('matrix', `${PORTFOLIO}:${m.no}: ${m.id} lists states ${states.join(', ')}; its contract has ${rowStates.join(', ')}`);
    if (!/^(yes|no)$/.test(m.egress.trim())) add('matrix', `${PORTFOLIO}:${m.no}: network egress must be yes or no`);
    const depths = m.depth.split(',').map((s) => s.trim()).filter(Boolean);
    if (!depths.length || depths.some((d) => d !== 'none' && !DEPTHS.includes(d))) add('matrix', `${PORTFOLIO}:${m.no}: test depth "${m.depth}" is not from ${DEPTHS.join(' | ')} or none`);
    if (!DISPOSITIONS.includes(m.disposition)) add('matrix', `${PORTFOLIO}:${m.no}: disposition "${m.disposition}" is not one of ${DISPOSITIONS.join(', ')}`);
    else if (byId.get(m.id).disposition && byId.get(m.id).disposition !== m.disposition) add('matrix', `${PORTFOLIO}:${m.no}: ${m.id} is ${m.disposition} here and ${byId.get(m.id).disposition} in its contract`);
    if (!/^[123]$/.test(m.priority)) add('matrix', `${PORTFOLIO}:${m.no}: priority must be 1, 2 or 3`);
  }
  for (const c of parsed) if (!seen.has(c.id)) add('matrix', `${c.id} has no matrix row`);

  // Verified facts.
  const backlogIds = new Set([...(inputs.backlogText || '').matchAll(/\[(B\d+)\]/g)].map((m) => m[1]));
  for (const id of FACT_IDS) {
    const rows = pf.facts.filter((f) => f.id === id);
    if (rows.length !== 1) { add('facts', `${PORTFOLIO}: fact ${id} appears ${rows.length} times (needs exactly one row)`); continue; }
    const f = rows[0];
    if (!['confirmed', 'not-reproduced'].includes(f.status)) add('facts', `${PORTFOLIO}:${f.no}: ${id} status "${f.status}" is not confirmed or not-reproduced`);
    if (!['defect', 'behaviour'].includes(f.kind)) add('facts', `${PORTFOLIO}:${f.no}: ${id} kind "${f.kind}" is not defect or behaviour`);
    if (!citationsOn(f.evidence).cites.length) add('facts', `${PORTFOLIO}:${f.no}: ${id} has no citation`);
    const bs = [...f.backlog.matchAll(/B\d+/g)].map((m) => m[0]);
    if (f.status === 'confirmed' && f.kind === 'defect' && !bs.length) add('facts', `${PORTFOLIO}:${f.no}: ${id} is a confirmed defect with no B-number`);
    for (const b of bs) if (!backlogIds.has(b)) add('facts', `${PORTFOLIO}:${f.no}: ${b} is not a [${b}] item in docs/BACKLOG.md`);
  }
  for (const f of pf.facts) if (!FACT_IDS.includes(f.id)) add('facts', `${PORTFOLIO}:${f.no}: unknown fact id ${f.id}`);

  // Retirement reviews (#538): exactly one per RETIRE contract, none elsewhere; each names a backlog item,
  // is linked from the portfolio, and its whole-file citations resolve.
  for (const c of parsed) {
    for (const fc of c.fileCitations) for (const p of fileCitationProblems(fc, read, c.path)) add('citation', `${c.path}:${fc.no}: ${p}`);
    if (c.disposition !== 'RETIRE') {
      if (c.reviews.length) add('retirement', `${c.path}: only a RETIRE contract has a "## ${RETIREMENT_SECTION}" section`);
      continue;
    }
    if (c.reviews.length !== 1) { add('retirement', `${c.path}: a RETIRE contract must have exactly one "## ${RETIREMENT_SECTION}" section (has ${c.reviews.length})`); continue; }
    const text = c.reviews[0].lines.map((l) => l.text).join('\n');
    const bs = [...text.matchAll(/\[(B\d+)\]/g)].map((m) => m[1]);
    if (!bs.length) add('retirement', `${c.path}: the ${RETIREMENT_SECTION} names no [Bnnn] backlog item`);
    for (const b of new Set(bs)) if (!backlogIds.has(b)) add('retirement', `${c.path}: ${b} is not a [${b}] item in docs/BACKLOG.md`);
    const reviewLink = new RegExp(`\\]\\([^)\\s]*integrations/${escapeRe(c.id)}\\.md#retirement-review-538\\)`);
    if (!reviewLink.test(inputs.portfolioText || '')) add('retirement', `${PORTFOLIO} does not link integrations/${c.id}.md#retirement-review-538`);
  }

  // Legacy reviews: one review to one contract, by the portfolio's map, cited in the contract body.
  const map = new Map(pf.reviews.map((r) => [r.review, r.contract]));
  for (const rv of inputs.reviews) {
    const citing = parsed.filter((c) => c.text.includes(rv)).map((c) => c.id);
    if (!map.has(rv)) add('legacy-review', `${rv} is not in the portfolio's Legacy review map`);
    else if (citing.length !== 1 || citing[0] !== map.get(rv)) add('legacy-review', `${rv} maps to ${map.get(rv)} but is cited by [${citing.join(', ')}]`);
  }
  for (const r of pf.reviews) if (!inputs.reviews.includes(r.review)) add('legacy-review', `${PORTFOLIO}:${r.no}: ${r.review} is not one of the legacy reviews`);

  // Registration.
  const reg = archChecker.parseRegistry(inputs.archIndexText || '');
  const rowsById = new Map(reg.rows.map((r) => [r.id, r]));
  const regIds = new Set(reg.rows.map((r) => r.id));
  const want = [
    ...parsed.map((c) => ({ id: `integration-contract-${c.id}`, domain: `integration-contract-${c.id}`, doc: `architecture/integrations/${c.id}.md`, contract: true })),
    { id: 'integration-portfolio', doc: 'architecture/INTEGRATION_PORTFOLIO.md' },
    { id: 'integration-scenarios', doc: 'architecture/INTEGRATION_SCENARIOS.md' },
  ];
  for (const w of want) {
    const r = rowsById.get(w.id);
    if (!r) { add('registry', `docs/ARCHITECTURE_INDEX.md has no registry row ${w.id}`); continue; }
    if (r.status !== 'canonical') add('registry', `${w.id}: status must be canonical`);
    if (w.domain && r.domain.trim().toLowerCase() !== w.domain) add('registry', `${w.id}: domain must be ${w.domain}`);
    if (!new RegExp(`^\\[[^\\]]+\\]\\(${escapeRe(w.doc)}\\)$`).test(r.doc)) add('registry', `${w.id}: doc must link ${w.doc}`);
    if (!r.owner || r.owner === '-') add('registry', `${w.id}: owner is empty`);
    if (w.contract && !/more than 3 lines/.test(r.updated_by || '')) add('registry', `${w.id}: updated_by must say that moving cited code by more than 3 lines requires updating the citation`);
    const related = (r.related || '-').split(',').map((s) => s.trim()).filter((s) => s && s !== '-');
    for (const x of related) if (!regIds.has(x)) add('registry', `${w.id}: related id ${x} is not registered`);
  }
  const gov = inputs.govIndexText || '';
  const cut = gov.indexOf('## Out-of-tier paths');
  const tierOf = (p) => {
    const at = gov.indexOf(`| \`${p}\` |`);
    if (at < 0 || (cut >= 0 && at > cut)) return null;
    const heads = [...gov.slice(0, at).matchAll(/^## (Tier \d)/gm)];
    return heads.length ? heads[heads.length - 1][1] : null;
  };
  for (const [p, tier] of [...parsed.map((c) => [c.path, 'Tier 5']), [PORTFOLIO, 'Tier 5'], [SCENARIOS, 'Tier 2']]) {
    const count = gov.split(`| \`${p}\` |`).length - 1;
    if (count !== 1) add('governance-index', `${p} has ${count} rows in docs/GOVERNANCE_INDEX.md (needs exactly one)`);
    else if (tierOf(p) !== tier) add('governance-index', `${p} is registered in ${tierOf(p)}; expected ${tier}`);
  }

  // Reported counts (criterion 4): the portfolio's numbers are the computed numbers.
  const computed = {
    'scan-1-files': scan1Files.length, 'scan-1-call-sites': sites.length, 'scan-2-files': scan2Files.length,
    'browser-files': browserFiles.length, 'browser-targets': browserTargets, 'loopback-targets': loopbackTargets,
    'catalog-ids': catalog.length, 'integration-entries': inputs.integrationEntries.length, contracts: parsed.length,
  };
  for (const k of SCAN_COUNT_KEYS) {
    if (!(k in pf.counts)) add('counts', `${PORTFOLIO}: Scan counts has no row \`${k}\``);
    else if (pf.counts[k] !== computed[k]) add('counts', `${PORTFOLIO}: \`${k}\` is reported as ${pf.counts[k]}; computed ${computed[k]}`);
  }
  return { problems, computed, scan1Files, scan2Files, sites, targets, catalog, contracts: parsed, portfolio: pf };
}

const prefixRowFor = (f, rows) => rows.find((p) => f.startsWith(p));

// ------------------------------------------------------------------ repository inputs

function walkFiles(abs, out = []) {
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, e.name);
    if (e.isDirectory()) walkFiles(full, out); else out.push(full);
  }
  return out;
}
const toRel = (abs) => path.relative(REPO_ROOT, abs).split(path.sep).join('/');

function repoInputs() {
  const cache = new Map();
  const read = (p) => {
    if (!cache.has(p)) { try { cache.set(p, fs.readFileSync(path.join(REPO_ROOT, p), 'utf8')); } catch { cache.set(p, null); } }
    return cache.get(p);
  };
  const isSource = (rel) => /\.(ts|js|cjs|mjs|html)$/.test(rel) && !rel.endsWith('.d.ts') && !rel.startsWith(TEST_ROOT)
    && !/\.(test|spec)\.[cm]?[jt]s$/.test(rel) && !rel.startsWith(`${SRC}/roadmap/ui/vendor/`);
  const sources = walkFiles(path.join(REPO_ROOT, SRC)).map(toRel).filter(isSource).sort().map((p) => ({ path: p, text: read(p) }));
  const contracts = walkFiles(path.join(REPO_ROOT, CONTRACT_DIR)).map(toRel).filter((p) => p.endsWith('.md')).sort()
    .map((p) => ({ id: path.basename(p, '.md'), path: p, text: read(p) }));
  return {
    sources, read, contracts, runnerFor,
    exists: (p) => fs.existsSync(path.join(REPO_ROOT, p)) && fs.statSync(path.join(REPO_ROOT, p)).isFile(),
    listDir: (d) => walkFiles(path.join(REPO_ROOT, d)).map(toRel).filter(isSource),
    integrationEntries: fs.readdirSync(path.join(REPO_ROOT, INTEGRATIONS_DIR), { withFileTypes: true })
      .filter((e) => e.isDirectory() || /\.ts$/.test(e.name)).map((e) => e.name).sort(),
    reviews: fs.readdirSync(path.join(REPO_ROOT, REVIEW_DIR)).filter((n) => /_CONTRACT_REVIEW\.md$/.test(n)).map((n) => `${REVIEW_DIR}${n}`).sort(),
    portfolioText: read(PORTFOLIO) || '', scenariosText: read(SCENARIOS) || '', backlogText: read('docs/BACKLOG.md') || '',
    archIndexText: read('docs/ARCHITECTURE_INDEX.md') || '', govIndexText: read('docs/GOVERNANCE_INDEX.md') || '',
    requiredIds: LD1_OTHER_IDS,
  };
}

// ------------------------------------------------------------------ fixture world

const P = (rel) => `${SRC}/${rel}`;
const FX_TEST = P('test/integrations/alpha/alpha.test.ts');
const FX_IMPL = P('integrations/alpha/alpha-client.ts');
const FX_REG = P('extension/alpha-command.ts');

function fixtureFiles() {
  return {
    [CATALOG_FILE]: "export const INTEGRATION_CATALOG: readonly IntegrationDescriptor[] = [\n  {\n    id: 'alpha',\n    capabilities: ['notify'],\n  },\n];\nexport function f(d: { id: string }) { return { id: d.id }; }\n",
    [FX_IMPL]: "import * as https from 'https';\nexport function sendAlpha(url: string) {\n  return https.request(url);\n}\n",
    [FX_REG]: "import { sendAlpha } from '../integrations/alpha/alpha-client';\nexport function registerAlpha() {\n  vscode.commands.registerCommand('failsafe.alpha.send', () => sendAlpha('x'));\n}\n",
    [FX_TEST]: "import { sendAlpha } from '../../../integrations/alpha/alpha-client';\nsuite('alpha', () => { test('sends', () => sendAlpha('u')); });\n",
    [P('roadmap/ui/modules/connection.js')]: [
      'export class ConnectionClient {', '  constructor(options = {}) {', "    this.baseUrl = options.baseUrl || '';",
      '    this.wsUrl = options.wsUrl || `ws://${window.location.host}`;', '    Object.assign(this, createRestApi(this.baseUrl));', '  }',
      '  connect() { this.ws = new WebSocket(this.wsUrl); }', '  hub() { return fetch(`${this.baseUrl}/api/hub`); }',
      "  probe() { return fetch('http://localhost:11434/api/tags'); }",
      '  switchServer(port) { this.baseUrl = `http://localhost:${port}`; this.wsUrl = `ws://localhost:${port}`; }', '}', ''].join('\n'),
    [P('roadmap/ui/modules/rest-api.js')]: 'export function createRestApi(baseUrl) {\n  return { a() { return fetch(`${baseUrl}/api/skills`); } };\n}\n',
    [P('roadmap/ui/command-center.js')]: "const client = new ConnectionClient();\nfetch('/api/v1/x');\n",
    [P('webui/protocol.ts')]: 'export class ApiHostBridge {\n  constructor(\n    private baseUrl = typeof (globalThis as any).window !== "undefined"\n      ? (globalThis as any).window.location.origin\n      : "http://localhost:9376",\n  ) {}\n  run() { return fetch(`${this.baseUrl}/api/v1/command`); }\n}\nexport function createHostBridge(\n  apiBaseUrl = typeof (globalThis as any).window !== "undefined"\n    ? (globalThis as any).window.location.origin\n    : "http://localhost:9376",\n) { return new ApiHostBridge(apiBaseUrl); }\n',
    [P('webui/lib/failsafe-client.ts')]: 'export class FailSafeClient {\n  constructor(\n    private baseUrl = typeof (globalThis as any).window !== "undefined"\n      ? (globalThis as any).window.location.origin\n      : "http://localhost:9376",\n  ) {}\n  get(p) { return fetch(`${this.baseUrl}${p}`); }\n}\n',
  };
}

const CONTRACT_SECTIONS_TEXT = (over = {}) => SECTIONS.map((name) => {
  if (over[name] !== undefined) return `## ${name}\n\n${over[name]}\n`;
  if (name === 'Feature state') {
    return `## Feature state\n\n| Capability | State | Symbol | Reached from | Test (depth) | Notes |\n|---|---|---|---|---|---|\n` +
      `| notify | verified-shipped | \`sendAlpha\` \`${FX_IMPL}:2\` (\`export function sendAlpha\`) | \`${FX_REG}:3\` (\`registerCommand('failsafe.alpha.send'\`) | \`${FX_TEST}\` (unit) | - |\n`;
  }
  if (name === 'Recommended disposition') return '## Recommended disposition\n\nOwner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. It works.\n';
  if (NON_FACTUAL.has(name)) return `## ${name}\n\nPlain text.\n`;
  return `## ${name}\n\nSends one request \`${FX_IMPL}:3\` (\`https.request(url)\`).\n`;
}).join('\n');

function fixtureContract(over = {}, owned = [P('integrations/alpha/')], extra = '') {
  return `# Alpha integration contract\n\n**Owned files:**\n${owned.map((o) => `- \`${o}\``).join('\n')}\n\n${extra}\n${CONTRACT_SECTIONS_TEXT(over)}`;
}

const FX_COUNTS = { 'scan-1-files': 6, 'scan-1-call-sites': 8, 'scan-2-files': 0, 'browser-files': 5, 'browser-targets': 7,
  'loopback-targets': 1, 'catalog-ids': 1, 'integration-entries': 2, contracts: 1 };

/** The Totals line a portfolio states for these matrix rows. */
function totalsLine(rows) {
  const cells = rows.map(cellsOf);
  const d = (k) => cells.filter((c) => (c[5] || '').replace(/\*/g, '').trim() === k).length;
  const p = (k) => cells.filter((c) => (c[6] || '').trim() === k).length;
  return `Totals: ${rows.length} contracts; owner dispositions ${d('COMPLETE')} COMPLETE, ${d('MAINTAIN')} MAINTAIN, ${d('RETIRE')} RETIRE, ${d('INVEST')} INVEST; priorities ${p('1')} at 1, ${p('2')} at 2, ${p('3')} at 3.`;
}

const FX_DECISION = ['## Owner decision (#538)', '',
  'Owner decision of 2026-10-18 (#538): the recommendations are accepted as work-queue dispositions; COMPLETE means finish the named gaps.'];

function fixturePortfolio(over = {}) {
  const counts = { ...FX_COUNTS, ...(over.counts || {}) };
  const matrix = over.matrix || ['| [alpha](integrations/alpha.md) | send | verified-shipped | yes | unit | MAINTAIN | 2 |'];
  const totals = over.totals === undefined ? [totalsLine(matrix), ''] : over.totals === null ? [] : [over.totals, ''];
  const facts = FACT_IDS.map((id) => `| ${id} | fact | behaviour | confirmed | \`${FX_IMPL}:2\` (\`export function sendAlpha\`) | - |`);
  const recon = over.recon || [
    `| \`${INTEGRATIONS_DIR}catalog/\` | not an integration: registry | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`,
    `| \`${SRC}/roadmap/ui/\` | ${SAME_ORIGIN} | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`,
    `| \`${SRC}/webui/\` | ${SAME_ORIGIN} | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`,
    `| \`${SRC}/roadmap/ui/modules/connection.js\` | folded into alpha | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`,
  ];
  return [
    '# Integration portfolio', '', ...(over.decision || FX_DECISION), ...(over.links || []), '',
    '## Portfolio matrix', '', '| Integration | Customer job | Feature state | Network egress | Test depth | Disposition (owner, #538) | Priority |',
    '|---|---|---|---|---|---|---|', ...matrix, '', ...totals,
    '## Scan counts', '', '| Measure | Count |', '|---|---|', ...Object.entries(counts).map(([k, v]) => `| \`${k}\` | ${v} |`), '',
    '## Inventory reconciliation', '', '| Entry | Reconciliation | LD1 difference | Evidence |', '|---|---|---|---|', ...recon, '',
    '## Verified facts', '', '| Id | Fact | Kind | Status | Evidence | Backlog |', '|---|---|---|---|---|---|', ...(over.facts || facts), '',
    '## Legacy review map', '', '| Review | Contract |', '|---|---|', ...(over.reviews || [`| \`${REVIEW_DIR}ALPHA_CONTRACT_REVIEW.md\` | alpha |`]), '',
    ...(over.tail || []),
  ].join('\n');
}

const FX_ARCH = (rows) => ['# Architecture Index', '', '## Registry', '',
  '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |',
  '|---|---|---|---|---|---|---|---|---|---|---|', ...rows, ''].join('\n');
const FX_ARCH_ROWS = [
  '| integration-contract-alpha | integration-contract-alpha | [Alpha](architecture/integrations/alpha.md) | canonical | `/qor-plan` | - | integration-portfolio | - | unknown | unknown | `/qor-plan` when alpha changes; moving cited code by more than 3 lines requires updating the citation |',
  '| integration-portfolio | integration portfolio | [Portfolio](architecture/INTEGRATION_PORTFOLIO.md) | canonical | `/qor-plan` | - | - | - | unknown | unknown | `/qor-plan` |',
  '| integration-scenarios | integration scenarios | [Scenarios](architecture/INTEGRATION_SCENARIOS.md) | canonical | `/qor-plan` | - | - | - | unknown | unknown | `/qor-plan` |',
];
const FX_GOV = ['# Governance Index', '', '## Tier 2 — Doctrine', '', '| Path | Purpose | Owner |', '|---|---|---|', `| \`${SCENARIOS}\` | s | o |`, '',
  '## Tier 5 — Reference Material', '', '| Path | Purpose |', '|---|---|', `| \`${CONTRACT_DIR}alpha.md\` | a |`, `| \`${PORTFOLIO}\` | p |`, '',
  '## Tier 6 — Archived', '', '## Out-of-tier paths', ''].join('\n');

function assertHas(input, code, re) {
  const r = validate(input);
  assert.ok(r.problems.some((p) => p.code === code && (!re || re.test(p.detail))), `expected a ${code} problem${re ? ` matching ${re}` : ''}, got:\n${report(r)}`);
  return r;
}

/** A complete, valid in-memory world; `over` replaces parts of it. */
function world(over = {}) {
  const files = { ...fixtureFiles(), ...(over.files || {}) };
  for (const k of Object.keys(files)) if (files[k] === null) delete files[k];
  const contractText = over.contractText ?? fixtureContract({}, undefined, `Legacy review: \`${REVIEW_DIR}ALPHA_CONTRACT_REVIEW.md\`.`);
  const contracts = [{ id: 'alpha', path: `${CONTRACT_DIR}alpha.md`, text: contractText }, ...(over.moreContracts || [])];
  const isSrc = (p) => p.startsWith(SRC) && !p.startsWith(TEST_ROOT);
  const input = {
    sources: Object.entries(files).filter(([p]) => isSrc(p)).map(([p, text]) => ({ path: p, text })),
    read: (p) => (p in files ? files[p] : null),
    exists: (p) => p in files,
    listDir: (d) => Object.keys(files).filter((p) => p.startsWith(d) && isSrc(p)),
    integrationEntries: over.integrationEntries || ['alpha', 'catalog'],
    reviews: over.reviews || [`${REVIEW_DIR}ALPHA_CONTRACT_REVIEW.md`],
    contracts,
    portfolioText: over.portfolioText ?? fixturePortfolio(over.portfolio || {}),
    backlogText: over.backlogText ?? '- [ ] [B300] item',
    archIndexText: over.archIndexText ?? FX_ARCH(FX_ARCH_ROWS),
    govIndexText: over.govIndexText ?? FX_GOV,
    requiredIds: over.requiredIds || ['alpha'],
    runnerFor,
  };
  // The reported counts follow the world unless a fixture pins them (the counts rule has its own fixture).
  if (over.portfolioText === undefined && !(over.portfolio && over.portfolio.counts)) {
    input.portfolioText = fixturePortfolio({ ...(over.portfolio || {}), counts: validate(input).computed });
  }
  return input;
}

const codes = (r) => [...new Set(r.problems.map((p) => p.code))].sort();
const report = (r) => r.problems.map((p) => `${p.code}: ${p.detail}`).join('\n');
function assertOnly(input, code, re) {
  const r = validate(input);
  assert.deepEqual(codes(r), [code], `expected only ${code}, got:\n${report(r)}`);
  if (re) assert.ok(r.problems.some((p) => re.test(p.detail)), `no ${code} problem matches ${re}:\n${report(r)}`);
  return r;
}
const withBrowser = (body) => world({ files: { [P('roadmap/ui/modules/probe.js')]: body } });

// ------------------------------------------------------------------ tests

describe('FX1003 integration contracts: the fixture world is clean', () => {
  it('a complete world produces no problem (a check that fired on everything fails here)', () => {
    const r = validate(world());
    assert.deepEqual(r.problems, [], report(r));
    assert.deepEqual(r.computed, FX_COUNTS);
  });
});

describe('FX1003 integration contracts: scans', () => {
  it('scan 1 finds calls and skips method definitions', () => {
    const f = { path: 'x.js', text: "async fetch() {\n}\nfetch() {\n}\nconst r = await fetch('/a');\nthis.fetch('/b');\nhttps.request(o);\nnew EventSource(u);\n" };
    assert.deepEqual(scan1(f).map((s) => `${s.kind}@${s.line}`), ['fetch(@5', 'http.request(@7', 'new EventSource(@8']);
    const commented = { path: 'y.ts', text: "/**\n * uses fetch() and EventSource\n */\n// fetch('/x')\nconst re = /https?:\\/\\//; fetch('/real');\n" };
    assert.deepEqual(scan1(commented).map((s) => `${s.kind}@${s.line}`), ['fetch(@5'], 'a call in a comment is not a call; a regex literal is not a comment');
  });

  it('scan 2 needs a process call and a whole quoted network word, in any quote', () => {
    const t = (text) => scan2({ path: 'x.ts', text });
    assert.equal(t("spawn('npm', ['install'])"), true);
    assert.equal(t('spawn("git", ["clone"])'), true);
    assert.equal(t('execFile(tool, [`download`])'), true);
    assert.equal(t("spawn('npm', ['installer', 'uninstall'])"), false, 'a substring is not a network word');
    assert.equal(t("const words = ['install'];"), false, 'a network word without a process call is not a hit');
    assert.equal(t("/x/.exec(s); const w = 'push';"), false, 'RegExp.exec is not a process call');
  });

  it('an unowned egress file is red', () => {
    assertOnly(world({ files: { [P('services/Beacon.ts')]: "import * as https from 'https';\nhttps.request('h');\n" } }), 'coverage', /scan hit .*Beacon\.ts/);
  });

  it('an unowned file building pip arguments on one line and running this.runner on another is red', () => {
    const text = "const args = ['-m', 'pip', 'install', name];\nexport class X { run() { return this.runner('pip3', args); } }\n";
    assertOnly(world({ files: { [P('qorlogic/Sneaky.ts')]: text } }), 'coverage', /Sneaky\.ts/);
  });
});

describe('FX1003 integration contracts: coverage from the code', () => {
  it('a new catalog id without a contract is red', () => {
    const cat = fixtureFiles()[CATALOG_FILE].replace("];", "  {\n    id: 'beta',\n    capabilities: ['notify'],\n  },\n];");
    assertOnly(world({ files: { [CATALOG_FILE]: cat } }), 'coverage', /catalog id beta/);
  });

  it('catalog ids come only from quoted literals inside the array', () => {
    assert.deepEqual(parseCatalog(fixtureFiles()[CATALOG_FILE]).map((e) => e.id), ['alpha']);
  });

  it('a new integrations folder without an owner is red', () => {
    assertOnly(world({ integrationEntries: ['alpha', 'catalog', 'gamma'] }), 'coverage', /integrations\/gamma\//);
  });

  it('an LD1 integration with no contract is red', () => {
    assertOnly(world({ requiredIds: ['alpha', 'delta'] }), 'coverage', /LD1 integration delta/);
  });

  it('a file owned by two contracts, and a missing owned path, are red', () => {
    const second = { id: 'zeta', path: `${CONTRACT_DIR}zeta.md`, text: fixtureContract({}, [FX_IMPL]) };
    const r = validate(world({ moreContracts: [second] }));
    assert.ok(r.problems.some((p) => p.code === 'owned-twice'), report(r));
    assertOnly(world({ contractText: fixtureContract({}, [P('integrations/alpha/'), P('integrations/alpha/missing.ts')], `Legacy review: \`${REVIEW_DIR}ALPHA_CONTRACT_REVIEW.md\`.`) }), 'owned-missing');
  });
});

describe('FX1003 integration contracts: structure and citations', () => {
  const legacy = `Legacy review: \`${REVIEW_DIR}ALPHA_CONTRACT_REVIEW.md\`.`;
  it('sections out of LD2 order are red', () => {
    const text = fixtureContract({}, undefined, legacy).replace('## Measurable value', '## Measured value').replace('## Open defects', '## Measurable value\n\nx `' + FX_IMPL + ':3` (`https.request(url)`).\n\n## Open defects');
    assertOnly(world({ contractText: text }), 'contract-section', /out of LD2 order/);
    assertOnly(world({ contractText: fixtureContract({}, undefined, legacy).replace('## Graph links', '## Graph') }), 'contract-section', /Graph links/);
  });

  it('a factual line with no citation is red; unverified passes', () => {
    assertOnly(world({ contractText: fixtureContract({ Transformations: 'It maps fields.' }, undefined, legacy) }), 'uncited-line', /Transformations/);
    assert.deepEqual(validate(world({ contractText: fixtureContract({ Transformations: 'It maps fields (unverified).' }, undefined, legacy) })).problems, []);
  });

  it('an anchor that is absent, outside 3 lines, short, or a malformed citation token is red', () => {
    const at = (cite) => world({ contractText: fixtureContract({ 'Inbound fields': `Reads ${cite}.` }, undefined, legacy) });
    assertOnly(at(`\`${FX_IMPL}:3\` (\`not in the file at all\`)`), 'citation', /not within 3 lines/);
    assertOnly(at(`\`${P('roadmap/ui/modules/connection.js')}:1\` (\`switchServer(port)\`)`), 'citation', /not within 3 lines/);
    assertOnly(at(`\`${FX_IMPL}:3\` (\`https\`)`), 'citation', /shorter than 8/);
    assertOnly(at(`\`${FX_IMPL}:3-2\` (\`https.request(url)\`)`), 'citation', /no greater than M/);
    assertOnly(at(`\`${P('integrations/alpha/nope.ts')}:3\` (\`https.request(url)\`)`), 'citation', /does not exist/);
    assertHas(at(`\`alpha-client.ts:3\``), 'citation-grammar');
    assertOnly(at(`\`${FX_IMPL}:3\` (\`https.request(url)\`) and \`${FX_IMPL}:9\``), 'citation-grammar');
  });

  it('the window is L-3 to M+3, clamped to the file', () => {
    assert.deepEqual(citationProblems({ path: 'f', from: 5, to: 5, anchor: 'line-two' }, () => 'line-one\nline-two\nc\nd\ne\nf\ng\nh-anchor'), []);
    assert.equal(citationProblems({ path: 'f', from: 5, to: 5, anchor: 'line-one' }, () => 'line-one\nline-two\nc\nd\ne\nf').length, 1);
    assert.deepEqual(citationProblems({ path: 'f', from: 1, to: 1, anchor: 'line-four' }, () => 'a\nb\nc\nline-four\ne'), []);
  });
});

describe('FX1003 integration contracts: feature states', () => {
  const legacy = `Legacy review: \`${REVIEW_DIR}ALPHA_CONTRACT_REVIEW.md\`.`;
  const table = (row) => `| Capability | State | Symbol | Reached from | Test (depth) | Notes |\n|---|---|---|---|---|---|\n${row}`;
  const sym = `\`sendAlpha\` \`${FX_IMPL}:2\` (\`export function sendAlpha\`)`;
  const reach = `\`${FX_REG}:3\` (\`registerCommand('failsafe.alpha.send'\`)`;
  const withRow = (row, matrixStates = 'verified-shipped') => world({
    contractText: fixtureContract({ 'Feature state': table(row) }, undefined, legacy),
    portfolio: { matrix: [`| [alpha](integrations/alpha.md) | send | ${matrixStates} | yes | unit | MAINTAIN | 2 |`] },
  });

  it('a verified-shipped row without Reached from is red', () => {
    assertOnly(withRow(`| notify | verified-shipped | ${sym} | none | \`${FX_TEST}\` (unit) | - |`), 'reached-from');
  });

  it('Reached from in the implementation file is red', () => {
    assertOnly(withRow(`| notify | shipped-unverified | ${sym} | \`${FX_IMPL}:3\` (\`https.request(url)\`) | none | - |`, 'shipped-unverified'), 'reached-from', /other than the implementation/);
  });

  it('a row with Switch: that is not shipped-inert is red; shipped-inert without a switch is red', () => {
    assertOnly(withRow(`| notify | verified-shipped | ${sym} | ${reach} | \`${FX_TEST}\` (unit) | Switch: \`${FX_REG}:3\` (\`registerCommand('failsafe.alpha.send'\`) |`), 'precedence');
    assertOnly(withRow(`| notify | shipped-inert | ${sym} | none | none | off |`, 'shipped-inert'), 'precedence');
    assert.deepEqual(validate(withRow(`| notify | shipped-inert | ${sym} | none | none | Absent call site: nothing calls it (unverified) |`, 'shipped-inert')).problems, []);
  });

  it('an unknown state, a missing test, a test without the symbol and a depth that does not match the runner are red', () => {
    assertHas(withRow(`| notify | shipped | ${sym} | ${reach} | none | - |`, 'proposed'), 'feature-state', /"shipped" is not one of/);
    assertOnly(withRow(`| notify | verified-shipped | ${sym} | ${reach} | \`${P('test/nope.test.ts')}\` (unit) | - |`), 'proving-test');
    assertOnly(withRow(`| notify | verified-shipped | \`otherSymbol\` \`${FX_IMPL}:2\` (\`export function sendAlpha\`) | ${reach} | \`${FX_TEST}\` (unit) | - |`), 'proving-test', /does not contain the symbol otherSymbol/);
    assertOnly(withRow(`| notify | verified-shipped | ${sym} | ${reach} | \`${FX_TEST}\` (playwright-stubbed) | - |`), 'test-depth');
    assertOnly(withRow(`| notify | verified-shipped | ${sym} | ${reach} | \`${FX_TEST}\` (deep) | - |`), 'test-depth');
  });

  it('a catalog capability with no row is red', () => {
    assertOnly(withRow(`| other | verified-shipped | ${sym} | ${reach} | \`${FX_TEST}\` (unit) | - |`), 'catalog-capability', /notify/);
  });

  it('the matrix must list exactly the contract\'s states', () => {
    assertOnly(world({ portfolio: { matrix: ['| [alpha](integrations/alpha.md) | send | proposed | yes | unit | MAINTAIN | 2 |'] } }), 'matrix', /lists states/);
    assertOnly(world({ portfolio: { matrix: ['| [alpha](integrations/alpha.md) | send | verified-shipped | yes | unit | INVEST | 2 |'] } }), 'matrix', /INVEST here and MAINTAIN/);
  });
});

describe('FX1003 integration contracts: browser accept rules (a)-(e)', () => {
  it('(a) green: a relative literal, a ../ literal and a template led by / pass', () => {
    const r = validate(withBrowser("fetch('/api/a');\nfetch('../vendor/piper/piper.min.js', { method: 'HEAD' });\nfetch(`/api/v1/node/${id}`);\n"));
    assert.deepEqual(r.problems, [], report(r));
  });
  it('(a) red: an absolute URL and //evil.example are red, as literal or template', () => {
    assertOnly(withBrowser("fetch('https://evil.example/collect');\n"), 'browser-target', /not relative/);
    assertOnly(withBrowser("fetch('//evil.example/x');\n"), 'browser-target', /not relative/);
    assertOnly(withBrowser('fetch(`//evil.example/${x}`);\n'), 'browser-target');
  });
  it('(b) green: an allowlisted base leads the template; red: another base, or a changed base definition', () => {
    assert.deepEqual(validate(withBrowser('fetch(`${this.client.baseUrl}/api/x`);\n')).problems.filter((p) => p.code !== 'browser-base'), []);
    assertOnly(withBrowser('fetch(`${remote}/api/x`);\n'), 'browser-target', /not an allowlisted/);
    assertOnly(withBrowser("this.baseUrl = 'https://evil.example';\nfetch(`${this.baseUrl}/api/x`);\n"), 'browser-base', /only .* have asserted definitions/);
    const conn = fixtureFiles()[P('roadmap/ui/modules/connection.js')].replace("options.baseUrl || ''", "'https://evil.example'");
    assertOnly(world({ files: { [P('roadmap/ui/modules/connection.js')]: conn } }), 'browser-base', /this\.baseUrl is assigned/);
    const proto = fixtureFiles()[P('webui/protocol.ts')].replace('window.location.origin\n      :', '"https://evil.example"\n      :');
    assertOnly(world({ files: { [P('webui/protocol.ts')]: proto } }), 'browser-base', /protocol\.ts/);
  });
  it('(c) green: an identifier assigned relative values, a parameter whose call sites pass relative literals', () => {
    const body = "const u = cond ? '/api/a' : `/api/b`;\nfetch(u);\nasync function postJson(url, body) { return fetch(url, { method: 'POST' }); }\npostJson('/api/actions/x', {});\n";
    assert.deepEqual(validate(withBrowser(body)).problems, []);
  });
  it('(c) red: an identifier assigned an absolute URL, a parameter called with one', () => {
    assertOnly(withBrowser("const u = 'https://evil.example';\nfetch(u);\n"), 'browser-target', /u:/);
    assertOnly(withBrowser("function go(url) { return fetch(url); }\ngo('https://evil.example');\n"), 'browser-target', /parameter/);
  });
  it('(d) green: a loopback literal with a per-file row; red: without one', () => {
    const rows = [`| \`${INTEGRATIONS_DIR}catalog/\` | not an integration: registry | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`,
      `| \`${SRC}/roadmap/ui/\` | ${SAME_ORIGIN} | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`,
      `| \`${SRC}/webui/\` | ${SAME_ORIGIN} | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`,
      `| \`${SRC}/roadmap/ui/modules/connection.js\` | folded into alpha | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`];
    const probe = { [P('roadmap/ui/modules/probe.js')]: "new WebSocket('ws://localhost:9376');\n" };
    assertOnly(world({ files: probe }), 'browser-loopback', /probe\.js/);
    const withRowRecon = [...rows, `| \`${SRC}/roadmap/ui/modules/probe.js\` | not an integration: loopback install socket | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`];
    assert.deepEqual(validate(world({ files: probe, portfolio: { recon: withRowRecon } })).problems, []);
  });
  it('(e) green: ws://${window.location.host}; red: another host, or a ConnectionClient given a base', () => {
    assert.deepEqual(validate(withBrowser('new WebSocket(`ws://${window.location.host}`);\n')).problems, []);
    assertOnly(withBrowser('new WebSocket(`ws://${evilHost}`);\n'), 'browser-target');
    const cc = { [P('roadmap/ui/command-center.js')]: "const client = new ConnectionClient({ baseUrl: 'https://evil.example' });\nfetch('/api/v1/x');\n" };
    assertOnly(world({ files: cc }), 'browser-base', /ConnectionClient/);
  });
  it('a postAction caller passing a non-/api/ endpoint is red', () => {
    assertOnly(withBrowser("fetch('/api/a');\nthis.client.postAction('//evil.example');\n"), 'browser-base', /postAction/);
  });
  it('a webui bridge gaining a caller is red (the first new caller is checked)', () => {
    assertOnly(world({ files: { [P('extension/useBridge.ts')]: 'createHostBridge("https://evil.example");\n' } }), 'browser-base', /webui bridges gained callers/);
  });
});

describe('FX1003 integration contracts: portfolio, facts, legacy map, registration', () => {
  it('a reported count that differs from the computed count is red (criterion 4)', () => {
    assertOnly(world({ portfolio: { counts: { ...FX_COUNTS, 'scan-1-files': 4 } } }), 'counts', /scan-1-files/);
  });
  it('a missing fact, a confirmed defect with no B-number and a B-number absent from BACKLOG are red', () => {
    const facts = FACT_IDS.slice(1).map((id) => `| ${id} | f | behaviour | confirmed | \`${FX_IMPL}:2\` (\`export function sendAlpha\`) | - |`);
    assertOnly(world({ portfolio: { facts } }), 'facts', /F01 appears 0 times/);
    const bad = FACT_IDS.map((id) => `| ${id} | f | ${id === 'F05' ? 'defect' : 'behaviour'} | confirmed | \`${FX_IMPL}:2\` (\`export function sendAlpha\`) | ${id === 'F06' ? '[B999]' : '-'} |`);
    const r = validate(world({ portfolio: { facts: bad } }));
    assert.deepEqual(codes(r), ['facts'], report(r));
    assert.ok(r.problems.some((p) => /F05 is a confirmed defect with no B-number/.test(p.detail)));
    assert.ok(r.problems.some((p) => /B999 is not a \[B999\] item/.test(p.detail)));
  });
  it('a review cited by a contract the map does not name is red', () => {
    const second = { id: 'zeta', path: `${CONTRACT_DIR}zeta.md`, text: fixtureContract({}, [FX_REG], `See \`${REVIEW_DIR}ALPHA_CONTRACT_REVIEW.md\`.`) };
    const r = validate(world({ moreContracts: [second] }));
    assert.ok(r.problems.some((p) => p.code === 'legacy-review'), report(r));
  });
  it('a missing registry row, a row without the 3-line rule and a misplaced tier are red', () => {
    assertOnly(world({ archIndexText: FX_ARCH(FX_ARCH_ROWS.slice(1)) }), 'registry', /integration-contract-alpha/);
    assertOnly(world({ archIndexText: FX_ARCH([FX_ARCH_ROWS[0].replace('; moving cited code by more than 3 lines requires updating the citation', ''), ...FX_ARCH_ROWS.slice(1)]) }), 'registry', /more than 3 lines/);
    assertOnly(world({ govIndexText: FX_GOV.replace(`| \`${SCENARIOS}\` | s | o |\n`, '').replace(`| \`${PORTFOLIO}\` | p |`, `| \`${PORTFOLIO}\` | p |\n| \`${SCENARIOS}\` | s |`) }), 'governance-index', /Tier 5; expected Tier 2/);
  });
  it('a scenarios citation that does not resolve is red', () => {
    const input = world();
    input.scenariosText = `Step one exists \`${FX_IMPL}:2\` (\`export function sendAlpha\`).\nStep two exists \`${FX_IMPL}:2\` (\`a line that is not there\`).\n`;
    assertOnly(input, 'citation', /INTEGRATION_SCENARIOS\.md:2/);
  });

  it('a reconciliation row naming an unknown contract is red', () => {
    const recon = [`| \`${INTEGRATIONS_DIR}catalog/\` | shared by alpha, omega | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`,
      `| \`${SRC}/roadmap/ui/\` | ${SAME_ORIGIN} | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`,
      `| \`${SRC}/webui/\` | ${SAME_ORIGIN} | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`,
      `| \`${SRC}/roadmap/ui/modules/connection.js\` | folded into alpha | none | \`${CATALOG_FILE}:1\` (\`INTEGRATION_CATALOG\`) |`];
    assertOnly(world({ portfolio: { recon } }), 'reconciliation', /omega/);
  });
});

describe('FX1003 #538 owner dispositions', () => {
  const legacy = `Legacy review: \`${REVIEW_DIR}ALPHA_CONTRACT_REVIEW.md\`.`;
  const row = (disp, prio = '2') => `| [alpha](integrations/alpha.md) | send | verified-shipped | yes | unit | ${disp} | ${prio} |`;
  const DECIDED = (d) => `Owner decision 2026-10-18 (#538), accepting the recommendation: **${d}**. It goes.`;
  const LINK = '- [Retirement review](integrations/alpha.md#retirement-review-538)';
  const GROW = 'docs/grow.md';
  const growText = [...Array.from({ length: 49 }, (_, i) => `line ${i + 1}`), 'anchor far from the top', 'tail'].join('\n');
  const REVIEW_OK = [`## ${RETIREMENT_SECTION}`, '',
    `Removal is tracked as [B300] \`${FX_IMPL}:2\` (\`export function sendAlpha\`).`,
    `The registering file changes \`${FX_REG}:3\` (\`registerCommand('failsafe.alpha.send'\`).`];
  /** A world whose alpha contract has disposition `disp` and the given review lines (null: no review). */
  const decided = ({ disp = 'RETIRE', review = REVIEW_OK, links = [LINK], files = {} } = {}) => world({
    contractText: fixtureContract({ 'Recommended disposition': [DECIDED(disp), '', ...(review || [])].join('\n') }, undefined, legacy),
    portfolio: { matrix: [row(disp)], links },
    files: { [GROW]: growText, ...files },
  });
  const reviewWith = (...lines) => [...REVIEW_OK, ...lines];

  it('T1 a disposition that does not record the owner decision is red', () => {
    const text = fixtureContract({ 'Recommended disposition': 'Recommendation for the owner: **MAINTAIN**. It works.' }, undefined, legacy);
    assertOnly(world({ contractText: text }), 'disposition', /owner decision/);
  });

  it('T1b a disposition that mentions an owner decision without the recorded prefix is red', () => {
    const text = fixtureContract({ 'Recommended disposition': 'Recommendation for the owner: **MAINTAIN**. The owner decision is due 2026-10-18 (#538).' }, undefined, legacy);
    assertOnly(world({ contractText: text }), 'disposition', /Owner decision 2026-10-18 \(#538\)/);
  });

  it('T2a a portfolio without the owner decision section is red', () => {
    assertOnly(world({ portfolio: { decision: ['Dispositions are recommendations; the owner decides.'] } }), 'portfolio', /Owner decision \(#538\)/);
  });
  it('T2b a portfolio that keeps the stale "recorded later" framing is red', () => {
    const decision = [...FX_DECISION, '', 'Every disposition here is a recommendation for the owner; the owner decides, and that decision is recorded later.'];
    assertOnly(world({ portfolio: { decision } }), 'portfolio', /recorded later/);
  });
  it('T2d preservation: the stale framing in the preamble is red', () => {
    const decision = ['Every disposition here is a recommendation for the owner; the owner decides, and that decision is recorded later.', '', ...FX_DECISION];
    assertOnly(world({ portfolio: { decision } }), 'portfolio', /recorded later/);
  });
  it('T2e the stale phrase quoted as history in a later section is not the framing', () => {
    const tail = ['## History', '', 'Part A said that the decision is recorded later; #538 recorded it.', ''];
    const r = validate(world({ portfolio: { tail } }));
    assert.deepEqual(r.problems, [], report(r));
  });
  it('T2c an owner decision section that does not say what COMPLETE means is red', () => {
    const decision = ['## Owner decision (#538)', '', 'Owner decision of 2026-10-18 (#538): the recommendations are accepted.'];
    assertOnly(world({ portfolio: { decision } }), 'portfolio', /finish the named gaps/);
  });

  it('T3a a Totals line with a wrong disposition count is red', () => {
    assertOnly(world({ portfolio: { totals: 'Totals: 1 contracts; owner dispositions 0 COMPLETE, 2 MAINTAIN, 0 RETIRE, 0 INVEST; priorities 0 at 1, 1 at 2, 0 at 3.' } }), 'totals', /MAINTAIN/);
  });
  it('T3b a Totals line with a wrong priority count is red', () => {
    assertOnly(world({ portfolio: { totals: 'Totals: 1 contracts; owner dispositions 0 COMPLETE, 1 MAINTAIN, 0 RETIRE, 0 INVEST; priorities 1 at 1, 0 at 2, 0 at 3.' } }), 'totals', /priority/);
  });
  it('T3c a portfolio with no Totals line is red', () => {
    assertOnly(world({ portfolio: { totals: null } }), 'totals', /no Totals line/);
  });

  it('T4 positive control: a RETIRE contract with one cited review, a backlog item and the portfolio link is clean', () => {
    const r = validate(decided());
    assert.deepEqual(r.problems, [], report(r));
  });
  it('T4a a RETIRE contract with no review is red', () => {
    assertOnly(decided({ review: null }), 'retirement', /exactly one/);
  });
  it('T4b a review that names no backlog item is red', () => {
    assertOnly(decided({ review: [REVIEW_OK[0], '', REVIEW_OK[3]] }), 'retirement', /names no \[Bnnn\]/);
  });
  it('T4c a review naming a B-number absent from BACKLOG is red', () => {
    assertOnly(decided({ review: [REVIEW_OK[0], '', REVIEW_OK[2].replace('[B300]', '[B999]')] }), 'retirement', /B999 is not a \[B999\] item/);
  });
  it('T4d a review line with no citation is red', () => {
    assertOnly(decided({ review: reviewWith('Nothing else depends on it.') }), 'uncited-line', /Retirement review/);
  });
  it('T4e a portfolio that does not link the review is red', () => {
    assertOnly(decided({ links: [] }), 'retirement', /does not link/);
  });
  it('T4i the review anchor named in plain text, not as a link, is red', () => {
    assertOnly(decided({ links: ['See integrations/alpha.md#retirement-review-538 for the review.'] }), 'retirement', /does not link/);
  });
  it('T4f a review on a contract that is not RETIRE is red', () => {
    assertOnly(decided({ disp: 'MAINTAIN' }), 'retirement', /only a RETIRE contract/);
  });
  it('T4g a fenced block in a review is red', () => {
    assertOnly(decided({ review: reviewWith('```', `grep -c x \`${FX_IMPL}:2\` (\`export function sendAlpha\`)`, '```') }), 'retirement', /fenced/);
  });
  it('T4h two review sections are red (exactly one)', () => {
    assertOnly(decided({ review: [...REVIEW_OK, '', ...REVIEW_OK] }), 'retirement', /exactly one/);
  });

  it('T5a a whole-file citation whose anchor is far from the top passes in a review', () => {
    const r = validate(decided({ review: reviewWith(`The growing document is updated \`${GROW}\` (\`anchor far from the top\`).`) }));
    assert.deepEqual(r.problems, [], report(r));
  });
  it('T5b a whole-file citation whose anchor is absent is red', () => {
    assertOnly(decided({ review: reviewWith(`The growing document is updated \`${GROW}\` (\`an anchor that is not there\`).`) }), 'citation', /not in the file/);
  });
  it('T5c preservation: the whole-file form is not a citation outside a review', () => {
    const text = fixtureContract({ Transformations: `It maps fields \`${GROW}\` (\`anchor far from the top\`).` }, undefined, legacy);
    assertOnly(world({ contractText: text, files: { [GROW]: growText } }), 'uncited-line', /Transformations/);
  });
  it('T5d a source file is cited by line, never by the whole-file form', () => {
    assertOnly(decided({ review: reviewWith(`The client changes \`${FX_IMPL}\` (\`export function sendAlpha\`).`) }), 'citation', /cited by line/);
  });
  it('T5f the whole-file form is refused for a file that is not a growing document', () => {
    const PKG = 'FailSafe/extension/package.json';
    const files = { [PKG]: '{\n  "name": "failsafe-fixture"\n}\n' };
    assertOnly(decided({ review: reviewWith(`The manifest changes \`${PKG}\` (\`"name": "failsafe-fixture"\`).`), files }), 'citation', /growing document/);
  });
  it('T5g a contract citing itself by whole file is red', () => {
    assertOnly(decided({ review: reviewWith(`This contract counts itself \`${CONTRACT_DIR}alpha.md\` (\`Alpha integration contract\`).`) }), 'citation', /cites itself/);
  });
  it('T5e a whole-file anchor that is short or contains a pipe is red', () => {
    assertOnly(decided({ review: reviewWith(`Short \`${GROW}\` (\`tail\`).`) }), 'citation', /shorter than 8/);
    assertOnly(decided({ review: reviewWith(`Pipe \`${GROW}\` (\`line 1 | line 2\`).`) }), 'citation', /contains \|/);
  });
});

describe('FX1003 integration contracts: this repository', () => {
  const inputs = repoInputs();
  const result = validate(inputs);

  it('every scan hit, catalog id and integrations entry is owned or reconciled, and every document check passes', () => {
    assert.deepEqual(result.problems.map((p) => `${p.code}: ${p.detail}`), []);
  });

  it('each file the plan names as a scan hit is a hit (criterion 2)', () => {
    for (const f of NAMED_HITS['scan-1']) assert.ok(result.scan1Files.includes(f), `${f} is not a scan 1 hit`);
    for (const f of NAMED_HITS['scan-2']) assert.ok(result.scan2Files.includes(f), `${f} is not a scan 2 hit`);
  });

  it('reports the counts it checked', (t) => {
    t.diagnostic(`counts ${JSON.stringify(result.computed)}`);
    console.log(`[integration-contracts] counts ${JSON.stringify(result.computed)}`);
    assert.ok(result.computed.contracts > 0 && result.computed['scan-1-files'] > 0);
  });

  it(`tag check: shipped-state anchors are in ${TAG} and main-unreleased anchors are not`, (t) => {
    const claims = [];
    for (const c of result.contracts) {
      for (const r of c.rows) {
        if (SHIPPED.has(r.state)) for (const ct of citationsOn(r.text).cites) claims.push({ c, r, ct, present: true });
        if (r.state === 'main-unreleased') for (const ct of citationsOn(r.symbolCell).cites) claims.push({ c, r, ct, present: false });
      }
    }
    const has = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${TAG}`], { cwd: REPO_ROOT, encoding: 'utf8' });
    if (has.status !== 0) { t.skip(`tag ${TAG} is absent: ${claims.length} claims left unchecked`); return; }
    const cache = new Map();
    const atTag = (p) => {
      if (!cache.has(p)) {
        const r = spawnSync('git', ['show', `${TAG}:${p}`], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
        cache.set(p, r.status === 0 ? r.stdout : null);
      }
      return cache.get(p);
    };
    const bad = [];
    for (const { c, r, ct, present } of claims) {
      const text = atTag(ct.path);
      const found = text !== null && text.includes(ct.anchor);
      if (found !== present) bad.push(`${c.path}:${r.no}: ${r.state} anchor "${ct.anchor}" in ${ct.path} is ${found ? 'present' : 'absent'} in ${TAG}`);
    }
    t.diagnostic(`tag check: ${claims.length} claims checked against ${TAG}`);
    console.log(`[integration-contracts] tag check: ${claims.length} claims checked against ${TAG}`);
    assert.ok(claims.length > 0, 'no shipped-state claim to check');
    assert.deepEqual(bad, []);
  });
});

module.exports = { validate, scan1, scan2, classifyTarget, parseCatalog, citationsOn, citationProblems, repoInputs };

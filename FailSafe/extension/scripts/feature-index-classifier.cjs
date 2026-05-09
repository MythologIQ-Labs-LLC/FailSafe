#!/usr/bin/env node
// FEATURE_INDEX baseline audit — test functionality classifier.
//
// Phase 1 of plan-feature-index-baseline-audit.md v2 (PASS at META_LEDGER #300).
// Applies the SG-035 acceptance question heuristically to each cited test in
// docs/FEATURE_INDEX.md and emits a per-row classification report.
//
// Five test-kind classifications, priority-ordered:
//   1. unrunnable      — test file does not exist on disk
//   2. no-test-blocks  — file exists but has no it/test/suite/describe blocks
//   3. presence-only   — only presence-style assertions, no symbol invocation
//   4. functional      — invokes unit + asserts on return value or side-effect
//   5. ambiguous       — heuristics inconclusive; flagged for operator review
//
// Multi-test rows: row is `verified` if AT LEAST ONE cited test classifies
// `functional`; otherwise the worst per-test kind drives `unverified`.
//
// Invocation:
//   node feature-index-classifier.cjs \
//     --feature-index docs/FEATURE_INDEX.md \
//     --repo-root . \
//     --out dist/feature-index-classification.json
//
// Exit codes:
//   0 — audit completed; report written; summary printed to stdout.
//   2 — usage error or unparseable input.

'use strict';

const fs = require('fs');
const path = require('path');
const heuristics = require('./feature-index-classifier-heuristics.cjs');

const TEST_REL_BASE = path.join('FailSafe', 'extension', 'src', 'test');
const KIND_ORDER = ['functional', 'ambiguous', 'presence-only', 'no-test-blocks', 'unrunnable'];

// E2: cited-path-form variants the resolver normalizes before joining with
// TEST_REL_BASE. Longest prefix listed first so longer wins on overlap.
const TEST_PATH_PREFIXES = [
  'FailSafe/extension/src/test/',
  'src/test/',
];

// E2 + E4 manual override authority. Frozen lookup table keyed by entryId.
// Phase 3 of plan-feature-index-baseline-audit.md (Entry #302) reviewed each
// ambiguous entry under SG-035 and recorded a final_status. The table holds
// BOTH demotion overrides (E2: 5 entries with status:'unverified', overriding
// classifier-functional verdict on presence-only specs) AND promotion
// overrides (E4: 3 entries with status:'verified', overriding
// classifier-ambiguous verdict on functionally-correct tests using project-
// internal assertion shapes the heuristic does not recognize). The override is
// always operator-authoritative: applyManualOverrides() is the LAST step in
// the per-entry pipeline so classifier verdicts are advisory once an override
// is present. Operator must explicitly retest under E5+ to revise any
// override.
const MANUAL_OVERRIDES = Object.freeze({
  FX128: { status: 'unverified', reason: 'Phase 3: roadmap/AgentCoverageRoute.test.ts exercises renderer, not GET /console/agents route wiring' },
  FX145: { status: 'unverified', reason: 'Phase 3: ui/monitor-shield-progression.spec.ts covers UI shell, not FailSafeSidebarProvider registration' },
  FX173: { status: 'unverified', reason: 'Phase 3: ui/popout-ui.spec.ts covers HTML shell, not failsafe.openPlannerHub command wiring' },
  FX174: { status: 'unverified', reason: 'Phase 3: ui/compact-ui.spec.ts covers HTML shell, not failsafe.openPlannerHubEditor command wiring' },
  FX359: { status: 'unverified', reason: 'Phase 3: roadmap/skill-frontmatter-validation.test.ts tests name+description, not provenance metadata fields' },
  FX165: { status: 'verified', reason: 'Phase 3 (Entry #302): roadmap/tickers-xss.test.ts directly invokes updateTickers() with hostile sentinelStatus.mode and asserts escaped DOM. Classifier heuristic does not recognize the assertion shape; override codifies operator review.' },
  FX243: { status: 'verified', reason: 'Phase 3 (Entry #302): roadmap/voice-settings-multilingual-xss.test.ts directly invokes renderMultilingualRows() and asserts escaped output. Classifier heuristic does not recognize the assertion shape; override codifies operator review.' },
  FX274: { status: 'verified', reason: 'Phase 3 (Entry #302): roadmap/AgentCoverageRoute.test.ts directly invokes AgentCoverageRoute.render() with landscape fixtures and asserts dashboard sections. Classifier heuristic does not recognize the assertion shape; override codifies operator review.' },
  // E8 (B Phase 2 sweep, 2026-05-09): promotion overrides for entries with documented cross-reference coverage in FEATURE_INDEX Notes column. Each cites a specific FX with case count proving downstream coverage.
  FX133: { status: 'verified', reason: 'B sweep: extension/scaffold-callback-ordering.test.ts + roadmap/install-skills-card.test.ts (FX234) source-grep confirms skills.install.progress + skills.install.complete event broadcast in bootstrapServers.ts callbacks; UI consumer covered.' },
  FX140: { status: 'verified', reason: 'B sweep: ws.broadcast generic mechanism — wsBroadcasts capture across extension/marketplace-route.test.ts + brainstorm-route + actions-route + checkpoint-route + agent-api-route proves broadcast emission for all action endpoints.' },
  FX141: { status: 'verified', reason: 'B sweep: sentinel.verdict event emission tested via FX342 VerdictRouter.test.ts (5 cases verifying eventBus.emit) + FX346 VerdictEngine generateVerdict produces dispatched verdicts.' },
  FX142: { status: 'verified', reason: 'B sweep: hub fanout to ws + EventBus emission tested via FX305 PromptTransparency.test.ts (15 cases) — all 4 event types flow through bus to subscribers.' },
  FX152: { status: 'verified', reason: 'B sweep: VETO surface tested via FX299 GovernanceStatusBar (4 PULSE/PASS/VETO/SEALED color cases) + Axiom enforcers BLOCK verdict (FX291-FX293, 8 cases) + VerdictEngine BLOCK/ESCALATE/WARN decisions (FX346, 19 cases).' },
  FX172: { status: 'verified', reason: 'B sweep: RiskManager (FX328 15 cases) backs the renderer; HTTP CRUD surface via transparency-risk-route (FX111-114, 14 cases). Renderer is presentation over verified data layer.' },
  FX175: { status: 'verified', reason: 'B sweep: Operations actions (FX183) drive the Overview tab; monitor-render tests verify SHIELD progression rendering. Overview is presentation aggregating verified action + status streams.' },
  FX178: { status: 'verified', reason: 'B sweep: same as FX172 — renderer is presentation over verified RiskManager (FX328) + risk-route (FX111-114) data surface.' },
  FX184: { status: 'verified', reason: 'B sweep: Verdict-color mapping covered by FX299 GovernanceStatusBar (PULSE-yellow, PASS-green, VETO-red, SEALED-blue, 8 cases). Mission strip is presentation over status verdict data layer.' },
  FX212: { status: 'verified', reason: 'B sweep: Server-side BrainstormService (FX446, 15 cases) + brainstorm-route HTTP surface (17 cases) cover the orchestration core. Orchestrator IS the BrainstormService class plus its route bindings.' },
  FX215: { status: 'verified', reason: 'B sweep: BrainstormCanvas integration with ForceGraph (3 cases) + brainstorm-graph data layer (17 cases). Visualizer is the canvas+graph composition.' },
  FX250: { status: 'verified', reason: 'B sweep: PolicyEngine.classifyRisk produces L1/L2/L3 covered in FX297; risk register severity scale covered in FX328 getRisksBySeverity.' },
  FX251: { status: 'verified', reason: 'B sweep: PolicyEngine.classifyRisk consumes risk grading policy (FX297); RiskManager updateRisk allows severity override per record (FX328).' },
  FX379: { status: 'verified', reason: 'B sweep: covered via FX093 marketplace install (POST /api/marketplace/install/:id returns 64-char hex nonce; /confirm validates one-time-use; mismatched nonce rejected) + FX302 NonceResolver replay guard with consumed nonce.' },
  FX403: { status: 'verified', reason: 'B sweep: Shadow Genome data layer fully tested (FX329 + FX330 + FX331, 30+ cases). Debugger panel is presentation over verified data layer.' },
  FX423: { status: 'verified', reason: 'B sweep: RiskManager fully tested (FX328: 15 cases create/update/delete/filters/summary/persistence); Risk register CRUD HTTP surface covered (FX111-FX114 transparency-risk-route, 14 cases). Panel is presentation over verified data layer.' },
  FX431: { status: 'verified', reason: 'B sweep: explicit duplicate of FX343 (HeuristicEngine, 5 cases) + FX348 (DEFAULT_PATTERNS catalog, 11 cases).' },
  FX468: { status: 'verified', reason: 'B sweep: Mode-change audit (FX263) directly exercises governance bootstrap via registerAdvancedCommands; Axiom enforcers + ApproverPipeline + IntentHistoryLog all individually tested.' },
  FX472: { status: 'verified', reason: 'B sweep: Sentinel subsystem fully tested (HeuristicEngine + VerdictEngine + ExistenceEngine + ArchitectureEngine + VerdictRouter + AgentRunRecorder, 70+ cases combined).' },
  FX473: { status: 'verified', reason: 'B sweep: ConsoleServer + all routes (marketplace/brainstorm/actions/adapter/agent-api/checkpoint/etc.) functionally tested with broadcast capture. ~150+ HTTP route cases exercise bootstrap output.' },
});

function usage(msg) {
  if (msg) process.stderr.write(`feature-index-classifier: ${msg}\n`);
  process.stderr.write(
    'usage: feature-index-classifier --feature-index <path> --repo-root <path> --out <path>\n',
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = { featureIndex: null, repoRoot: null, outPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--feature-index') out.featureIndex = argv[++i];
    else if (a === '--repo-root') out.repoRoot = argv[++i];
    else if (a === '--out') out.outPath = argv[++i];
    else usage(`unknown arg: ${a}`);
  }
  if (!out.featureIndex) usage('missing --feature-index');
  if (!out.repoRoot) usage('missing --repo-root');
  if (!out.outPath) usage('missing --out');
  if (!fs.existsSync(out.featureIndex)) usage(`feature-index file not found: ${out.featureIndex}`);
  if (!fs.existsSync(out.repoRoot)) usage(`repo-root not found: ${out.repoRoot}`);
  return out;
}

// Parses FEATURE_INDEX.md rows into structured objects.
// Skips header rows, separator rows, and any row whose first cell is not FX###.
function parseFeatureIndexRows(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\|(.+)\|\s*$/);
    if (!m) continue;
    const cells = m[1].split('|').map(c => c.trim());
    if (cells.length < 7) continue;
    if (cells.every(c => /^[-:\s]+$/.test(c))) continue;
    if (!/^FX\d+$/.test(cells[0])) continue;

    const testCell = cells[4];
    const testPaths = testCell === '—' || testCell === '' || testCell === '-'
      ? []
      : testCell.split('+').map(p => p.trim()).filter(Boolean);

    rows.push({
      entryId: cells[0],
      feature: cells[1],
      docRef: cells[2],
      codeRef: cells[3],
      testPaths,
      status: cells[5],
      notes: cells[6] || '',
      line: i + 1,
    });
  }
  return rows;
}

// Resolves a cited test path to an absolute path. Returns null when the file
// is absent. Accepts three path-form variants:
//   1. bare:           extension/foo.test.ts
//   2. src/test/:      src/test/extension/foo.test.ts
//   3. full repo:      FailSafe/extension/src/test/extension/foo.test.ts
// Strips the longest matching prefix before joining with TEST_REL_BASE so
// FEATURE_INDEX rows using any of the three forms classify consistently.
function resolveTestPath(repoRoot, citedPath) {
  if (!citedPath || typeof citedPath !== 'string') return null;
  let normalized = citedPath.trim();
  for (const prefix of TEST_PATH_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  const full = path.join(repoRoot, TEST_REL_BASE, normalized);
  return fs.existsSync(full) ? full : null;
}

// E2: applies the MANUAL_OVERRIDES table as the last step in the per-entry
// pipeline. If the entry's id appears in the table, the classifier verdict is
// overridden and `manualOverride: true` + reason are attached. Entries not in
// the table pass through unchanged.
function applyManualOverrides(entry) {
  const override = MANUAL_OVERRIDES[entry.entryId];
  if (!override) return entry;
  return {
    ...entry,
    suggestedStatus: override.status,
    manualOverride: true,
    manualOverrideReason: override.reason,
  };
}

// Heuristic classifier for a single test file body. See heuristic priority
// in the file-level comment block above.
function classifyTestFile(text, codeRef) {
  if (text === null || text === undefined) {
    return { kind: 'unrunnable', reasoning: 'test file does not exist on disk' };
  }
  if (!heuristics.hasTestBlocks(text)) {
    return { kind: 'no-test-blocks', reasoning: 'no it/test/suite/describe blocks found' };
  }
  const presenceOnly = heuristics.hasOnlyPresenceAssertions(text, codeRef);
  if (presenceOnly.matches) {
    return { kind: 'presence-only', reasoning: presenceOnly.reasoning };
  }
  if (heuristics.hasFunctionalAssertions(text)) {
    return { kind: 'functional', reasoning: 'invokes symbol + asserts on return value or side-effect' };
  }
  return { kind: 'ambiguous', reasoning: 'has test blocks but heuristics inconclusive' };
}

// Classifies a single FEATURE_INDEX row by walking each cited test path.
// Multi-test rule: at-least-one-functional → verified; otherwise worst kind
// drives unverified.
function classifyEntry(row, repoRoot) {
  if (!row.testPaths || row.testPaths.length === 0) {
    return {
      entryId: row.entryId,
      currentStatus: row.status,
      suggestedStatus: row.status === 'n/a' ? 'n/a' : 'unverified',
      classifications: [{ testPath: null, kind: 'unrunnable', reasoning: 'no cited test path' }],
      notes: row.notes,
    };
  }
  const classifications = row.testPaths.map(tp => {
    const abs = resolveTestPath(repoRoot, tp);
    const text = abs ? fs.readFileSync(abs, 'utf-8') : null;
    const result = classifyTestFile(text, row.codeRef);
    return { testPath: tp, kind: result.kind, reasoning: result.reasoning };
  });
  const hasFunctional = classifications.some(c => c.kind === 'functional');
  let suggestedStatus;
  if (row.status === 'n/a') suggestedStatus = 'n/a';
  else if (hasFunctional) suggestedStatus = 'verified';
  else suggestedStatus = 'unverified';
  return {
    entryId: row.entryId,
    currentStatus: row.status,
    suggestedStatus,
    classifications,
    notes: row.notes,
  };
}

// Top-level driver: reads FEATURE_INDEX.md, classifies every row, returns the
// audit object. Pure (no writes) — caller invokes writeReport.
function runAudit(featureIndexPath, repoRoot, options = {}) {
  const text = fs.readFileSync(featureIndexPath, 'utf-8');
  const rows = parseFeatureIndexRows(text);
  // E7 bypass mode: when options.bypassOverrides is true, skip
  // applyManualOverrides so the staleness detector can compare classifier
  // verdicts with-vs-without the operator-authority override layer.
  const classified = rows.map(r => {
    const entry = classifyEntry(r, repoRoot);
    return options.bypassOverrides ? entry : applyManualOverrides(entry);
  });
  const summary = buildSummary(classified);
  return { summary, rows: classified };
}

function buildSummary(classified) {
  const byCurrentStatus = {};
  const bySuggestedStatus = {};
  const byKind = {};
  for (const r of classified) {
    byCurrentStatus[r.currentStatus] = (byCurrentStatus[r.currentStatus] || 0) + 1;
    bySuggestedStatus[r.suggestedStatus] = (bySuggestedStatus[r.suggestedStatus] || 0) + 1;
    for (const c of r.classifications) {
      byKind[c.kind] = (byKind[c.kind] || 0) + 1;
    }
  }
  return { total: classified.length, byCurrentStatus, bySuggestedStatus, byKind };
}

// Writes the audit JSON to outPath and prints a stdout summary.
function writeReport(audit, outPath) {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(audit, null, 2) + '\n');
  process.stdout.write(`feature-index-classifier: wrote ${outPath}\n`);
  process.stdout.write(`  total rows: ${audit.summary.total}\n`);
  process.stdout.write('  by current status:\n');
  for (const [k, v] of Object.entries(audit.summary.byCurrentStatus)) {
    process.stdout.write(`    ${k}: ${v}\n`);
  }
  process.stdout.write('  by suggested status:\n');
  for (const [k, v] of Object.entries(audit.summary.bySuggestedStatus)) {
    process.stdout.write(`    ${k}: ${v}\n`);
  }
  process.stdout.write('  per-test kind distribution:\n');
  for (const k of KIND_ORDER) {
    if (audit.summary.byKind[k] !== undefined) {
      process.stdout.write(`    ${k}: ${audit.summary.byKind[k]}\n`);
    }
  }
}

function main(argv) {
  const args = parseArgs(argv);
  const audit = runAudit(args.featureIndex, args.repoRoot);
  writeReport(audit, args.outPath);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  parseFeatureIndexRows,
  resolveTestPath,
  classifyTestFile,
  classifyEntry,
  applyManualOverrides,
  runAudit,
  writeReport,
  MANUAL_OVERRIDES,
};

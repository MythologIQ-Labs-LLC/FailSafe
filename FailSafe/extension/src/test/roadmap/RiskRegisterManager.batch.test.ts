// v6.0.8 lane C (#528, LD-5): imports write the risk register once per
// 500-record chunk instead of once per finding. A spy on fs.renameSync counts
// the atomic replacements of risks.json, which is one per register write.
// The new API is reached through `any` so this file compiles against the
// v6.0.7 tree too, where these tests fail on the missing API.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RiskRegisterManager } from '../../roadmap/services/RiskRegisterManager';
import { importSarifText as importSarifTyped } from '../../integrations/sarif/sarif-to-risk';
import { parseSarif } from '../../integrations/sarif/sarif-parser';
import { sarifFindingsToRisks } from '../../integrations/sarif/sarif-to-risk';
import { importSentryRisks as importSentryTyped } from '../../integrations/sentry/sentry-import';
import { runMcpPolicyScan as runMcpTyped } from '../../extension/agent-observe-command';
import { context, detail, issue, OPTS, server } from '../integrations/sentry/sentry-fixtures';

const importSarifText = importSarifTyped as any;
const importSentryRisks = importSentryTyped as any;
const runMcpPolicyScan = runMcpTyped as any;

function sarif(n: number, offset = 0): string {
  const results = Array.from({ length: n }, (_, i) => ({
    ruleId: `rule.r${(i + offset) % 7}`, level: 'warning', message: { text: `finding ${i + offset}` },
    locations: [{ physicalLocation: { artifactLocation: { uri: `src/f${i + offset}.ts` }, region: { startLine: i + offset + 1, startColumn: 1 } } }],
  }));
  return JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'semgrep', version: '1.0.0', rules: [] } }, results }] });
}

const sarifIds = (text: string): string[] => sarifFindingsToRisks(parseSarif(text).findings).map((r) => String(r.id));

const RISKY = JSON.stringify({
  mcpServers: {
    sh: { command: 'bash', alwaysAllow: ['*'] },
    remote: { type: 'sse', url: 'https://hooks.example.com/sse' },
    fsx: { command: 'mcp-fs', autoApprove: ['read_file', 'write_file'] },
  },
});
const readTwoConfigs = (file: string): string => {
  if (path.basename(file) === '.mcp.json' || file.endsWith(path.join('.roo', 'mcp.json'))) return RISKY;
  throw new Error('ENOENT');
};

suite('Risk register batched imports (v6.0.8 #528 LD-5)', function () {
  this.timeout(120000);
  let dir = '';
  let renames = 0;
  // Patch the fs module object itself: compiled modules read fs.renameSync through it at call time.
  const fsModule = require('fs') as { renameSync: typeof fs.renameSync };
  const realRename = fsModule.renameSync;
  const file = () => path.join(dir, '.failsafe', 'risks', 'risks.json');
  const storedIds = (mgr: RiskRegisterManager) => mgr.getStoredRisks().map((r) => String(r.id));

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-batch-'));
    renames = 0;
    fsModule.renameSync = (from: fs.PathLike, to: fs.PathLike) => {
      if (path.basename(String(to)) === 'risks.json') renames++;
      return realRename(from, to);
    };
  });
  teardown(() => {
    fsModule.renameSync = realRename;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('R2 a 50-finding SARIF import writes the register once and keeps a triaged status', () => {
    const text = sarif(50);
    const ids = sarifIds(text);
    const mgr = new RiskRegisterManager(dir);
    const first = sarifFindingsToRisks(parseSarif(text).findings)[0];
    mgr.upsertRisk({ ...first, status: 'triaged' });
    renames = 0;
    const sink = (mgr as any).importSink();
    const result = importSarifText(text, (r: Record<string, unknown>) => sink.upsertRisk(r, { keepStored: ['status'] }), sink.batch);
    assert.equal(renames, 1, 'one register write for the whole import');
    assert.equal(result.risks, 50);
    assert.equal(result.failed, 0);
    assert.deepEqual([result.write.written, result.write.created, result.write.unchanged, result.write.chunks], [50, 49, 1, 1]);
    assert.deepEqual(storedIds(mgr).sort(), [...ids].sort());
    assert.equal(mgr.getStoredRisks().find((r) => r.id === ids[0])?.status, 'triaged');
  });

  test('R3 a Sentry import writes once, with the same counts as the per-record path', async () => {
    const fixture = () => server([[issue('1'), issue('2'), issue('3')]], { 1: detail('a@1', 'a@2') });
    const perRecordDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-batch-per-'));
    try {
      const per = new RiskRegisterManager(perRecordDir);
      const perOutcome = await importSentryRisks(OPTS, fixture().get, { upsertWith: (id: string, b: any, o: any) => per.upsertRiskWith(id, b, o) }, context());
      const mgr = new RiskRegisterManager(dir);
      const sink = (mgr as any).importSink();
      renames = 0;
      const o = await importSentryRisks(OPTS, fixture().get, { upsertWith: sink.upsertRiskWith, batch: sink.batch }, context());
      assert.equal(renames, 1, 'one register write for the whole import');
      assert.deepEqual([o.created, o.updated, o.unchanged, o.failed], [perOutcome.created, perOutcome.updated, perOutcome.unchanged, perOutcome.failed]);
      assert.equal(o.created, 3);
      assert.deepEqual([o.write.written, o.write.created, o.write.chunks, o.write.chunksFailed], [3, 3, 1, 0]);
    } finally { fs.rmSync(perRecordDir, { recursive: true, force: true }); }
  });

  test('R4 an MCP policy scan over two configs writes once, with the per-record counts', () => {
    const perRecordDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-batch-per-'));
    try {
      const per = new RiskRegisterManager(perRecordDir);
      const perResult = runMcpPolicyScan(perRecordDir, (r: Record<string, unknown>) => per.upsertRisk(r, { keepStored: ['status'] }), readTwoConfigs);
      assert.ok(perResult.total >= 4 && perResult.scanned === 2, 'precondition: two configs with several findings');
      const mgr = new RiskRegisterManager(dir);
      const sink = (mgr as any).importSink();
      renames = 0;
      const r = runMcpPolicyScan(dir, (x: Record<string, unknown>) => sink.upsertRisk(x, { keepStored: ['status'] }), readTwoConfigs, sink.batch);
      assert.equal(renames, 1, 'one register write for the whole scan');
      assert.deepEqual([r.scanned, r.total, r.high, r.failed], [perResult.scanned, perResult.total, perResult.high, perResult.failed]);
      assert.equal(r.write.written, perResult.total);
    } finally { fs.rmSync(perRecordDir, { recursive: true, force: true }); }
  });

  test('R5 a failed chunk writes nothing and counts its records failed, side tallies included', async () => {
    // SARIF against an unreadable register: the store refuses the whole chunk.
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), '{not json');
    const mgr = new RiskRegisterManager(dir);
    const sink = (mgr as any).importSink();
    const result = importSarifText(sarif(50), (r: Record<string, unknown>) => sink.upsertRisk(r, { keepStored: ['status'] }), sink.batch);
    assert.deepEqual([result.risks, result.failed, result.write.chunksFailed, result.write.written], [0, 50, 1, 0]);
    assert.match(String(result.write.writeError), /cannot be read as a risk register/);
    assert.equal(fs.readFileSync(file(), 'utf8'), '{not json');
    fs.rmSync(path.dirname(file()), { recursive: true, force: true });

    // Sentry: builders run (carrying one stored release, discarding another), then the chunk's write fails.
    const sentryMgr = new RiskRegisterManager(dir);
    await importSentryRisks(OPTS, server([[issue('1'), issue('2')]], { 1: detail('a@1', 'a@2') }).get,
      { upsertWith: (id: string, b: any, o: any) => sentryMgr.upsertRiskWith(id, b, o) }, context());
    sentryMgr.upsertRiskWith('sentry:2', (r) => ({ ...r, provenance: { ...(r?.provenance as object), release: { source: 'manual', first: 'x' } } }));
    const before = fs.readFileSync(file(), 'utf8');
    const s2 = (sentryMgr as any).importSink();
    const failingBatch = (write: () => void) => s2.batch(() => { write(); throw new Error('write refused'); });
    const lookupsFail = server([[issue('1'), issue('2')]], { 1: { status: 503, body: '' }, 2: { status: 503, body: '' } });
    const o = await importSentryRisks(OPTS, lookupsFail.get, { upsertWith: s2.upsertRiskWith, batch: failingBatch }, context());
    assert.deepEqual([o.created, o.updated, o.unchanged, o.failed], [0, 0, 0, 2]);
    assert.deepEqual([o.releases.carried, o.releases.discarded], [0, 0], 'a failed chunk carries and discards nothing');
    assert.equal(o.write.chunksFailed, 1);
    assert.equal(fs.readFileSync(file(), 'utf8'), before);

    // MCP: the chunk's findings are written in memory, then the write fails.
    const mcpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-batch-mcp-'));
    try {
      const m = new RiskRegisterManager(mcpDir);
      const s3 = (m as any).importSink();
      const r = runMcpPolicyScan(mcpDir, (x: Record<string, unknown>) => s3.upsertRisk(x, {}), readTwoConfigs,
        (write: () => void) => s3.batch(() => { write(); throw new Error('write refused'); }));
      assert.ok(r.failed >= 4, 'precondition: several findings were offered');
      assert.deepEqual([r.total, r.high, r.write.written, r.write.chunksFailed], [0, 0, 0, 1]);
      assert.equal(r.write.writeError, 'write refused');
      assert.deepEqual(m.getStoredRisks(), []);
    } finally { fs.rmSync(mcpDir, { recursive: true, force: true }); }
  });

  test('R6 a builder that throws for one record fails that record only, in the one write', () => {
    const text = sarif(50);
    const ids = sarifIds(text);
    const mgr = new RiskRegisterManager(dir);
    const sink = (mgr as any).importSink();
    const result = importSarifText(text, (r: Record<string, unknown>) => {
      if (r.id === ids[3]) throw new Error('bad record');
      return sink.upsertRisk(r, {});
    }, sink.batch);
    assert.equal(renames, 1);
    assert.deepEqual([result.risks, result.failed, result.write.chunksFailed], [49, 1, 0]);
    assert.equal(storedIds(mgr).length, 49);
    assert.ok(!storedIds(mgr).includes(ids[3]));
  });

  test('R10 1,200 findings into a 20,000-record register: three writes, each chunk well inside the lock budget', () => {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    const seeded = Array.from({ length: 20000 }, (_, i) => ({ id: `seed-${i}`, title: 'rule.x: ' + 'm'.repeat(140), severity: 'high', source: 'sarif', status: 'open' }));
    fs.writeFileSync(file(), JSON.stringify({ risks: seeded }, null, 2));
    const mgr = new RiskRegisterManager(dir);
    const sink = (mgr as any).importSink();
    const holds: number[] = [];
    const timed = (write: () => void) => { const t = performance.now(); try { sink.batch(write); } finally { holds.push(performance.now() - t); } };
    renames = 0;
    const result = importSarifText(sarif(1200), (r: Record<string, unknown>) => sink.upsertRisk(r, {}), timed);
    assert.equal(renames, 3, `one write per 500-record chunk (holds ${holds.map(Math.round).join(', ')} ms)`);
    assert.deepEqual([result.risks, result.write.chunks, result.write.chunksFailed], [1200, 3, 0]);
    assert.equal(mgr.getStoredRisks().length, 21200);
    for (const h of holds) assert.ok(h < 2000, `a chunk held the lock ${Math.round(h)} ms`);
    console.log(`R10 chunk holds ms: ${holds.map(Math.round).join(', ')}`);
  });

  test('R11 a failure in the second of three chunks fails only that chunk', () => {
    const text = sarif(1200);
    const ids = sarifIds(text);
    const mgr = new RiskRegisterManager(dir);
    const sink = (mgr as any).importSink();
    let call = 0;
    const flaky = (write: () => void) => { call++; if (call === 2) throw new Error('chunk refused'); sink.batch(write); };
    const result = importSarifText(text, (r: Record<string, unknown>) => sink.upsertRisk(r, {}), flaky);
    assert.deepEqual([result.write.written, result.failed, result.write.chunks, result.write.chunksFailed], [700, 500, 3, 1]);
    assert.equal(result.write.writeError, 'chunk refused');
    const stored = new Set(storedIds(mgr));
    assert.ok(ids.slice(0, 500).every((id) => stored.has(id)), 'chunk 1 is stored');
    assert.ok(ids.slice(500, 1000).every((id) => !stored.has(id)), 'chunk 2 is not');
    assert.ok(ids.slice(1000).every((id) => stored.has(id)), 'chunk 3 is stored');
  });
});

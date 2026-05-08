// Functional tests for sentinel engines:
// - ExistenceEngine (FX345)
// - HeuristicEngine (FX343)
// - PatternLoader (FX347)
// - VerdictRouter (FX342)

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExistenceEngine } from '../../sentinel/engines/ExistenceEngine';
import { HeuristicEngine } from '../../sentinel/engines/HeuristicEngine';
import { PatternLoader } from '../../sentinel/PatternLoader';
import { VerdictRouter } from '../../sentinel/VerdictRouter';
import { EventBus } from '../../shared/EventBus';

function makeConfigManager(workspaceRoot: string | undefined): any {
  return { getWorkspaceRoot: () => workspaceRoot, getConfig: () => ({}) };
}

suite('ExistenceEngine (FX345)', () => {
  let dir: string;
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-')); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX345 validateClaim — no workspace root → EXS000 medium severity', () => {
    const e = new ExistenceEngine(makeConfigManager(undefined));
    const r = e.validateClaim(['some/file.ts']);
    assert.equal(r.length, 1);
    assert.equal(r[0].patternId, 'EXS000');
    assert.equal(r[0].severity, 'medium');
  });

  test('FX345 validateClaim — existing file produces no result', () => {
    fs.writeFileSync(path.join(dir, 'real.ts'), 'export {};');
    const e = new ExistenceEngine(makeConfigManager(dir));
    const r = e.validateClaim(['real.ts']);
    assert.deepEqual(r, []);
  });

  test('FX345 validateClaim — missing file → EXS001 critical severity', () => {
    const e = new ExistenceEngine(makeConfigManager(dir));
    const r = e.validateClaim(['ghost.ts']);
    assert.equal(r.length, 1);
    assert.equal(r[0].patternId, 'EXS001');
    assert.equal(r[0].severity, 'critical');
    assert.match(String(r[0].location?.snippet), /Claimed file missing.*ghost\.ts/);
  });

  test('FX345 validateClaim — path-traversal attempt → EXS002 critical', () => {
    const e = new ExistenceEngine(makeConfigManager(dir));
    const r = e.validateClaim(['../../etc/passwd']);
    assert.equal(r.length, 1);
    assert.equal(r[0].patternId, 'EXS002');
    assert.equal(r[0].severity, 'critical');
    assert.match(String(r[0].location?.snippet), /Path Traversal Detected/);
  });

  test('FX345 validateClaim — mixed result for multiple artifacts', () => {
    fs.writeFileSync(path.join(dir, 'a.ts'), 'a');
    const e = new ExistenceEngine(makeConfigManager(dir));
    const r = e.validateClaim(['a.ts', 'b-missing.ts', '../escape.ts']);
    assert.equal(r.length, 2); // a.ts present (no result); b-missing + escape both flagged
    assert.ok(r.some(x => x.patternId === 'EXS001'));
    assert.ok(r.some(x => x.patternId === 'EXS002'));
  });
});

suite('PatternLoader (FX347)', () => {
  test('FX347 — getPatterns returns DEFAULT_PATTERNS without workspace', () => {
    const p = new PatternLoader();
    const patterns = p.getPatterns();
    assert.ok(patterns.length > 0, 'should have default patterns');
    assert.ok(patterns[0].id);
    assert.ok(patterns[0].pattern);
  });

  test('FX347 — getPattern by id returns matching pattern or undefined', () => {
    const p = new PatternLoader();
    const all = p.getPatterns();
    const first = p.getPattern(all[0].id);
    assert.equal(first?.id, all[0].id);
    assert.equal(p.getPattern('does-not-exist'), undefined);
  });

  test('FX347 compilePattern — valid pattern → RegExp', () => {
    const p = new PatternLoader();
    const r = p.compilePattern({ id: 'X', name: 'X', pattern: 'foo\\d+', category: 'test', severity: 'low' } as never);
    assert.ok(r instanceof RegExp);
    assert.equal(r!.test('foo123'), true);
  });

  test('FX347 compilePattern — ReDoS-prone (a+)+ rejected', () => {
    const p = new PatternLoader();
    const r = p.compilePattern({ id: 'X', name: 'X', pattern: '(a+)+', category: 'test', severity: 'low' } as never);
    assert.equal(r, null);
  });

  test('FX347 compilePattern — excessive bound rejected', () => {
    const p = new PatternLoader();
    const r = p.compilePattern({ id: 'X', name: 'X', pattern: 'a{500}', category: 'test', severity: 'low' } as never);
    assert.equal(r, null);
  });

  test('FX347 compilePattern — invalid regex returns null', () => {
    const p = new PatternLoader();
    const r = p.compilePattern({ id: 'X', name: 'X', pattern: '[unclosed', category: 'test', severity: 'low' } as never);
    assert.equal(r, null);
  });

  test('FX347 compilePattern — pattern over 500 chars rejected', () => {
    const p = new PatternLoader();
    const r = p.compilePattern({ id: 'X', name: 'X', pattern: 'a'.repeat(501), category: 'test', severity: 'low' } as never);
    assert.equal(r, null);
  });
});

suite('HeuristicEngine (FX343)', () => {
  test('FX343 analyze — no content returns empty results', () => {
    const e = new HeuristicEngine(null as never, new PatternLoader());
    assert.deepEqual(e.analyze('foo.ts'), []);
  });

  test('FX343 analyze — content over MAX_CONTENT_SIZE skipped', () => {
    const e = new HeuristicEngine(null as never, new PatternLoader());
    const huge = 'a'.repeat(2 * 1024 * 1024); // 2MB
    assert.deepEqual(e.analyze('big.ts', huge), []);
  });

  test('FX343 analyze — runs over default patterns and returns matched/unmatched results', () => {
    const e = new HeuristicEngine(null as never, new PatternLoader());
    const r = e.analyze('foo.ts', 'const x = 1;\n');
    assert.ok(Array.isArray(r));
    // should contain entries for at least the default patterns
    assert.ok(r.length >= 1);
    assert.ok(r.every(x => 'patternId' in x && 'matched' in x));
  });

  test('FX343 analyze — high cyclomatic complexity flagged as CMP001', () => {
    const e = new HeuristicEngine(null as never, new PatternLoader());
    // Generate >10 decision points
    const code = `
      function foo(x: number) {
        if (x > 1) {} else if (x > 2) {} else if (x > 3) {}
        for (let i = 0; i < 10; i++) {}
        for (let j = 0; j < 10; j++) {}
        for (let k = 0; k < 10; k++) {}
        while (x > 0) {}
        switch (x) { case 1: case 2: case 3: case 4: case 5: }
        try {} catch (e) {}
      }
    `;
    const r = e.analyze('foo.ts', code);
    const cmp = r.find(x => x.patternId === 'CMP001');
    assert.ok(cmp, 'should emit CMP001 for high complexity');
    assert.ok(cmp!.matched);
    assert.match(String(cmp!.location?.snippet), /Cyclomatic complexity:/);
  });

  test('FX343 analyze — low complexity does NOT emit CMP001', () => {
    const e = new HeuristicEngine(null as never, new PatternLoader());
    const r = e.analyze('simple.ts', 'export const x = 42;\n');
    assert.equal(r.find(x => x.patternId === 'CMP001'), undefined);
  });
});

suite('VerdictRouter (FX342)', () => {
  test('FX342 route — emits sentinel.verdict event', async () => {
    const bus = new EventBus();
    const captured: any[] = [];
    bus.on('sentinel.verdict' as never, (w: any) => captured.push(w));
    const ql: any = { queueL3Approval: async () => {} };
    const r = new VerdictRouter(bus, ql);
    await r.route({ decision: 'PASS', riskGrade: 'L1', summary: 'ok' } as never);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].payload.decision, 'PASS');
  });

  test('FX342 route — ESCALATE decision triggers queueL3Approval', async () => {
    let queued: any = null;
    const ql: any = { queueL3Approval: async (req: any) => { queued = req; } };
    const r = new VerdictRouter(new EventBus(), ql);
    await r.route({
      decision: 'ESCALATE', riskGrade: 'L3', artifactPath: 'src/auth.ts',
      agentDid: 'did:t:a', agentTrustAtVerdict: 0.5, summary: 'risky', matchedPatterns: ['p1'],
    } as never);
    assert.ok(queued);
    assert.equal(queued.filePath, 'src/auth.ts');
    assert.equal(queued.riskGrade, 'L3');
    assert.deepEqual(queued.flags, ['p1']);
  });

  test('FX342 route — non-ESCALATE decision does NOT call queueL3Approval', async () => {
    let calls = 0;
    const ql: any = { queueL3Approval: async () => { calls++; } };
    const r = new VerdictRouter(new EventBus(), ql);
    await r.route({ decision: 'PASS', riskGrade: 'L1' } as never);
    await r.route({ decision: 'BLOCK', riskGrade: 'L3' } as never);
    assert.equal(calls, 0);
  });

  test('FX342 route — queueL3Approval failure emits sentinel.escalation_failed event', async () => {
    const bus = new EventBus();
    const failures: any[] = [];
    bus.on('sentinel.escalation_failed' as never, (w: any) => failures.push(w));
    const ql: any = { queueL3Approval: async () => { throw new Error('queue down'); } };
    const r = new VerdictRouter(bus, ql);
    await r.route({ decision: 'ESCALATE', riskGrade: 'L3', artifactPath: 'x' } as never);
    assert.equal(failures.length, 1);
    assert.match(String(failures[0].payload.error), /queue down/);
  });

  test('FX342 route — missing artifactPath defaults to "unknown"', async () => {
    let queued: any = null;
    const ql: any = { queueL3Approval: async (req: any) => { queued = req; } };
    const r = new VerdictRouter(new EventBus(), ql);
    await r.route({ decision: 'ESCALATE', riskGrade: 'L3' } as never);
    assert.equal(queued.filePath, 'unknown');
  });
});

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PlanFileReader, parsePlanFromText } from '../../roadmap/services/PlanFileReader';

let tmpRoot: string;

function plansDir(): string {
  return path.join(tmpRoot, '.failsafe', 'governance', 'plans');
}

function writePlan(name: string, content: string, mtimeMs?: number): string {
  fs.mkdirSync(plansDir(), { recursive: true });
  const p = path.join(plansDir(), name);
  fs.writeFileSync(p, content);
  if (mtimeMs !== undefined) fs.utimesSync(p, mtimeMs / 1000, mtimeMs / 1000);
  return p;
}

suite('PlanFileReader: parsePlanFromText', function () {
  this.timeout(5000);
  test('extracts H1 title, open questions, phases', () => {
    const md = `# Plan: Sample Feature

## Open Questions

1. Question one
2. Question two

## Phase 1 — Foundation

Stuff happens.

## Phase 2 — Wiring

More stuff.
`;
    const parsed = parsePlanFromText(md, 'plan-sample.md');
    assert.equal(parsed.title, 'Plan: Sample Feature');
    assert.equal(parsed.openQuestions.length, 2);
    assert.match(parsed.openQuestions[0], /Question one/);
    assert.equal(parsed.phases.length, 2);
    assert.equal(parsed.phases[0].name, 'Phase 1 — Foundation');
    assert.equal(parsed.phases[0].status, 'in-progress');
  });

  test('handles markdown with no Open Questions section', () => {
    const md = `# Plan X\n\n## Phase 1 — Only`;
    const parsed = parsePlanFromText(md, 'plan-x.md');
    assert.deepEqual(parsed.openQuestions, []);
    assert.equal(parsed.phases.length, 1);
  });

  test('returns empty title fallback to filename when no H1', () => {
    const parsed = parsePlanFromText('## Phase 1', 'plan-untitled.md');
    assert.equal(parsed.title, 'plan-untitled');
  });
});

suite('PlanFileReader: pickLatestPlan', function () {
  this.timeout(5000);
  setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-reader-')); });
  teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ } });

  test('returns null when no plans directory exists', () => {
    const reader = new PlanFileReader(tmpRoot);
    assert.equal(reader.pickLatestPlan(), null);
  });

  test('returns null when plans directory is empty', () => {
    fs.mkdirSync(plansDir(), { recursive: true });
    const reader = new PlanFileReader(tmpRoot);
    assert.equal(reader.pickLatestPlan(), null);
  });

  test('picks the plan with the most-recent mtime', () => {
    const now = Date.now();
    writePlan('plan-old.md', '# Plan: Old', now - 10_000);
    writePlan('plan-new.md', '# Plan: New', now);
    writePlan('plan-mid.md', '# Plan: Mid', now - 5_000);
    const reader = new PlanFileReader(tmpRoot);
    const latest = reader.pickLatestPlan();
    assert.ok(latest);
    assert.equal(latest!.title, 'Plan: New');
    assert.equal(latest!.planId, 'plan-new');
  });

  test('listPlans returns all plans sorted by mtime descending', () => {
    const now = Date.now();
    writePlan('plan-a.md', '# Plan: A', now - 10_000);
    writePlan('plan-b.md', '# Plan: B', now);
    writePlan('plan-c.md', '# Plan: C', now - 5_000);
    const reader = new PlanFileReader(tmpRoot);
    const plans = reader.listPlans();
    assert.deepEqual(plans.map((p) => p.planId), ['plan-b', 'plan-c', 'plan-a']);
  });

  test('skips non-markdown files', () => {
    fs.mkdirSync(plansDir(), { recursive: true });
    fs.writeFileSync(path.join(plansDir(), 'README.txt'), 'not a plan');
    fs.writeFileSync(path.join(plansDir(), 'plan-real.md'), '# Plan: Real');
    const reader = new PlanFileReader(tmpRoot);
    const plans = reader.listPlans();
    assert.equal(plans.length, 1);
    assert.equal(plans[0].planId, 'plan-real');
  });
});

// Functional tests for CheckpointReconciler (FX317).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CheckpointReconciler } from '../../governance/CheckpointReconciler';
import { EventBus } from '../../shared/EventBus';

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  return dir;
}

function makeSentinelStub(): { audited: string[]; sentinel: any } {
  const audited: string[] = [];
  return {
    audited,
    sentinel: { auditFile: async (f: string) => { audited.push(f); } },
  };
}

function captureEvents(bus: EventBus, type: string): any[] {
  const events: any[] = [];
  bus.on(type as never, (w: any) => events.push(w));
  return events;
}

suite('CheckpointReconciler (FX317)', () => {
  let dir: string;
  setup(() => { dir = makeWorkspace(); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX317 createCheckpoint — emits governance.checkpointCreated with fileCount', () => {
    fs.writeFileSync(path.join(dir, 'src/a.ts'), 'a');
    fs.writeFileSync(path.join(dir, 'src/b.ts'), 'b');
    const bus = new EventBus();
    const events = captureEvents(bus, 'governance.checkpointCreated');
    const { sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, bus, sentinel);
    c.createCheckpoint();
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.fileCount, 2);
    assert.ok(events[0].payload.timestamp > 0);
  });

  test('FX317 detectDrift — no checkpoint → all empty + ungoverned=false', () => {
    const { sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, new EventBus(), sentinel);
    const d = c.detectDrift();
    assert.deepEqual(d, { addedFiles: [], modifiedFiles: [], deletedFiles: [], ungoverned: false });
  });

  test('FX317 detectDrift — clean state → ungoverned=false', () => {
    fs.writeFileSync(path.join(dir, 'src/a.ts'), 'a');
    const { sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, new EventBus(), sentinel);
    c.createCheckpoint();
    const d = c.detectDrift();
    assert.equal(d.ungoverned, false);
  });

  test('FX317 detectDrift — added file detected', () => {
    fs.writeFileSync(path.join(dir, 'src/a.ts'), 'a');
    const { sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, new EventBus(), sentinel);
    c.createCheckpoint();
    fs.writeFileSync(path.join(dir, 'src/b.ts'), 'b');
    const d = c.detectDrift();
    assert.equal(d.addedFiles.length, 1);
    assert.match(d.addedFiles[0], /b\.ts$/);
    assert.equal(d.ungoverned, true);
  });

  test('FX317 detectDrift — deleted file detected', () => {
    fs.writeFileSync(path.join(dir, 'src/a.ts'), 'a');
    fs.writeFileSync(path.join(dir, 'src/b.ts'), 'b');
    const { sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, new EventBus(), sentinel);
    c.createCheckpoint();
    fs.unlinkSync(path.join(dir, 'src/b.ts'));
    const d = c.detectDrift();
    assert.equal(d.deletedFiles.length, 1);
    assert.match(d.deletedFiles[0], /b\.ts$/);
  });

  test('FX317 detectDrift — modified file detected by size change', async () => {
    fs.writeFileSync(path.join(dir, 'src/a.ts'), 'short');
    const { sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, new EventBus(), sentinel);
    c.createCheckpoint();
    await new Promise(r => setTimeout(r, 10));
    fs.writeFileSync(path.join(dir, 'src/a.ts'), 'much longer content here');
    const d = c.detectDrift();
    assert.equal(d.modifiedFiles.length, 1);
  });

  test('FX317 hasDrift — convenience boolean alias of detectDrift().ungoverned', () => {
    fs.writeFileSync(path.join(dir, 'src/a.ts'), 'a');
    const { sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, new EventBus(), sentinel);
    c.createCheckpoint();
    assert.equal(c.hasDrift(), false);
    fs.writeFileSync(path.join(dir, 'src/b.ts'), 'b');
    assert.equal(c.hasDrift(), true);
  });

  test('FX317 reconcile — drift triggers governance.driftDetected + audits up to 10 files', async () => {
    fs.writeFileSync(path.join(dir, 'src/a.ts'), 'a');
    const bus = new EventBus();
    const driftEvents = captureEvents(bus, 'governance.driftDetected');
    const { audited, sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, bus, sentinel);
    c.createCheckpoint();
    // Add 12 files to trigger >10 cap
    for (let i = 0; i < 12; i++) {
      fs.writeFileSync(path.join(dir, `src/new-${i}.ts`), 'x');
    }
    const r = await c.reconcile();
    assert.equal(r.ungoverned, true);
    assert.equal(driftEvents.length, 1);
    assert.equal(audited.length, 10, 'audit cap of 10 files');
  });

  test('FX317 reconcile — no drift → no events, no audits', async () => {
    fs.writeFileSync(path.join(dir, 'src/a.ts'), 'a');
    const bus = new EventBus();
    const driftEvents = captureEvents(bus, 'governance.driftDetected');
    const { audited, sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, bus, sentinel);
    c.createCheckpoint();
    await c.reconcile();
    assert.equal(driftEvents.length, 0);
    assert.equal(audited.length, 0);
  });

  test('FX317 reconcile — creates new checkpoint after reconciling drift', async () => {
    fs.writeFileSync(path.join(dir, 'src/a.ts'), 'a');
    const { sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, new EventBus(), sentinel);
    c.createCheckpoint();
    fs.writeFileSync(path.join(dir, 'src/b.ts'), 'b');
    await c.reconcile();
    // Subsequent detectDrift should now show clean (b is in new checkpoint)
    assert.equal(c.detectDrift().ungoverned, false);
  });

  test('FX317 reconcile — sentinel.auditFile failure does not crash', async () => {
    fs.writeFileSync(path.join(dir, 'src/a.ts'), 'a');
    const sentinel: any = { auditFile: async () => { throw new Error('audit boom'); } };
    const c = new CheckpointReconciler(dir, new EventBus(), sentinel);
    c.createCheckpoint();
    fs.writeFileSync(path.join(dir, 'src/b.ts'), 'b');
    await assert.doesNotReject(c.reconcile());
  });

  test('FX317 getLastCheckpointTime — null before, number after', () => {
    const { sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, new EventBus(), sentinel);
    assert.equal(c.getLastCheckpointTime(), null);
    c.createCheckpoint();
    assert.ok(c.getLastCheckpointTime()! > 0);
  });

  test('FX317 snapshotWorkspaceFiles — skips node_modules and hidden dirs', () => {
    fs.mkdirSync(path.join(dir, 'src/node_modules/x'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/node_modules/x/y.ts'), 'x');
    fs.mkdirSync(path.join(dir, 'src/.hidden'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/.hidden/secret.ts'), 'x');
    fs.writeFileSync(path.join(dir, 'src/visible.ts'), 'v');
    const bus = new EventBus();
    const events = captureEvents(bus, 'governance.checkpointCreated');
    const { sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, bus, sentinel);
    c.createCheckpoint();
    assert.equal(events[0].payload.fileCount, 1);
  });

  test('FX317 snapshotWorkspaceFiles — only ts/tsx/js/jsx/json/yaml/yml/md tracked', () => {
    fs.writeFileSync(path.join(dir, 'src/a.ts'), 'x');
    fs.writeFileSync(path.join(dir, 'src/b.png'), 'x');
    fs.writeFileSync(path.join(dir, 'src/c.exe'), 'x');
    const bus = new EventBus();
    const events = captureEvents(bus, 'governance.checkpointCreated');
    const { sentinel } = makeSentinelStub();
    const c = new CheckpointReconciler(dir, bus, sentinel);
    c.createCheckpoint();
    assert.equal(events[0].payload.fileCount, 1);
  });
});

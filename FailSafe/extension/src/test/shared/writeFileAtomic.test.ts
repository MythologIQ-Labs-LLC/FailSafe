// FX963: risk register writes are atomic. A write that dies part-way must
// leave the previous risks.json intact, never a truncated file.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RiskManager } from '../../qorelogic/risk/RiskManager';
import { RiskRegisterManager } from '../../roadmap/services/RiskRegisterManager';
import { writeFileAtomicSync } from '../../shared/writeFileAtomic';

type Patchable = Record<string, unknown>;

/**
 * Replace fs[name] on the real module object (what every importer resolves
 * through) for the duration of fn, then restore it.
 */
function withPatched<T>(name: string, impl: unknown, fn: () => T): T {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const target = require('fs') as Patchable;
  const original = target[name];
  target[name] = impl;
  try {
    return fn();
  } finally {
    target[name] = original;
  }
}

/** A writeFileSync that writes the first half of the bytes, then dies. */
function tornWriteFileSync(file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView): void {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const fd = fs.openSync(file as fs.PathLike, 'w');
  try {
    fs.writeSync(fd, buf, 0, Math.floor(buf.length / 2));
  } finally {
    fs.closeSync(fd);
  }
  throw new Error('simulated crash mid-write');
}

function leftoverTemps(dir: string): string[] {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
}

const STD_INPUT = {
  title: 'First risk',
  description: 'desc',
  category: 'security' as const,
  severity: 'high' as const,
  impact: 'big',
  mitigation: 'fix it',
  source: 'manual' as const,
};

suite('writeFileAtomic (FX963)', () => {
  let dir: string;
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wfa-')); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('RiskManager: a write that dies part-way leaves the previous register parseable', () => {
    const m = new RiskManager(dir, 'test-project');
    const first = m.createRisk(STD_INPUT);
    const file = path.join(dir, '.failsafe', 'risks', 'risks.json');

    assert.throws(() => withPatched('writeFileSync', tornWriteFileSync, () =>
      m.createRisk({ ...STD_INPUT, title: 'Second risk' })));

    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(data.risks.map((r: { id: string }) => r.id), [first.id]);
    assert.deepEqual(leftoverTemps(path.dirname(file)), []);
  });

  test('RiskRegisterManager.upsertRisk: a write that dies part-way leaves the previous register parseable', () => {
    const mgr = new RiskRegisterManager(dir);
    mgr.upsertRisk({ id: 'r-1', title: 'one' });
    const file = path.join(dir, '.failsafe', 'risks', 'risks.json');

    assert.throws(() => withPatched('writeFileSync', tornWriteFileSync, () =>
      mgr.upsertRisk({ id: 'r-2', title: 'two' })));

    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(data.risks.map((r: { id: string }) => r.id), ['r-1']);
    assert.deepEqual(leftoverTemps(path.dirname(file)), []);
  });

  test('success replaces the target in one rename and leaves no temp file', () => {
    const target = path.join(dir, 'risks.json');
    fs.writeFileSync(target, 'old');
    const renames: Array<[string, string]> = [];
    const realRename = fs.renameSync;
    withPatched('renameSync', (from: string, to: string) => {
      renames.push([from, to]);
      realRename(from, to);
    }, () => writeFileAtomicSync(target, 'new'));

    assert.equal(fs.readFileSync(target, 'utf8'), 'new');
    assert.equal(renames.length, 1);
    assert.equal(path.dirname(renames[0][0]), dir);
    assert.match(path.basename(renames[0][0]), /^\.risks\.json\.[0-9a-f]+\.tmp$/);
    assert.equal(renames[0][1], target);
    assert.deepEqual(leftoverTemps(dir), []);
  });

  test('a rename refused twice with EPERM then accepted still persists', () => {
    const target = path.join(dir, 'risks.json');
    fs.writeFileSync(target, 'old');
    const realRename = fs.renameSync;
    let calls = 0;
    withPatched('renameSync', (from: string, to: string) => {
      calls++;
      if (calls <= 2) {
        throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
      }
      realRename(from, to);
    }, () => writeFileAtomicSync(target, 'new'));

    assert.equal(calls, 3);
    assert.equal(fs.readFileSync(target, 'utf8'), 'new');
    assert.deepEqual(leftoverTemps(dir), []);
  });

  test('a rename that always fails throws, keeps the original bytes and removes the temp file', () => {
    const target = path.join(dir, 'risks.json');
    fs.writeFileSync(target, 'old');
    let calls = 0;
    assert.throws(() => withPatched('renameSync', () => {
      calls++;
      throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });
    }, () => writeFileAtomicSync(target, 'new')), /EBUSY/);

    assert.equal(calls, 3);
    assert.equal(fs.readFileSync(target, 'utf8'), 'old');
    assert.deepEqual(leftoverTemps(dir), []);
  });

  test('a non-retryable rename error is not retried', () => {
    const target = path.join(dir, 'risks.json');
    fs.writeFileSync(target, 'old');
    let calls = 0;
    assert.throws(() => withPatched('renameSync', () => {
      calls++;
      throw Object.assign(new Error('ENOSPC: no space left'), { code: 'ENOSPC' });
    }, () => writeFileAtomicSync(target, 'new')), /ENOSPC/);

    assert.equal(calls, 1);
    assert.equal(fs.readFileSync(target, 'utf8'), 'old');
    assert.deepEqual(leftoverTemps(dir), []);
  });
});

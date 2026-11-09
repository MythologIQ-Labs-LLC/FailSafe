import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  FROZEN_QOR_WHEEL_NAME, FROZEN_QOR_WHEEL_SHA256,
  MAX_FROZEN_QOR_WHEEL_BYTES, WheelVerificationError, withVerifiedQorWheel,
} from '../../qorlogic/frozenWheel';

suite('#463: bounded immutable frozen wheel stage', () => {
  let dir: string;
  setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-wheel-test-')); });
  teardown(() => { fs.rmSync(dir, { force: true, recursive: true }); });

  test('real PyPI release fits the enforced size budget', () => {
    assert.equal(FROZEN_QOR_WHEEL_NAME, 'qor_logic-0.176.1-py3-none-any.whl');
    assert.match(FROZEN_QOR_WHEEL_SHA256, /^[0-9a-f]{64}$/);
    assert.ok(MAX_FROZEN_QOR_WHEEL_BYTES >= 3 * 1024 * 1024);
    assert.ok(MAX_FROZEN_QOR_WHEEL_BYTES <= 16 * 1024 * 1024);
  });

  test('invalid filename and relative path refuse before opening files', async () => {
    for (const filename of ['../../' + FROZEN_QOR_WHEEL_NAME, path.join(dir, 'other.whl')]) {
      let consumed = false;
      await assert.rejects(withVerifiedQorWheel(filename, async () => { consumed = true; }),
        (err: unknown) => err instanceof WheelVerificationError && err.reason === 'invalid-wheel-path');
      assert.equal(consumed, false);
    }
  });

  test('oversized sparse file refuses without allocating the whole file', async () => {
    const file = path.join(dir, FROZEN_QOR_WHEEL_NAME);
    fs.closeSync(fs.openSync(file, 'w'));
    fs.truncateSync(file, MAX_FROZEN_QOR_WHEEL_BYTES + 1);
    let called = false;
    await assert.rejects(withVerifiedQorWheel(file, async () => { called = true; }),
      (err: unknown) => err instanceof WheelVerificationError && err.reason === 'wheel-too-large');
    assert.equal(called, false);
  });

  test('wrong bytes refuse and never invoke installation callback', async () => {
    const file = path.join(dir, FROZEN_QOR_WHEEL_NAME);
    fs.writeFileSync(file, 'not the pinned Qor-logic wheel');
    let called = false;
    await assert.rejects(withVerifiedQorWheel(file, async () => { called = true; }),
      (err: unknown) => err instanceof WheelVerificationError && err.reason === 'unverified-wheel');
    assert.equal(called, false);
  });

  test('direct symlinks are refused on platforms that can create them', async function () {
    const real = path.join(dir, 'real.whl');
    fs.writeFileSync(real, 'not the pinned wheel');
    const link = path.join(dir, FROZEN_QOR_WHEEL_NAME);
    try { fs.symlinkSync(real, link, 'file'); }
    catch { this.skip(); return; }
    await assert.rejects(withVerifiedQorWheel(link, async () => undefined),
      (err: unknown) => err instanceof WheelVerificationError && err.reason === 'invalid-wheel-path');
  });
});

import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SecurityReplayGuard } from '../governance/SecurityReplayGuard';

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('SecurityReplayGuard storage path handling', () => {
  it('stores nonces under workspaceRoot/.failsafe/security', () => {
    const workspaceRoot = mkTempDir('failsafe-guard-workspace-');
    try {
      const guard = new SecurityReplayGuard(workspaceRoot, { cleanupIntervalMs: 60000 });
      guard.generateNonce({ source: 'unit-test' });
      guard.dispose();

      const expectedStore = path.join(
        workspaceRoot,
        '.failsafe',
        'security',
        'nonces.json',
      );
      assert.strictEqual(fs.existsSync(expectedStore), true);
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('FX472 refuses a consumed nonce when durable storage write fails', () => {
    const root = mkTempDir('failsafe-guard-failconsume-');
    const guard = new SecurityReplayGuard(root, { cleanupIntervalMs: 60000 });
    try {
      const nonce = guard.generateNonce();
      const file = path.join(root, '.failsafe', 'security', 'nonces.json');
      fs.renameSync(file, `${file}.previous`);
      fs.mkdirSync(file); // atomic rename over a directory must fail on all OSes

      const result = guard.consumeNonce(nonce, 'unit-test');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'storage_unavailable');
      assert.strictEqual(guard.validateNonce(nonce).reason, 'already_used');
      const dir = path.dirname(file);
      assert.deepStrictEqual(fs.readdirSync(dir).filter(n => n.endsWith('.tmp')), []);
    } finally {
      guard.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('FX472 refuses to issue a nonce when it cannot persist issuance', () => {
    const root = mkTempDir('failsafe-guard-failissue-');
    const guard = new SecurityReplayGuard(root, { cleanupIntervalMs: 60000 });
    try {
      const file = path.join(root, '.failsafe', 'security', 'nonces.json');
      fs.mkdirSync(file);
      assert.throws(() => guard.generateNonce(), /durable nonce storage unavailable/);
      assert.strictEqual(guard.getStats().total, 0, 'failed issuance must not retain a nonce');
    } finally {
      guard.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('FX472 a successfully persisted consumption stays used after restart', () => {
    const root = mkTempDir('failsafe-guard-restart-');
    let guard = new SecurityReplayGuard(root, { cleanupIntervalMs: 60000 });
    try {
      const nonce = guard.generateNonce();
      assert.strictEqual(guard.consumeNonce(nonce, 'unit-test').valid, true);
      guard.dispose();
      guard = new SecurityReplayGuard(root, { cleanupIntervalMs: 60000 });
      assert.strictEqual(guard.validateNonce(nonce).reason, 'already_used');
    } finally {
      guard.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts direct .failsafe/security directory without nesting paths', () => {
    const workspaceRoot = mkTempDir('failsafe-guard-security-dir-');
    const securityDir = path.join(workspaceRoot, '.failsafe', 'security');
    try {
      const guard = new SecurityReplayGuard(securityDir, { cleanupIntervalMs: 60000 });
      guard.generateNonce({ source: 'unit-test' });
      guard.dispose();

      const directStore = path.join(securityDir, 'nonces.json');
      const nestedStore = path.join(
        securityDir,
        '.failsafe',
        'security',
        'nonces.json',
      );

      assert.strictEqual(fs.existsSync(directStore), true);
      assert.strictEqual(fs.existsSync(nestedStore), false);
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});


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


describe('SecurityReplayGuard persistence failure semantics (#472)', () => {
  it('consumed nonce remains rejected after process restart', () => {
    const root = mkTempDir('failsafe-replay-restart-');
    let guard: SecurityReplayGuard | undefined;
    try {
      guard = new SecurityReplayGuard(root);
      const nonce = guard.generateNonce();
      assert.strictEqual(guard.consumeNonce(nonce).valid, true);
      guard.dispose();
      guard = new SecurityReplayGuard(root);
      assert.strictEqual(guard.consumeNonce(nonce).valid, false);
      assert.strictEqual(guard.validateNonce(nonce).reason, 'already_used');
    } finally {
      guard?.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses consumption when atomic persistence cannot replace the store', () => {
    const root = mkTempDir('failsafe-replay-writefail-');
    let guard: SecurityReplayGuard | undefined;
    let obstruction = '';
    try {
      guard = new SecurityReplayGuard(root);
      const nonce = guard.generateNonce();
      obstruction = path.join(root, '.failsafe', 'security', 'nonces.json');
      fs.unlinkSync(obstruction);
      fs.mkdirSync(obstruction);
      const result = guard.consumeNonce(nonce);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'persistence_error');
    } finally {
      if (obstruction) fs.rmSync(obstruction, { recursive: true, force: true });
      guard?.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('SecurityReplayGuard fail-closed store health (#472)', () => {
  it('rejects all authorizations when existing store is corrupt', () => {
    const root = mkTempDir('failsafe-replay-corrupt-');
    const storeDir = path.join(root, '.failsafe', 'security');
    fs.mkdirSync(storeDir, { recursive: true });
    fs.writeFileSync(path.join(storeDir, 'nonces.json'), '{invalid json');
    const guard = new SecurityReplayGuard(root);
    try {
      assert.strictEqual(guard.validateNonce('a'.repeat(64)).reason, 'persistence_error');
      assert.throws(() => guard.generateNonce(), /fail-closed persistence state/);
    } finally {
      guard.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects new issues and all subsequent consumes following failed consumption persistence', () => {
    const root = mkTempDir('failsafe-replay-unhealthy-');
    const guard = new SecurityReplayGuard(root);
    const nonce = guard.generateNonce();
    const store = path.join(root, '.failsafe', 'security', 'nonces.json');
    fs.unlinkSync(store);
    fs.mkdirSync(store);
    try {
      assert.strictEqual(guard.consumeNonce(nonce).reason, 'persistence_error');
      assert.strictEqual(guard.validateNonce(nonce).reason, 'persistence_error');
      assert.throws(() => guard.generateNonce(), /fail-closed persistence state/);
    } finally {
      fs.rmSync(store, { recursive: true, force: true });
      guard.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

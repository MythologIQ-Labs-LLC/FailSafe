import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SecurityReplayGuard } from '../governance/SecurityReplayGuard';
import { Logger } from '../shared/Logger';

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


describe('SecurityReplayGuard remaining v6.0.8 acceptance (#472)', () => {
  it('accepts a valid issued nonce through its TTL boundary and rejects it after expiry, including after reopen', () => {
    const root = mkTempDir('failsafe-replay-ttl-');
    let now = 1_700_000_000_000;
    const options = { ttlMs: 50, cleanupIntervalMs: 3_600_000, seams: { clock: () => now } };
    let guard: SecurityReplayGuard | undefined;
    try {
      guard = new SecurityReplayGuard(root, options);
      const nonce = guard.generateNonce();
      assert.strictEqual(guard.validateNonce(nonce).valid, true);
      now += 50;
      assert.strictEqual(guard.validateNonce(nonce).valid, true, 'TTL is inclusive at expiresAt');
      now += 1;
      assert.strictEqual(guard.validateNonce(nonce).reason, 'expired');
      assert.strictEqual(guard.consumeNonce(nonce).reason, 'expired');
      guard.dispose();
      guard = new SecurityReplayGuard(root, options);
      assert.strictEqual(guard.validateNonce(nonce).reason, 'expired', 'expiry persists across restart');
      assert.strictEqual(guard.consumeNonce(nonce).reason, 'expired', 'restart cannot authorize an expired nonce');
      assert.strictEqual(guard.cleanup(), 1, 'expired record is removed by cleanup');
      assert.strictEqual(guard.validateNonce(nonce).reason, 'not_found');
    } finally {
      guard?.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('never writes the full issued nonce into normal, rejected or replay diagnostic output', () => {
    const root = mkTempDir('failsafe-replay-private-');
    // VS Code's extension host can redirect console.* before this test runs.
    // Capture at the Logger boundary to prove actual structured diagnostics were emitted,
    // not a vacuous PASS from an empty console sink.
    const original = { debug: Logger.prototype.debug, info: Logger.prototype.info, warn: Logger.prototype.warn, error: Logger.prototype.error };
    const output: string[] = [];
    const capture = (level: string) => (message: string, data?: unknown) => {
      output.push(JSON.stringify({ level, message, data }));
    };
    let guard: SecurityReplayGuard | undefined;
    try {
      Logger.prototype.debug = capture('debug');
      Logger.prototype.info = capture('info');
      Logger.prototype.warn = capture('warn');
      Logger.prototype.error = capture('error');
      guard = new SecurityReplayGuard(root, { cleanupIntervalMs: 3_600_000 });
      const nonce = guard.generateNonce();
      assert.match(nonce, /^[0-9a-f]{64}$/, 'real randomly issued nonce is the canary');
      assert.strictEqual(guard.consumeNonce(nonce, 'privacy-test').valid, true);
      assert.strictEqual(guard.consumeNonce(nonce).reason, 'already_used');
      assert.strictEqual(guard.consumeNonce('x'.repeat(64)).reason, 'invalid_format');
      assert.ok(output.some((line) => line.includes('Nonce validation failed')), 'the guard emitted a rejected-nonce diagnostic');
      assert.ok(output.some((line) => line.includes('already_used')), 'a replay warning was captured');
      assert.ok(output.every((line) => !line.includes(nonce)), 'full nonce must not cross the Logger boundary');
    } finally {
      guard?.dispose();
      Logger.prototype.debug = original.debug;
      Logger.prototype.info = original.info;
      Logger.prototype.warn = original.warn;
      Logger.prototype.error = original.error;
      fs.rmSync(root, { recursive: true, force: true });
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

describe('SecurityReplayGuard store robustness (FX961, #472)', () => {
  it('an unhealthy store with an expiring entry never throws out of the cleanup interval', async () => {
    const root = mkTempDir('failsafe-replay-interval-');
    const guard = new SecurityReplayGuard(root, { cleanupIntervalMs: 20 });
    const store = path.join(root, '.failsafe', 'security', 'nonces.json');
    const uncaught: unknown[] = [];
    const onUncaught = (error: unknown) => { uncaught.push(error); };
    process.on('uncaughtException', onUncaught);
    try {
      // Expires after the failed consume, so a later interval tick must persist its removal.
      const nonce = guard.generateNonce(undefined, 100);
      fs.unlinkSync(store);
      fs.mkdirSync(store);
      assert.strictEqual(guard.consumeNonce(nonce).reason, 'persistence_error');
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.deepStrictEqual(uncaught, []);
      assert.throws(() => guard.generateNonce(), /fail-closed persistence state/);
    } finally {
      process.removeListener('uncaughtException', onUncaught);
      fs.rmSync(store, { recursive: true, force: true });
      guard.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('the fail-closed error names the store path and the recovery step', () => {
    const root = mkTempDir('failsafe-replay-message-');
    const storeDir = path.join(root, '.failsafe', 'security');
    fs.mkdirSync(storeDir, { recursive: true });
    fs.writeFileSync(path.join(storeDir, 'nonces.json'), '{invalid json');
    const guard = new SecurityReplayGuard(root);
    try {
      assert.throws(() => guard.generateNonce(), (error: Error) =>
        error.message.includes(path.join(storeDir, 'nonces.json')) && /move .* aside and reload the window/i.test(error.message));
    } finally {
      guard.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('a rename that fails EPERM twice then succeeds persists the store and stays healthy', () => {
    const root = mkTempDir('failsafe-replay-retry-');
    let failures = 0;
    const renameSync = (from: string, to: string) => {
      if (failures < 2) { failures++; throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' }); }
      fs.renameSync(from, to);
    };
    const guard = new SecurityReplayGuard(root, { renameSync });
    try {
      const nonce = guard.generateNonce();
      assert.strictEqual(failures, 2);
      const stored = JSON.parse(fs.readFileSync(path.join(root, '.failsafe', 'security', 'nonces.json'), 'utf8'));
      assert.ok(stored.some((r: { nonce: string }) => r.nonce === nonce));
      assert.doesNotThrow(() => guard.generateNonce());
    } finally {
      guard.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('a rename that always fails EPERM fails closed', () => {
    const root = mkTempDir('failsafe-replay-eperm-');
    let attempts = 0;
    const renameSync = () => { attempts++; throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' }); };
    const guard = new SecurityReplayGuard(root, { renameSync });
    try {
      assert.throws(() => guard.generateNonce());
      assert.strictEqual(attempts, 3);
      assert.throws(() => guard.generateNonce(), /fail-closed persistence state/);
    } finally {
      guard.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// Functional tests for NonceResolver (FX302).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NonceResolver } from '../../governance/adapters/NonceResolver';
import { SecurityReplayGuard } from '../../governance/SecurityReplayGuard';

function makeGuard(): { guard: SecurityReplayGuard; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonce-resolver-'));
  const guard = new SecurityReplayGuard(dir, { cleanupIntervalMs: 60000 });
  return {
    guard,
    cleanup: () => {
      guard.dispose();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

suite('NonceResolver (FX302)', () => {
  const cleanups: Array<() => void> = [];
  teardown(() => {
    while (cleanups.length) cleanups.pop()!();
  });
  test('FX302 resolve — no nonce + replayGuard disabled → generates new nonce', () => {
    const h = makeGuard(); cleanups.push(h.cleanup); const guard = h.guard;
    const r = new NonceResolver(guard, { enableReplayGuard: false });
    const out = r.resolve({ action: 'audit' } as never, new Date().toISOString());
    assert.equal(NonceResolver.isFailedResponse(out), false);
    assert.equal(typeof (out as { nonce: string }).nonce, 'string');
    assert.ok((out as { nonce: string }).nonce.length > 0);
  });

  test('FX302 resolve — no nonce + replayGuard enabled → still generates new nonce', () => {
    const h = makeGuard(); cleanups.push(h.cleanup); const guard = h.guard;
    const r = new NonceResolver(guard, { enableReplayGuard: true });
    const out = r.resolve({ action: 'audit' } as never, new Date().toISOString());
    assert.equal(NonceResolver.isFailedResponse(out), false);
    const nonce = (out as { nonce: string }).nonce;
    // It should be a valid generated nonce (validates against the guard registry)
    assert.equal(guard.validateNonce(nonce).valid, true);
  });

  test('FX302 resolve — existing nonce + replayGuard disabled → bypass validation, generate fresh', () => {
    const h = makeGuard(); cleanups.push(h.cleanup); const guard = h.guard;
    const r = new NonceResolver(guard, { enableReplayGuard: false });
    const out = r.resolve({ action: 'audit', nonce: 'arbitrary-string-bypass' } as never, new Date().toISOString());
    // When replayGuard is disabled, NonceResolver bypasses validation and generates a fresh nonce
    assert.equal(NonceResolver.isFailedResponse(out), false);
    const nonce = (out as { nonce: string }).nonce;
    assert.notEqual(nonce, 'arbitrary-string-bypass');
  });

  test('FX302 resolve — existing nonce + valid replayGuard → returns the existing nonce', () => {
    const h = makeGuard(); cleanups.push(h.cleanup); const guard = h.guard;
    // Generate a real nonce so consumeNonce succeeds
    const realNonce = guard.generateNonce({ action: 'audit' });
    const r = new NonceResolver(guard, { enableReplayGuard: true });
    const out = r.resolve({ action: 'audit', nonce: realNonce } as never, new Date().toISOString());
    assert.equal(NonceResolver.isFailedResponse(out), false);
    assert.equal((out as { nonce: string }).nonce, realNonce);
  });

  test('FX302 resolve — invalid replay nonce → returns DecisionResponse with allowed=false', () => {
    const h = makeGuard(); cleanups.push(h.cleanup); const guard = h.guard;
    const r = new NonceResolver(guard, { enableReplayGuard: true });
    // 'never-issued-nonce' was never generated; consumeNonce will fail validation
    const out = r.resolve({ action: 'audit', nonce: 'never-issued-nonce' } as never, new Date().toISOString());
    assert.equal(NonceResolver.isFailedResponse(out), true);
    const failed = out as { allowed: boolean; nonce: string; riskGrade: string; reason: string };
    assert.equal(failed.allowed, false);
    assert.equal(failed.nonce, 'never-issued-nonce');
    assert.equal(failed.riskGrade, 'L3');
    assert.match(failed.reason, /Nonce validation failed/);
  });

  test('FX302 resolve — replayed nonce (consumed twice) → second resolve fails', () => {
    const h = makeGuard(); cleanups.push(h.cleanup); const guard = h.guard;
    const realNonce = guard.generateNonce({ action: 'audit' });
    const r = new NonceResolver(guard, { enableReplayGuard: true });
    // First use succeeds (consumes the nonce)
    const first = r.resolve({ action: 'audit', nonce: realNonce } as never, new Date().toISOString());
    assert.equal(NonceResolver.isFailedResponse(first), false);
    // Second use of same nonce should fail (already consumed)
    const second = r.resolve({ action: 'audit', nonce: realNonce } as never, new Date().toISOString());
    assert.equal(NonceResolver.isFailedResponse(second), true);
    assert.equal((second as { allowed: boolean }).allowed, false);
  });

  test('FX302 isFailedResponse — distinguishes failed DecisionResponse from NonceResult', () => {
    assert.equal(NonceResolver.isFailedResponse({ nonce: 'just-a-nonce' }), false);
    assert.equal(NonceResolver.isFailedResponse({ allowed: false, nonce: 'x', riskGrade: 'L3' as never } as never), true);
    assert.equal(NonceResolver.isFailedResponse({ allowed: true, nonce: 'x', riskGrade: 'L1' as never } as never), true);
  });
});

// Functional tests for TransparencyEmitter (FX301).

import { strict as assert } from 'assert';
import { TransparencyEmitter } from '../../governance/adapters/TransparencyEmitter';

interface CapturedTx { kind: string; args: unknown[]; }

function makeTransparencyStub(): { calls: CapturedTx[]; transparency: Record<string, (...args: unknown[]) => unknown> } {
  const calls: CapturedTx[] = [];
  const transparency: Record<string, (...args: unknown[]) => unknown> = {
    emitBuildStarted: (...args) => { calls.push({ kind: 'started', args }); return `build-${calls.length}`; },
    emitDispatched: (...args) => { calls.push({ kind: 'dispatched', args }); return undefined; },
    emitDispatchBlocked: (...args) => { calls.push({ kind: 'blocked', args }); return undefined; },
  };
  return { calls, transparency };
}

suite('TransparencyEmitter (FX301)', () => {
  test('FX301 emitStart — disabled config returns undefined and emits nothing', () => {
    const stub = makeTransparencyStub();
    const e = new TransparencyEmitter(stub.transparency as never, { enableTransparency: false });
    const id = e.emitStart({ intentId: 'i1', agentDid: 'did:t:a', action: 'audit', artifactPath: 'x' } as never);
    assert.equal(id, undefined);
    assert.equal(stub.calls.length, 0);
  });

  test('FX301 emitStart — enabled config emits buildStarted with request fields', () => {
    const stub = makeTransparencyStub();
    const e = new TransparencyEmitter(stub.transparency as never, { enableTransparency: true });
    const id = e.emitStart({ intentId: 'i1', agentDid: 'did:t:a', action: 'audit', artifactPath: 'x' } as never);
    assert.equal(id, 'build-1');
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].kind, 'started');
    const payload = stub.calls[0].args[0] as Record<string, unknown>;
    assert.equal(payload.intentId, 'i1');
    assert.equal(payload.agentDid, 'did:t:a');
  });

  test('FX301 emitCompletion — disabled config emits nothing', () => {
    const stub = makeTransparencyStub();
    const e = new TransparencyEmitter(stub.transparency as never, { enableTransparency: false });
    e.emitCompletion('build-1', 'nonce-abc', { allowed: true, riskGrade: 'L1' } as never);
    assert.equal(stub.calls.length, 0);
  });

  test('FX301 emitCompletion — allowed=true emits dispatched with first 8 hex of nonce', () => {
    const stub = makeTransparencyStub();
    const e = new TransparencyEmitter(stub.transparency as never, { enableTransparency: true });
    e.emitCompletion('build-1', 'nonce-abcdefgh-tail', { allowed: true, riskGrade: 'L1' } as never);
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].kind, 'dispatched');
    assert.equal(stub.calls[0].args[0], 'build-1');
    const meta = stub.calls[0].args[1] as Record<string, unknown>;
    assert.equal(meta.promptHash, 'nonce-ab');
  });

  test('FX301 emitCompletion — allowed=false emits dispatchBlocked with reason + risk', () => {
    const stub = makeTransparencyStub();
    const e = new TransparencyEmitter(stub.transparency as never, { enableTransparency: true });
    e.emitCompletion('build-1', 'nonce-x', { allowed: false, riskGrade: 'L3', reason: 'policy denied' } as never);
    assert.equal(stub.calls[0].kind, 'blocked');
    const meta = stub.calls[0].args[1] as Record<string, unknown>;
    assert.equal(meta.blockedReason, 'policy denied');
    assert.equal(meta.riskGrade, 'L3');
  });

  test('FX301 emitCompletion — missing reason falls back to "Policy denied"', () => {
    const stub = makeTransparencyStub();
    const e = new TransparencyEmitter(stub.transparency as never, { enableTransparency: true });
    e.emitCompletion('build-1', 'nonce-x', { allowed: false, riskGrade: 'L2' } as never);
    const meta = stub.calls[0].args[1] as Record<string, unknown>;
    assert.equal(meta.blockedReason, 'Policy denied');
  });

  test('FX301 emitCompletion — undefined buildId falls back to nonce as eventId', () => {
    const stub = makeTransparencyStub();
    const e = new TransparencyEmitter(stub.transparency as never, { enableTransparency: true });
    e.emitCompletion(undefined, 'fallback-nonce', { allowed: true, riskGrade: 'L1' } as never);
    assert.equal(stub.calls[0].args[0], 'fallback-nonce');
  });
});

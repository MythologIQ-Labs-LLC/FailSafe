import { afterEach, describe, it } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IntentService } from '../../governance/IntentService';
import { SessionManager } from '../../governance/SessionManager';

const tempDirs: string[] = [];

function makeTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-intent-'));
  tempDirs.push(dir);
  return dir;
}

function createMockSessionManager(): SessionManager {
  const mock = Object.create(SessionManager.prototype) as SessionManager;
  (mock as unknown as Record<string, unknown>).setActiveIntent = async () => {};
  (mock as unknown as Record<string, unknown>).getActiveIntentId = () => null;
  return mock;
}

describe('IntentService (Phase 1 - B66/B67)', () => {
  afterEach(function () {
    this.timeout(10000);
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir && fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // Windows may hold brief locks on temp dirs; swallow cleanup errors
        }
      }
    }
  });

  it('rejects createIntent without planId in enforce mode (B66)', async () => {
    const workspace = makeTempWorkspace();
    const service = new IntentService(workspace, createMockSessionManager());
    service.setGovernanceModeGetter(() => 'enforce');

    await assert.rejects(
      () => service.createIntent({
        type: 'feature',
        purpose: 'Test intent',
        scope: { files: [], modules: [], riskGrade: 'L1' },
        metadata: { author: 'test', tags: [] },
      }),
      { message: 'Intent creation requires a planId in enforce mode.' },
    );
  });

  it('allows createIntent without planId in observe mode (B66)', async () => {
    const workspace = makeTempWorkspace();
    const service = new IntentService(workspace, createMockSessionManager());
    service.setGovernanceModeGetter(() => 'observe');

    const intent = await service.createIntent({
      type: 'feature',
      purpose: 'Test intent',
      scope: { files: [], modules: [], riskGrade: 'L1' },
      metadata: { author: 'test', tags: [] },
    });

    assert.ok(intent.id);
    assert.equal(intent.schemaVersion, 2);
  });

  it('allows createIntent without planId in assist mode (B66)', async () => {
    const workspace = makeTempWorkspace();
    const service = new IntentService(workspace, createMockSessionManager());
    service.setGovernanceModeGetter(() => 'assist');

    const intent = await service.createIntent({
      type: 'feature',
      purpose: 'Test intent',
      scope: { files: [], modules: [], riskGrade: 'L1' },
      metadata: { author: 'test', tags: [] },
    });

    assert.ok(intent.id);
  });

  it('allows createIntent with planId in enforce mode (B66)', async () => {
    const workspace = makeTempWorkspace();
    const service = new IntentService(workspace, createMockSessionManager());
    service.setGovernanceModeGetter(() => 'enforce');

    const intent = await service.createIntent({
      type: 'feature',
      purpose: 'Test intent',
      scope: { files: [], modules: [], riskGrade: 'L1' },
      planId: 'plan-v4.2.0',
      metadata: { author: 'test', tags: [] },
    });

    assert.equal(intent.planId, 'plan-v4.2.0');
  });

  // B340 (plan-b340 LD5): a caller-supplied boolean is not proof. In enforce mode a PASS, VETO or
  // SEALED is recorded only through FailSafe: Approve or Veto the Active Intent (a confirmed modal),
  // so updateStatus refuses all three, with or without the old auditVerified argument.
  it('refuses PASS through updateStatus in enforce mode, even with a caller-supplied boolean (B67 -> B340)', async () => {
    const workspace = makeTempWorkspace();
    const service = new IntentService(workspace, createMockSessionManager());
    service.setGovernanceModeGetter(() => 'enforce');

    await service.createIntent({
      type: 'feature',
      purpose: 'Test intent',
      scope: { files: [], modules: [], riskGrade: 'L1' },
      planId: 'plan-v4.2.0',
      metadata: { author: 'test', tags: [] },
    });

    await assert.rejects(() => service.updateStatus('PASS', 'test'), /Approve or Veto the Active Intent/);
    await assert.rejects(
      () => (service.updateStatus as unknown as (s: string, a: string, v: boolean) => Promise<void>)('PASS', 'judge', true),
      /Approve or Veto the Active Intent/,
    );
    await assert.rejects(() => service.updateStatus('VETO', 'judge'), /Approve or Veto the Active Intent/);
    await assert.rejects(() => service.updateStatus('SEALED', 'judge'), /Approve or Veto the Active Intent/);
    const active = await service.getActiveIntent();
    assert.equal(active?.status, 'PULSE');
  });

  it('still writes PASS through updateStatus in observe mode (enforcement never honours it)', async () => {
    const workspace = makeTempWorkspace();
    const service = new IntentService(workspace, createMockSessionManager());
    service.setGovernanceModeGetter(() => 'observe');

    await service.createIntent({
      type: 'feature',
      purpose: 'Test intent',
      scope: { files: [], modules: [], riskGrade: 'L1' },
      metadata: { author: 'test', tags: [] },
    });

    await service.updateStatus('PASS', 'judge');
    const active = await service.getActiveIntent();
    assert.equal(active?.status, 'PASS');
  });
});

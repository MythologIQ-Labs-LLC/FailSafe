// Functional tests for the 3 Axiom enforcers (FX291 + FX292 + FX293).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Axiom1Enforcer } from '../../governance/enforcement/Axiom1Enforcer';
import { Axiom2Enforcer } from '../../governance/enforcement/Axiom2Enforcer';
import { Axiom3Enforcer } from '../../governance/enforcement/Axiom3Enforcer';
import type { ProposedAction, Intent, IntentStatus } from '../../governance/types/IntentTypes';
import type { ActionContext } from '../../governance/enforcement/types';

function buildAction(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    type: 'file_write',
    targetPath: 'src/foo.ts',
    intentId: 'intent-1',
    proposedAt: '2026-05-07T00:00:00Z',
    proposedBy: 'test-actor',
    ...overrides,
  };
}

function buildIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    id: 'intent-1',
    type: 'feature',
    createdAt: '2026-05-07T00:00:00Z',
    purpose: 'test',
    scope: { files: ['src/foo.ts'], modules: [], riskGrade: 'L1' },
    status: 'PASS' as IntentStatus,
    metadata: { author: 'test', tags: [] },
    updatedAt: '2026-05-07T00:00:00Z',
    ...overrides,
  };
}

function ctx(action: ProposedAction, activeIntent: Intent | null, workspaceRoot = '/tmp'): ActionContext {
  return { action, activeIntent, workspaceRoot };
}

suite('Axiom1Enforcer (FX291)', () => {
  test('FX291 BLOCK when no active intent', () => {
    const e = new Axiom1Enforcer();
    const v = e.enforce(ctx(buildAction(), null));
    assert.equal(v.status, 'BLOCK');
    assert.equal(v.axiomViolated, 1);
    assert.match(v.violation, /No active Intent/);
  });

  test('FX291 BLOCK on drift (action.intentId !== activeIntent.id)', () => {
    const e = new Axiom1Enforcer();
    const v = e.enforce(ctx(buildAction({ intentId: 'wrong-id' }), buildIntent({ id: 'real-id' })));
    assert.equal(v.status, 'BLOCK');
    assert.equal(v.axiomViolated, 1);
    assert.match(v.violation, /DRIFT DETECTED/);
  });

  test('FX291 ALLOW when intent IDs match', () => {
    const e = new Axiom1Enforcer();
    const v = e.enforce(ctx(buildAction({ intentId: 'intent-1' }), buildIntent({ id: 'intent-1' })));
    assert.equal(v.status, 'ALLOW');
    assert.match(v.reason, /Axiom 1 satisfied/);
  });
});

suite('Axiom2Enforcer (FX292) — path scope validation', () => {
  let workspaceRoot: string;

  setup(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-axiom2-'));
  });

  teardown(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('FX292 isPathInScope — exact match returns true', () => {
    const e = new Axiom2Enforcer(workspaceRoot);
    fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'foo.ts'), '');
    assert.equal(e.isPathInScope('src/foo.ts', ['src/foo.ts']), true);
  });

  test('FX292 isPathInScope — file inside scope directory returns true', () => {
    const e = new Axiom2Enforcer(workspaceRoot);
    fs.mkdirSync(path.join(workspaceRoot, 'src', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'sub', 'nested.ts'), '');
    assert.equal(e.isPathInScope('src/sub/nested.ts', ['src']), true);
  });

  test('FX292 isPathInScope — file outside scope returns false', () => {
    const e = new Axiom2Enforcer(workspaceRoot);
    fs.mkdirSync(path.join(workspaceRoot, 'other'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'other', 'bar.ts'), '');
    assert.equal(e.isPathInScope('other/bar.ts', ['src']), false);
  });

  test('FX292 isPathInScope — path traversal "../" is rejected', () => {
    const e = new Axiom2Enforcer(workspaceRoot);
    assert.equal(e.isPathInScope('../escape.ts', ['src']), false);
    assert.equal(e.isPathInScope('src/../../escape.ts', ['src']), false);
  });

  test('FX292 isPathInScope — empty scope list rejects all paths', () => {
    const e = new Axiom2Enforcer(workspaceRoot);
    assert.equal(e.isPathInScope('src/foo.ts', []), false);
  });

  test('FX292 enforce — ALLOW when no active intent (Axiom 1 handles that)', () => {
    const e = new Axiom2Enforcer(workspaceRoot);
    const v = e.enforce(ctx(buildAction(), null, workspaceRoot));
    assert.equal(v.status, 'ALLOW');
  });

  test('FX292 enforce — BLOCK when path is outside scope', () => {
    const e = new Axiom2Enforcer(workspaceRoot);
    fs.mkdirSync(path.join(workspaceRoot, 'allowed'), { recursive: true });
    const v = e.enforce(ctx(
      buildAction({ targetPath: 'forbidden/secret.ts' }),
      buildIntent({ scope: { files: ['allowed'], modules: [], riskGrade: 'L1' } }),
      workspaceRoot,
    ));
    assert.equal(v.status, 'BLOCK');
    assert.equal(v.axiomViolated, 2);
    assert.match(v.violation, /outside Intent scope/);
  });

  test('FX292 enforce — ALLOW when path is in scope', () => {
    const e = new Axiom2Enforcer(workspaceRoot);
    fs.mkdirSync(path.join(workspaceRoot, 'allowed'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'allowed', 'ok.ts'), '');
    const v = e.enforce(ctx(
      buildAction({ targetPath: 'allowed/ok.ts' }),
      buildIntent({ scope: { files: ['allowed'], modules: [], riskGrade: 'L1' } }),
      workspaceRoot,
    ));
    assert.equal(v.status, 'ALLOW');
  });
});

suite('Axiom3Enforcer (FX293) — intent status validation', () => {
  test('FX293 ALLOW when no active intent (defer to Axiom 1)', () => {
    const e = new Axiom3Enforcer();
    const v = e.enforce(ctx(buildAction(), null));
    assert.equal(v.status, 'ALLOW');
  });

  test('FX293 BLOCK when intent status is PULSE (review pending)', () => {
    const e = new Axiom3Enforcer();
    const v = e.enforce(ctx(buildAction(), buildIntent({ status: 'PULSE' as IntentStatus })));
    assert.equal(v.status, 'BLOCK');
    assert.equal(v.axiomViolated, 3);
    assert.match(v.violation, /PULSE/);
  });

  test('FX293 BLOCK when intent status is VETO (rejected)', () => {
    const e = new Axiom3Enforcer();
    const v = e.enforce(ctx(buildAction(), buildIntent({ status: 'VETO' as IntentStatus })));
    assert.equal(v.status, 'BLOCK');
    assert.match(v.violation, /VETO/);
  });

  test('FX293 BLOCK when intent status is SEALED (locked)', () => {
    const e = new Axiom3Enforcer();
    const v = e.enforce(ctx(buildAction(), buildIntent({ status: 'SEALED' as IntentStatus })));
    assert.equal(v.status, 'BLOCK');
    assert.match(v.violation, /SEALED/);
    assert.match(v.remediation, /new Intent/);
  });

  test('FX293 ALLOW when intent status is PASS', () => {
    const e = new Axiom3Enforcer();
    const v = e.enforce(ctx(buildAction(), buildIntent({ status: 'PASS' as IntentStatus })));
    assert.equal(v.status, 'ALLOW');
    assert.match(v.reason, /Axiom 3 satisfied/);
  });

  test('FX293 ESCALATE when intent status is unknown', () => {
    const e = new Axiom3Enforcer();
    const v = e.enforce(ctx(buildAction(), buildIntent({ status: 'WEIRD_NEW_STATUS' as IntentStatus })));
    assert.equal(v.status, 'ESCALATE');
    assert.match(String((v as { reason: string }).reason), /Unknown status/);
  });
});

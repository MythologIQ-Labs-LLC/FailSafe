// Functional tests for WorkspaceIntegrity (FX306), PermissionScopeManager (FX310), RBACManager (FX311).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceIntegrity } from '../../governance/WorkspaceIntegrity';
import { PermissionScopeManager } from '../../governance/PermissionScopeManager';
import { RBACManager } from '../../governance/RBACManager';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

suite('WorkspaceIntegrity (FX306)', () => {
  let dir: string;
  setup(() => { dir = tmpDir('wi-'); });
  teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('FX306 verify — empty workspace fails all four checks', () => {
    const w = new WorkspaceIntegrity(dir);
    const r = w.verify();
    assert.equal(r.allPassed, false);
    assert.equal(r.checks.length, 4);
    assert.ok(r.checks.every(c => !c.passed));
  });

  test('FX306 verify — fully provisioned workspace passes all', () => {
    fs.mkdirSync(path.join(dir, '.failsafe', 'manifest'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.failsafe', 'ledger.db'), '');
    fs.writeFileSync(path.join(dir, '.gitignore'), '.failsafe\n');
    const w = new WorkspaceIntegrity(dir);
    const r = w.verify();
    assert.equal(r.allPassed, true);
  });

  test('FX306 verify — gitignore present but missing .failsafe entry → fails gitignore check only', () => {
    fs.mkdirSync(path.join(dir, '.failsafe', 'manifest'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.failsafe', 'ledger.db'), '');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
    const w = new WorkspaceIntegrity(dir);
    const r = w.verify();
    assert.equal(r.allPassed, false);
    const gitignore = r.checks.find(c => c.name === 'gitignore')!;
    assert.equal(gitignore.passed, false);
  });

  test('FX306 verify — timestamp is ISO format', () => {
    const w = new WorkspaceIntegrity(dir);
    const r = w.verify();
    assert.match(r.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

suite('PermissionScopeManager (FX310)', () => {
  test('FX310 check — unknown scope returns false', () => {
    const m = new PermissionScopeManager(null);
    assert.equal(m.check('skill', 'scope'), false);
  });

  test('FX310 grant + check — granted scope returns true', () => {
    const m = new PermissionScopeManager(null);
    m.grant('skill:scope');
    assert.equal(m.check('skill', 'scope'), true);
  });

  test('FX310 deny — denied scope returns false (but is known)', () => {
    const m = new PermissionScopeManager(null);
    m.deny('skill:scope');
    assert.equal(m.check('skill', 'scope'), false);
    assert.equal(m.isKnownScope('skill:scope'), true);
  });

  test('FX310 revoke — revoked scope is removed (no longer known)', () => {
    const m = new PermissionScopeManager(null);
    m.grant('skill:scope');
    m.revoke('skill:scope');
    assert.equal(m.check('skill', 'scope'), false);
    assert.equal(m.isKnownScope('skill:scope'), false);
  });

  test('FX310 getAllRequestedScopes — returns id + active + grantedAt for all entries', () => {
    const m = new PermissionScopeManager(null);
    m.grant('a:1');
    m.deny('b:2');
    const all = m.getAllRequestedScopes();
    assert.equal(all.length, 2);
    const a = all.find(x => x.id === 'a:1')!;
    const b = all.find(x => x.id === 'b:2')!;
    assert.equal(a.active, true);
    assert.equal(b.active, false);
    assert.match(a.grantedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('FX310 audit — ledgerManager.appendEntry called on grant/deny/revoke', () => {
    const calls: any[] = [];
    const ledger: any = { appendEntry: (e: any) => { calls.push(e); } };
    const m = new PermissionScopeManager(ledger);
    m.grant('a:1');
    m.deny('b:2');
    m.revoke('a:1');
    assert.equal(calls.length, 3);
    assert.equal(calls[0].payload.action, 'GRANT');
    assert.equal(calls[1].payload.action, 'DENY');
    assert.equal(calls[2].payload.action, 'REVOKE');
    assert.equal(calls[0].payload.result, true);
    assert.equal(calls[1].payload.result, false);
  });
});

suite('RBACManager (FX311)', () => {
  test('FX311 hasPermission — unknown agent → false', () => {
    const r = new RBACManager();
    assert.equal(r.hasPermission('did:test:unknown', 'read'), false);
  });

  test('FX311 assign + getRole — admin role retrievable', () => {
    const r = new RBACManager();
    r.assign('did:test:alice', 'admin');
    assert.equal(r.getRole('did:test:alice'), 'admin');
  });

  test('FX311 hasPermission — admin has all 5 permissions', () => {
    const r = new RBACManager();
    r.assign('did:test:alice', 'admin');
    assert.equal(r.hasPermission('did:test:alice', 'read'), true);
    assert.equal(r.hasPermission('did:test:alice', 'write'), true);
    assert.equal(r.hasPermission('did:test:alice', 'approve'), true);
    assert.equal(r.hasPermission('did:test:alice', 'configure'), true);
    assert.equal(r.hasPermission('did:test:alice', 'export'), true);
  });

  test('FX311 hasPermission — developer has read+write only', () => {
    const r = new RBACManager();
    r.assign('did:test:bob', 'developer');
    assert.equal(r.hasPermission('did:test:bob', 'read'), true);
    assert.equal(r.hasPermission('did:test:bob', 'write'), true);
    assert.equal(r.hasPermission('did:test:bob', 'approve'), false);
    assert.equal(r.hasPermission('did:test:bob', 'configure'), false);
    assert.equal(r.hasPermission('did:test:bob', 'export'), false);
  });

  test('FX311 hasPermission — viewer has read only', () => {
    const r = new RBACManager();
    r.assign('did:test:carol', 'viewer');
    assert.equal(r.hasPermission('did:test:carol', 'read'), true);
    assert.equal(r.hasPermission('did:test:carol', 'write'), false);
  });

  test('FX311 assign — re-assigning same agent overrides role', () => {
    const r = new RBACManager();
    r.assign('did:test:dave', 'viewer');
    assert.equal(r.getRole('did:test:dave'), 'viewer');
    r.assign('did:test:dave', 'admin');
    assert.equal(r.getRole('did:test:dave'), 'admin');
    assert.equal(r.hasPermission('did:test:dave', 'export'), true);
  });

  test('FX311 getAllAssignments — returns all assigned agents', () => {
    const r = new RBACManager();
    r.assign('did:test:alice', 'admin');
    r.assign('did:test:bob', 'developer');
    const all = r.getAllAssignments();
    assert.equal(all.length, 2);
    const alice = all.find(a => a.agentDid === 'did:test:alice')!;
    assert.equal(alice.role, 'admin');
    assert.match(alice.assignedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

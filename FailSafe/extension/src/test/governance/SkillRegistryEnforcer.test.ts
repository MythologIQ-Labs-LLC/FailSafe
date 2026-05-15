// Functional tests for SkillRegistryEnforcer (FX309).

import { strict as assert } from 'assert';
import { SkillRegistryEnforcer } from '../../governance/SkillRegistryEnforcer';
import { PermissionScopeManager } from '../../governance/PermissionScopeManager';

suite('SkillRegistryEnforcer (FX309)', () => {
  test('FX309 enforce — unpinned skill is rejected', () => {
    const pm = new PermissionScopeManager(null);
    const e = new SkillRegistryEnforcer(pm);
    const r = e.enforce({ name: 'skill-x', version: '1.0', scopes: ['read'], pinned: false });
    assert.equal(r.allowed, false);
    assert.match(r.reason, /not version-pinned/);
  });

  test('FX309 enforce — pinned skill with no scopes is allowed', () => {
    const pm = new PermissionScopeManager(null);
    const e = new SkillRegistryEnforcer(pm);
    const r = e.enforce({ name: 'skill-y', version: '1.0', scopes: [], pinned: true });
    assert.equal(r.allowed, true);
    assert.match(r.reason, /All checks passed/);
  });

  test('FX309 enforce — pinned skill with all scopes granted is allowed', () => {
    const pm = new PermissionScopeManager(null);
    pm.grant('skill-z:read');
    pm.grant('skill-z:write');
    const e = new SkillRegistryEnforcer(pm);
    const r = e.enforce({ name: 'skill-z', version: '1.0', scopes: ['read', 'write'], pinned: true });
    assert.equal(r.allowed, true);
  });

  test('FX309 enforce — pinned skill with denied scope is rejected', () => {
    const pm = new PermissionScopeManager(null);
    pm.deny('skill-z:write');
    const e = new SkillRegistryEnforcer(pm);
    const r = e.enforce({ name: 'skill-z', version: '1.0', scopes: ['write'], pinned: true });
    assert.equal(r.allowed, false);
    assert.match(r.reason, /skill-z:write.*not granted/);
  });

  test('FX309 enforce — pinned skill with ungranted scope is rejected', () => {
    const pm = new PermissionScopeManager(null);
    pm.grant('skill-z:read');
    const e = new SkillRegistryEnforcer(pm);
    const r = e.enforce({ name: 'skill-z', version: '1.0', scopes: ['read', 'write'], pinned: true });
    assert.equal(r.allowed, false);
    assert.match(r.reason, /skill-z:write.*not granted/);
  });

  test('FX309 redactSensitiveScopes — replaces password/secret/key/token with [REDACTED]', () => {
    const e = new SkillRegistryEnforcer(new PermissionScopeManager(null));
    const m = e.redactSensitiveScopes({
      name: 'x', version: '1.0', pinned: true,
      scopes: ['read', 'access:password', 'data:secret-store', 'auth:api-key', 'session:token-mgmt', 'unrelated'],
    });
    assert.deepEqual(m.scopes, ['read', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', 'unrelated']);
  });

  test('FX309 redactSensitiveScopes — case-insensitive (Password/Secret etc.)', () => {
    const e = new SkillRegistryEnforcer(new PermissionScopeManager(null));
    const m = e.redactSensitiveScopes({
      name: 'x', version: '1.0', pinned: true,
      scopes: ['User-Password', 'API-TOKEN'],
    });
    assert.deepEqual(m.scopes, ['[REDACTED]', '[REDACTED]']);
  });

  test('FX309 redactSensitiveScopes — preserves other manifest fields', () => {
    const e = new SkillRegistryEnforcer(new PermissionScopeManager(null));
    const original = { name: 'x', version: '1.2.3', pinned: true, scopes: ['read'] };
    const m = e.redactSensitiveScopes(original);
    assert.equal(m.name, 'x');
    assert.equal(m.version, '1.2.3');
    assert.equal(m.pinned, true);
  });
});

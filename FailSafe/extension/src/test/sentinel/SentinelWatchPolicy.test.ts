// Phase 60 Section 4 Razor — functional tests for SentinelWatchPolicy.
// Asserts watch/ignore classification, governance-path predicate, and
// priority assignment for the extracted helper.

import { strict as assert } from 'assert';
import { SentinelWatchPolicy } from '../../sentinel/SentinelWatchPolicy';

suite('SentinelWatchPolicy (Phase 60)', () => {
    let policy: SentinelWatchPolicy;

    setup(() => {
        policy = new SentinelWatchPolicy();
    });

    test('shouldWatch — .ts file on change is watched', () => {
        assert.equal(policy.shouldWatch('src/app.ts', 'FILE_MODIFIED'), true);
    });

    test('shouldWatch — .js file on create is watched', () => {
        assert.equal(policy.shouldWatch('src/bundle.js', 'FILE_CREATED'), true);
    });

    test('shouldWatch — .md file on change is NOT watched (non-code)', () => {
        assert.equal(policy.shouldWatch('docs/README.md', 'FILE_MODIFIED'), false);
    });

    test('shouldWatch — .md file on DELETE is still watched (deletion bypass)', () => {
        assert.equal(policy.shouldWatch('docs/README.md', 'FILE_DELETED'), true);
    });

    test('shouldWatch — .json file on change is NOT watched (non-code)', () => {
        assert.equal(policy.shouldWatch('package.json', 'FILE_MODIFIED'), false);
    });

    test('shouldWatch — .json file on DELETE is watched (deletion bypass)', () => {
        assert.equal(policy.shouldWatch('package.json', 'FILE_DELETED'), true);
    });

    test('shouldWatch — .yaml file on change is NOT watched (non-code)', () => {
        assert.equal(policy.shouldWatch('.github/workflows/ci.yaml', 'FILE_MODIFIED'), false);
    });

    test('shouldWatch — .yaml file on DELETE is watched (deletion bypass)', () => {
        assert.equal(policy.shouldWatch('.github/workflows/ci.yaml', 'FILE_DELETED'), true);
    });

    test('shouldWatch — governance .failsafe/** path is suppressed even for .ts', () => {
        assert.equal(
            policy.shouldWatch('.failsafe/governance/plan.ts', 'FILE_MODIFIED'),
            false
        );
    });

    test('shouldWatch — governance .failsafe/** path is suppressed even on delete', () => {
        assert.equal(
            policy.shouldWatch('.failsafe/governance/plan.ts', 'FILE_DELETED'),
            false
        );
    });

    test('shouldWatch — governance workspace-config.json is suppressed', () => {
        assert.equal(
            policy.shouldWatch('project/.failsafe/workspace-config.json', 'FILE_MODIFIED'),
            false
        );
    });

    test('shouldWatch — Windows-style backslash governance path is suppressed', () => {
        assert.equal(
            policy.shouldWatch('C:\\repo\\.failsafe\\plans\\x.ts', 'FILE_MODIFIED'),
            false
        );
    });

    test('isGovernancePath — true for .failsafe/foo', () => {
        assert.equal(policy.isGovernancePath('proj/.failsafe/x.json'), true);
    });

    test('isGovernancePath — true for root-relative .failsafe/foo', () => {
        assert.equal(policy.isGovernancePath('.failsafe/governance/plan.md'), true);
    });

    test('isGovernancePath — false for sibling path that happens to share prefix', () => {
        assert.equal(policy.isGovernancePath('src/failsafe/module.ts'), false);
    });

    test('isGovernancePath — false for empty string', () => {
        assert.equal(policy.isGovernancePath(''), false);
    });

    test('determinePriority — auth file is critical', () => {
        assert.equal(policy.determinePriority('src/auth/login.ts'), 'critical');
    });

    test('determinePriority — password helper is critical', () => {
        assert.equal(policy.determinePriority('src/utils/password-hash.ts'), 'critical');
    });

    test('determinePriority — crypto module is critical', () => {
        assert.equal(policy.determinePriority('lib/crypto/aes.ts'), 'critical');
    });

    test('determinePriority — secret store is critical', () => {
        assert.equal(policy.determinePriority('infra/secret-loader.ts'), 'critical');
    });

    test('determinePriority — api route is high', () => {
        assert.equal(policy.determinePriority('src/api/users.ts'), 'high');
    });

    test('determinePriority — service file is high', () => {
        assert.equal(policy.determinePriority('src/service/payments.ts'), 'high');
    });

    test('determinePriority — controller is high', () => {
        assert.equal(policy.determinePriority('src/controller/account.ts'), 'high');
    });

    test('determinePriority — test file is low', () => {
        assert.equal(policy.determinePriority('src/test/account.test.ts'), 'low');
    });

    test('determinePriority — spec file is low', () => {
        assert.equal(policy.determinePriority('src/feature.spec.ts'), 'low');
    });

    test('determinePriority — plain module is normal', () => {
        assert.equal(policy.determinePriority('src/utils/format.ts'), 'normal');
    });

    test('determinePriority — auth+test path stays critical (security wins)', () => {
        assert.equal(policy.determinePriority('src/auth/login.test.ts'), 'critical');
    });

    test('getCodeExtensions — includes the canonical TS/JS family', () => {
        const exts = policy.getCodeExtensions();
        assert.ok(exts.includes('.ts'));
        assert.ok(exts.includes('.js'));
        assert.ok(exts.includes('.tsx'));
        assert.ok(exts.includes('.jsx'));
    });

    test('getCodeExtensions — returns a fresh array (defensive copy)', () => {
        const a = policy.getCodeExtensions();
        const b = policy.getCodeExtensions();
        assert.notEqual(a, b);
        a.push('.bogus');
        assert.equal(policy.getCodeExtensions().includes('.bogus'), false);
    });

    test('getIgnorePatterns — includes .failsafe governance dir', () => {
        const patterns = policy.getIgnorePatterns();
        assert.ok(patterns.includes('**/.failsafe/**'));
    });

    test('getIgnorePatterns — includes node_modules and build outputs', () => {
        const patterns = policy.getIgnorePatterns();
        assert.ok(patterns.includes('**/node_modules/**'));
        assert.ok(patterns.includes('**/dist/**'));
        assert.ok(patterns.includes('**/build/**'));
        assert.ok(patterns.includes('**/out/**'));
    });

    test('getIgnorePatterns — returns a fresh array (defensive copy)', () => {
        const a = policy.getIgnorePatterns();
        const b = policy.getIgnorePatterns();
        assert.notEqual(a, b);
    });
});

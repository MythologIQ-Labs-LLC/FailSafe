// Phase 60 Section 4 Razor — functional tests for SentinelWatchPolicy.
// Phase 60 §2 Track C — governance file visibility (B193).
// Asserts watch/ignore classification, governance whitelist, and
// priority assignment for the extracted helper.

import { strict as assert } from 'assert';
import { SentinelWatchPolicy } from '../../sentinel/SentinelWatchPolicy';

suite('SentinelWatchPolicy (Phase 60)', () => {
    let policy: SentinelWatchPolicy;
    setup(() => { policy = new SentinelWatchPolicy(); });

    test('shouldWatch — code extensions watched on change/create', () => {
        assert.equal(policy.shouldWatch('src/app.ts', 'FILE_MODIFIED'), true);
        assert.equal(policy.shouldWatch('src/bundle.js', 'FILE_CREATED'), true);
    });

    test('shouldWatch — .md is watched (governance doc format)', () => {
        assert.equal(policy.shouldWatch('docs/README.md', 'FILE_MODIFIED'), true);
    });

    test('shouldWatch — .md delete bypass still works', () => {
        assert.equal(policy.shouldWatch('docs/README.md', 'FILE_DELETED'), true);
    });

    test('shouldWatch — .json/.yaml/.yml watched as governance doc formats', () => {
        assert.equal(policy.shouldWatch('package.json', 'FILE_MODIFIED'), true);
        assert.equal(policy.shouldWatch('.github/workflows/ci.yaml', 'FILE_MODIFIED'), true);
        assert.equal(policy.shouldWatch('config/app.yml', 'FILE_MODIFIED'), true);
    });

    test('shouldWatch — non-whitelisted .failsafe/** .ts is suppressed', () => {
        assert.equal(
            policy.shouldWatch('.failsafe/governance/plan.ts', 'FILE_MODIFIED'),
            false
        );
    });

    test('shouldWatch — deletions always pass even on non-whitelisted .failsafe paths', () => {
        assert.equal(
            policy.shouldWatch('.failsafe/governance/plan.ts', 'FILE_DELETED'),
            true
        );
    });

    test('shouldWatch — whitelisted workspace-config.json IS watched (relative + nested)', () => {
        assert.equal(
            policy.shouldWatch('.failsafe/workspace-config.json', 'FILE_MODIFIED'),
            true
        );
        assert.equal(
            policy.shouldWatch('project/.failsafe/workspace-config.json', 'FILE_MODIFIED'),
            true
        );
    });

    test('shouldWatch — whitelisted V5_1_0_SCOPE.md IS watched', () => {
        assert.equal(
            policy.shouldWatch('.failsafe/governance/V5_1_0_SCOPE.md', 'FILE_MODIFIED'),
            true
        );
    });

    test('shouldWatch — whitelisted AUDIT_REPORT.md IS watched', () => {
        assert.equal(
            policy.shouldWatch('.failsafe/governance/AUDIT_REPORT.md', 'FILE_MODIFIED'),
            true
        );
    });

    test('shouldWatch — whitelisted META_LEDGER.md IS watched', () => {
        assert.equal(
            policy.shouldWatch('.failsafe/governance/META_LEDGER.md', 'FILE_MODIFIED'),
            true
        );
    });

    test('shouldWatch — plans/ subdir is watched via whitelist prefix', () => {
        assert.equal(
            policy.shouldWatch('.failsafe/governance/plans/plan-x.md', 'FILE_MODIFIED'),
            true
        );
    });

    test('shouldWatch — plans.yaml is watched via whitelist', () => {
        assert.equal(
            policy.shouldWatch('.failsafe/governance/plans.yaml', 'FILE_MODIFIED'),
            true
        );
    });

    test('shouldWatch — transient .failsafe/runtime|cache paths are NOT watched', () => {
        assert.equal(policy.shouldWatch('.failsafe/runtime/scratch.md', 'FILE_MODIFIED'), false);
        assert.equal(policy.shouldWatch('.failsafe/cache/x.json', 'FILE_MODIFIED'), false);
    });

    test('shouldWatch — Windows backslash paths normalized correctly', () => {
        assert.equal(
            policy.shouldWatch('C:\\repo\\.failsafe\\plans\\x.ts', 'FILE_MODIFIED'),
            false
        );
        assert.equal(
            policy.shouldWatch('C:\\repo\\.failsafe\\workspace-config.json', 'FILE_MODIFIED'),
            true
        );
    });

    test('shouldWatch — unknown extension .xyz is NOT watched', () => {
        assert.equal(policy.shouldWatch('weird/file.xyz', 'FILE_MODIFIED'), false);
    });

    test('shouldWatch — node_modules .md returns true (chokidar filters upstream)', () => {
        // chokidar ignore patterns filter node_modules at the watcher
        // boundary; the policy itself does not repeat that filter.
        assert.equal(policy.shouldWatch('node_modules/foo/bar.md', 'FILE_MODIFIED'), true);
    });

    test('isGovernancePath — recognises .failsafe/** and rejects look-alikes', () => {
        assert.equal(policy.isGovernancePath('proj/.failsafe/x.json'), true);
        assert.equal(policy.isGovernancePath('.failsafe/governance/plan.md'), true);
        assert.equal(policy.isGovernancePath('src/failsafe/module.ts'), false);
        assert.equal(policy.isGovernancePath(''), false);
    });

    test('isWatchedGovernancePath — true for whitelisted, false otherwise', () => {
        assert.equal(policy.isWatchedGovernancePath('.failsafe/workspace-config.json'), true);
        assert.equal(policy.isWatchedGovernancePath('.failsafe/runtime/scratch.json'), false);
        assert.equal(policy.isWatchedGovernancePath('src/app.ts'), false);
    });

    test('determinePriority — security-sensitive paths are critical', () => {
        assert.equal(policy.determinePriority('src/auth/login.ts'), 'critical');
        assert.equal(policy.determinePriority('src/utils/password-hash.ts'), 'critical');
        assert.equal(policy.determinePriority('lib/crypto/aes.ts'), 'critical');
        assert.equal(policy.determinePriority('infra/secret-loader.ts'), 'critical');
    });

    test('determinePriority — api/service/controller are high', () => {
        assert.equal(policy.determinePriority('src/api/users.ts'), 'high');
        assert.equal(policy.determinePriority('src/service/payments.ts'), 'high');
        assert.equal(policy.determinePriority('src/controller/account.ts'), 'high');
    });

    test('determinePriority — governance plans and workspace-config are high', () => {
        assert.equal(
            policy.determinePriority('.failsafe/governance/plans/plan-x.md'),
            'high'
        );
        assert.equal(
            policy.determinePriority('proj/.failsafe/workspace-config.json'),
            'high'
        );
    });

    test('determinePriority — test/spec files are low', () => {
        assert.equal(policy.determinePriority('src/test/account.test.ts'), 'low');
        assert.equal(policy.determinePriority('src/feature.spec.ts'), 'low');
    });

    test('determinePriority — plain module is normal', () => {
        assert.equal(policy.determinePriority('src/utils/format.ts'), 'normal');
    });

    test('determinePriority — security wins over test surface', () => {
        assert.equal(policy.determinePriority('src/auth/login.test.ts'), 'critical');
    });

    test('getCodeExtensions — canonical TS/JS family + defensive copy', () => {
        const exts = policy.getCodeExtensions();
        assert.ok(exts.includes('.ts'));
        assert.ok(exts.includes('.js'));
        assert.ok(exts.includes('.tsx'));
        assert.ok(exts.includes('.jsx'));
        const a = policy.getCodeExtensions();
        const b = policy.getCodeExtensions();
        assert.notEqual(a, b);
        a.push('.bogus');
        assert.equal(policy.getCodeExtensions().includes('.bogus'), false);
    });

    test('getWatchedExtensions — governance doc formats + code extensions', () => {
        const exts = policy.getWatchedExtensions();
        assert.ok(exts.includes('.md'));
        assert.ok(exts.includes('.yaml'));
        assert.ok(exts.includes('.json'));
        assert.ok(exts.includes('.ts'));
        assert.ok(exts.includes('.py'));
    });

    test('getIgnorePatterns — transient .failsafe subtrees ignored, root NOT blanketed', () => {
        const patterns = policy.getIgnorePatterns();
        assert.ok(patterns.includes('**/.failsafe/runtime/**'));
        assert.ok(patterns.includes('**/.failsafe/cache/**'));
        assert.equal(patterns.includes('**/.failsafe/**'), false);
    });

    test('getIgnorePatterns — node_modules and build outputs + defensive copy', () => {
        const patterns = policy.getIgnorePatterns();
        assert.ok(patterns.includes('**/node_modules/**'));
        assert.ok(patterns.includes('**/dist/**'));
        assert.ok(patterns.includes('**/build/**'));
        assert.ok(patterns.includes('**/out/**'));
        const a = policy.getIgnorePatterns();
        const b = policy.getIgnorePatterns();
        assert.notEqual(a, b);
    });
});

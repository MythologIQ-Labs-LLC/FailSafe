import { strict as assert } from 'assert';
import {
  concreteVersion,
  parseDirectDeps,
  diffDeps,
  parseOverrideEntries,
  evaluateBumps,
  type Bump,
} from '../../../qorlogic/substrate/dependency-admission-core';

/**
 * B-SUBSTRATE-2 — dependency-admission cooling-period lint (pure core).
 * Deterministic: publish times + now are injected, no registry/network.
 */

suite('dependency-admission-core (B-SUBSTRATE-2)', () => {
  test('concreteVersion: exact / caret / tilde / >= / v-prefix / prerelease', () => {
    assert.equal(concreteVersion('1.2.3'), '1.2.3');
    assert.equal(concreteVersion('^1.2.3'), '1.2.3');
    assert.equal(concreteVersion('~1.2.3'), '1.2.3');
    assert.equal(concreteVersion('>=1.2.3'), '1.2.3');
    assert.equal(concreteVersion('v1.2.3'), '1.2.3');
    assert.equal(concreteVersion('1.2.3-beta.1'), '1.2.3-beta.1');
  });

  test('concreteVersion: rejects ranges, tags, and non-registry protocols', () => {
    assert.equal(concreteVersion('*'), null);
    assert.equal(concreteVersion('latest'), null);
    assert.equal(concreteVersion('>=1.2.0 <2.0.0'), null);
    assert.equal(concreteVersion('1.x || 2.x'), null);
    assert.equal(concreteVersion('workspace:*'), null);
    assert.equal(concreteVersion('file:../local'), null);
    assert.equal(concreteVersion('github:user/repo'), null);
    assert.equal(concreteVersion('npm:alias@1.2.3'), null);
  });

  test('parseDirectDeps: merges dep blocks, skips non-concrete, dedups, sorts', () => {
    const json = JSON.stringify({
      dependencies: { beta: '^2.0.0', alpha: '1.0.0', tagged: 'latest' },
      devDependencies: { gamma: '~3.1.0', alpha: '9.9.9' /* dup: first-wins */ },
      optionalDependencies: { delta: '>=4.0.0' },
    });
    const deps = parseDirectDeps(json);
    assert.deepEqual(
      deps.map((d) => `${d.name}@${d.version}`),
      ['alpha@1.0.0', 'beta@2.0.0', 'delta@4.0.0', 'gamma@3.1.0'],
    );
  });

  test('diffDeps: detects newly-added and version-changed, ignores unchanged', () => {
    const base = [{ name: 'a', version: '1.0.0' }, { name: 'b', version: '2.0.0' }];
    const current = [
      { name: 'a', version: '1.0.0' }, // unchanged
      { name: 'b', version: '2.1.0' }, // changed
      { name: 'c', version: '3.0.0' }, // added
    ];
    const bumps = diffDeps(current, base);
    assert.deepEqual(bumps, [
      { name: 'b', oldVersion: '2.0.0', newVersion: '2.1.0' },
      { name: 'c', oldVersion: null, newVersion: '3.0.0' },
    ]);
  });

  test('parseOverrideEntries: extracts name@version keys from ledger', () => {
    const ledger = [
      '### Entry #410',
      'Some prose.',
      '**Dependency admission override**: left-pad@1.3.0; upload_age_days=2; justification=hotfix needed',
      '### Entry #411',
      '**Dependency admission override**: @scope/pkg@9.9.9; upload_age_days=0; justification=internal',
    ].join('\n');
    const keys = parseOverrideEntries(ledger);
    assert.ok(keys.has('left-pad@1.3.0'));
    assert.ok(keys.has('@scope/pkg@9.9.9'));
    assert.equal(keys.size, 2);
  });

  test('evaluateBumps: aged-out is clean, fresh is violation', () => {
    const now = new Date('2026-06-02T00:00:00Z');
    const bumps: Bump[] = [
      { name: 'old', oldVersion: null, newVersion: '1.0.0' },
      { name: 'fresh', oldVersion: null, newVersion: '2.0.0' },
    ];
    const times: Record<string, Date> = {
      'old@1.0.0': new Date('2026-05-01T00:00:00Z'), // 32 days
      'fresh@2.0.0': new Date('2026-05-30T00:00:00Z'), // 3 days
    };
    const res = evaluateBumps(bumps, new Set(), (n, v) => times[`${n}@${v}`] ?? null, now, 14);
    assert.equal(res.reports.find((r) => r.name === 'old')?.status, 'clean');
    assert.equal(res.reports.find((r) => r.name === 'fresh')?.status, 'violation');
    assert.deepEqual(res.violations.map((v) => v.name), ['fresh']);
  });

  test('evaluateBumps: threshold boundary is inclusive (age==threshold is clean)', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    const bumps: Bump[] = [{ name: 'edge', oldVersion: null, newVersion: '1.0.0' }];
    const times = { 'edge@1.0.0': new Date('2026-06-01T00:00:00Z') }; // exactly 14 days
    const res = evaluateBumps(bumps, new Set(), (n, v) => times[`${n}@${v}` as 'edge@1.0.0'], now, 14);
    assert.equal(res.reports[0].status, 'clean');
    assert.equal(res.violations.length, 0);
  });

  test('evaluateBumps: override suppresses a within-window violation', () => {
    const now = new Date('2026-06-02T00:00:00Z');
    const bumps: Bump[] = [{ name: 'fresh', oldVersion: null, newVersion: '2.0.0' }];
    const times = { 'fresh@2.0.0': new Date('2026-05-30T00:00:00Z') };
    const res = evaluateBumps(
      bumps,
      new Set(['fresh@2.0.0']),
      (n, v) => times[`${n}@${v}` as 'fresh@2.0.0'],
      now,
      14,
    );
    assert.equal(res.reports[0].status, 'override');
    assert.equal(res.violations.length, 0);
  });

  test('evaluateBumps: null publish time becomes unknown + registryError (not a violation)', () => {
    const now = new Date('2026-06-02T00:00:00Z');
    const bumps: Bump[] = [{ name: 'ghost', oldVersion: null, newVersion: '0.0.1' }];
    const res = evaluateBumps(bumps, new Set(), () => null, now, 14);
    assert.equal(res.reports[0].status, 'unknown');
    assert.equal(res.reports[0].ageDays, null);
    assert.deepEqual(res.registryErrors, ['ghost@0.0.1']);
    assert.equal(res.violations.length, 0);
  });
});

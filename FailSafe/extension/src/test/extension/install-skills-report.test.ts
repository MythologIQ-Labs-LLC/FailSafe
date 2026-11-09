import { strict as assert } from 'assert';
import {
  runInstallStep,
  aggregateReport,
  type QorLogicInstallInvocation,
} from '../../extension/installSkillsReport';

suite('runInstallStep', () => {
  test('returns success invocation when fn resolves', async () => {
    const inv = await runInstallStep({ phase: 'pip-install' }, async () => ({
      command: 'python -m pip install ...',
    }));
    assert.equal(inv.phase, 'pip-install');
    assert.equal(inv.status, 'success');
    assert.equal(inv.command, 'python -m pip install ...');
    assert.ok(inv.startedAt);
    assert.ok(inv.completedAt);
  });

  test('returns error invocation when fn rejects, no rethrow', async () => {
    const inv = await runInstallStep({ phase: 'pip-install' }, async () => {
      throw new Error('pip-failed');
    });
    assert.equal(inv.status, 'error');
    assert.equal(inv.error, 'pip-failed');
    assert.ok(inv.startedAt);
    assert.ok(inv.completedAt);
  });

  test('preserves base fields like host and scope', async () => {
    const inv = await runInstallStep(
      { phase: 'qorlogic-install', host: 'claude', scope: 'repo' },
      async () => ({ destination: '.claude/skills/', installedCount: 17 }),
    );
    assert.equal(inv.host, 'claude');
    assert.equal(inv.scope, 'repo');
    assert.equal(inv.destination, '.claude/skills/');
    assert.equal(inv.installedCount, 17);
  });
});

suite('aggregateReport', () => {
  function inv(phase: QorLogicInstallInvocation['phase'], overrides: Partial<QorLogicInstallInvocation> = {}): QorLogicInstallInvocation {
    return { phase, status: 'success', startedAt: '2026-05-05T00:00:00Z', completedAt: '2026-05-05T00:00:01Z', ...overrides };
  }

  test('reduces invocations into report shape', () => {
    const report = aggregateReport([
      inv('python-probe'),
      inv('pip-install'),
      inv('qorlogic-install', { host: 'claude', destination: '.claude/skills/', installedCount: 17 }),
      inv('provenance', { summary: { hostsVerified: 1, totalFiles: 17,
        destinations: ['.claude/skills/'], verifiedHosts: [{ host: 'claude', fileCount: 17 }] } }),
      inv('refresh'),
    ]);
    assert.equal(report.ok, true);
    assert.equal(report.invocations.length, 5);
    assert.equal(report.totalInstalled, 17);
    assert.deepEqual(report.destinations, ['.claude/skills/']);
    assert.equal(report.failures.length, 0);
  });

  test('extracts failures from qorlogic-install errors only', () => {
    const report = aggregateReport([
      inv('python-probe'),
      inv('pip-install'),
      inv('qorlogic-install', { host: 'claude', status: 'error', error: 'host-failed' }),
      inv('qorlogic-install', { host: 'codex', destination: '.codex/skills/', installedCount: 17 }),
      inv('provenance', { summary: { hostsVerified: 1, totalFiles: 17,
        destinations: ['.codex/skills/'], verifiedHosts: [{ host: 'codex', fileCount: 17 }] } }),
    ]);
    assert.equal(report.ok, false);
    assert.equal(report.failures.length, 1);
    assert.deepEqual(report.failures[0], { host: 'claude', error: 'host-failed' });
    assert.equal(report.totalInstalled, 17);
  });

  test('deduplicates and sorts destinations', () => {
    const report = aggregateReport([
      inv('qorlogic-install', { host: 'claude', destination: '.claude/skills/', installedCount: 5 }),
      inv('qorlogic-install', { host: 'codex', destination: '.codex/skills/', installedCount: 5 }),
      inv('provenance', { summary: { hostsVerified: 2, totalFiles: 10,
        destinations: ['.claude/skills/', '.codex/agents/'],
        verifiedHosts: [{ host: 'claude', fileCount: 5 }, { host: 'codex', fileCount: 5 }] } }),
    ]);
    assert.deepEqual(report.destinations, ['.claude/skills/', '.codex/agents/']);
  });

  test('JSON.stringify round-trips without throwing', () => {
    const report = aggregateReport([
      inv('python-probe', { interpreter: '/usr/bin/python3' }),
      inv('pip-install', { command: 'python -m pip install ...', version: '0.31.1' }),
    ]);
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.invocations.length, 2);
    assert.equal(parsed.invocations[0].interpreter, '/usr/bin/python3');
  });

  test('completed read-only phases remain successful; running is not a final PASS', () => {
    const completed = aggregateReport([inv('python-probe'), inv('pip-install')]);
    assert.equal(completed.ok, true);
    const inProgress = aggregateReport([
      inv('python-probe'), inv('pip-install', { status: 'running' }),
    ]);
    assert.equal(inProgress.ok, false);
  });

  test('ok=false when any invocation has status error', () => {
    const report = aggregateReport([
      inv('python-probe', { status: 'error', error: 'no-python' }),
    ]);
    assert.equal(report.ok, false);
  });
  test('#463: process exit zero cannot become delivery success with no receipt', () => {
    const report = aggregateReport([
      inv('qorlogic-install', { host: 'claude', installedCount: 2 }),
      inv('provenance', { summary: { hostsVerified: 0, totalFiles: 0,
        destinations: [], verifiedHosts: [] } }),
    ]);
    assert.equal(report.ok, false);
    assert.equal(report.totalInstalled, 0);
    assert.deepEqual(report.destinations, []);
  });

  test('#463: unrelated verified host cannot authorize the requested host', () => {
    const report = aggregateReport([
      inv('qorlogic-install', { host: 'claude', installedCount: 17 }),
      inv('provenance', { summary: { hostsVerified: 1, totalFiles: 17,
        destinations: ['.codex/skills/'], verifiedHosts: [{ host: 'codex', fileCount: 17 }] } }),
    ]);
    assert.equal(report.ok, false);
    assert.equal(report.totalInstalled, 0);
    assert.deepEqual(report.destinations, []);
  });

  test('#463: unproven file count cannot be claimed by a successful host', () => {
    for (const fileCount of [0, 16, 18]) {
      const report = aggregateReport([
        inv('qorlogic-install', { host: 'claude', installedCount: 17 }),
        inv('provenance', { summary: { hostsVerified: 1, totalFiles: fileCount,
          destinations: ['.claude/skills/'], verifiedHosts: [{ host: 'claude', fileCount }] } }),
      ]);
      assert.equal(report.ok, false);
      assert.equal(report.totalInstalled, 0);
    }
  });

  test('#463: missing provenance cannot be replaced with host counts', () => {
    const report = aggregateReport([
      inv('qorlogic-install', { host: 'claude', installedCount: 17 }),
      inv('refresh'),
    ]);
    assert.equal(report.ok, false);
    assert.equal(report.totalInstalled, 0);
  });

});

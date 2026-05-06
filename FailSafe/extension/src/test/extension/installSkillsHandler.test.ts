import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { createInstallSkillsHandler, DEFAULT_OPTIONS } from '../../extension/installSkillsHandler';
import type {
  QorLogicSkillIngestor,
  QorLogicHost,
  QorLogicScope,
  HostInstallResult,
} from '../../qorlogic/QorLogicSkillIngestor';
import type {
  QorLogicInstallReport,
  QorLogicInstallInvocation,
} from '../../extension/installSkillsReport';

class FakeIngestor {
  public probeError: string | null = null;
  public pipError: string | null = null;
  public hostFailures = new Map<QorLogicHost, string>();
  public installCalls: Array<{ host: QorLogicHost; scope: QorLogicScope }> = [];

  async probePython() {
    return this.probeError
      ? { ok: false as const, error: this.probeError }
      : { ok: true as const, interpreter: '/usr/bin/python3', command: '/usr/bin/python3 -V' };
  }

  async ensurePackageInstalled() {
    return this.pipError
      ? { ok: false as const, error: this.pipError, stderrTail: 'mock-stderr' }
      : { ok: true as const, command: 'python -m pip install --upgrade qor-logic' };
  }

  async installHost(host: QorLogicHost, scope: QorLogicScope): Promise<HostInstallResult> {
    this.installCalls.push({ host, scope });
    const err = this.hostFailures.get(host);
    if (err) {
      return { ok: false, host, scope, error: err, command: `qorlogic install --host ${host}` };
    }
    return {
      ok: true, host, scope,
      command: `qorlogic install --host ${host}`,
      destination: `.${host}/skills/`,
      installedCount: 17,
    };
  }

  getWorkspaceRoot() { return '/tmp/workspace'; }
  async rescanWorkspace() { /* noop */ }
}

function asIngestor(fake: FakeIngestor): QorLogicSkillIngestor {
  return fake as unknown as QorLogicSkillIngestor;
}

function fakeContext(): vscode.ExtensionContext {
  // Tests for prompt-mode are in install-skills-options.test.ts. Here we
  // use defaults-mode so the QuickPick is bypassed; the context is irrelevant.
  return { workspaceState: { get: () => undefined, update: async () => {} } } as unknown as vscode.ExtensionContext;
}

suite('createInstallSkillsHandler', () => {
  test('full success: 5+N invocations in declared order with correct phases', async () => {
    const fake = new FakeIngestor();
    const handler = createInstallSkillsHandler(fakeContext(), asIngestor(fake), {}, 'defaults');

    const report = await handler() as QorLogicInstallReport;

    assert.notEqual(report, null);
    const phases = report.invocations.map((i) => `${i.phase}${i.host ? ':' + i.host : ''}`);
    assert.deepEqual(phases, [
      'python-probe',
      'pip-install',
      'qorlogic-install:claude',
      'qorlogic-install:codex',
      'provenance',
      'refresh',
    ]);
    assert.equal(report.ok, true);
    assert.equal(report.failures.length, 0);
    assert.deepEqual(fake.installCalls, [
      { host: 'claude', scope: 'repo' },
      { host: 'codex', scope: 'repo' },
    ]);
  });

  test('python-probe failure short-circuits all subsequent phases', async () => {
    const fake = new FakeIngestor();
    fake.probeError = 'no-python-found';
    const handler = createInstallSkillsHandler(fakeContext(), asIngestor(fake), {}, 'defaults');

    const report = await handler() as QorLogicInstallReport;

    const phases = report.invocations.map((i) => i.phase);
    assert.deepEqual(phases, ['python-probe']);
    assert.equal(report.invocations[0].status, 'error');
    assert.equal(report.ok, false);
    assert.equal(fake.installCalls.length, 0);
  });

  test('pip-install failure short-circuits qorlogic-install + provenance + refresh', async () => {
    const fake = new FakeIngestor();
    fake.pipError = 'pip-failed';
    const handler = createInstallSkillsHandler(fakeContext(), asIngestor(fake), {}, 'defaults');

    const report = await handler() as QorLogicInstallReport;

    const phases = report.invocations.map((i) => i.phase);
    assert.deepEqual(phases, ['python-probe', 'pip-install']);
    assert.equal(report.invocations[1].status, 'error');
    assert.equal(report.ok, false);
    assert.equal(fake.installCalls.length, 0);
  });

  test('one-host failure: siblings continue; provenance + refresh still emit; ok=false', async () => {
    const fake = new FakeIngestor();
    fake.hostFailures.set('codex', 'host-install-failed');
    const handler = createInstallSkillsHandler(fakeContext(), asIngestor(fake), {}, 'defaults');

    const report = await handler() as QorLogicInstallReport;

    const phases = report.invocations.map((i) => `${i.phase}${i.host ? ':' + i.host : ''}`);
    assert.deepEqual(phases, [
      'python-probe',
      'pip-install',
      'qorlogic-install:claude',
      'qorlogic-install:codex',
      'provenance',
      'refresh',
    ]);
    assert.equal(report.failures.length, 1);
    assert.equal(report.failures[0].host, 'codex');
    assert.equal(report.ok, false);
    assert.equal(report.totalInstalled, 17); // claude succeeded
    assert.equal(fake.installCalls.length, 2);
  });

  test('emits onProgress for each phase running + final transition', async () => {
    const fake = new FakeIngestor();
    const events: QorLogicInstallInvocation[] = [];
    const handler = createInstallSkillsHandler(
      fakeContext(),
      asIngestor(fake),
      { onProgress: (inv) => events.push(inv) },
      'defaults',
    );

    await handler();

    // Each phase emits 2 events (running + final). 6 phases * 2 = 12.
    assert.equal(events.length, 12);
    assert.equal(events[0].phase, 'python-probe');
    assert.equal(events[0].status, 'running');
    assert.equal(events[1].phase, 'python-probe');
    assert.equal(events[1].status, 'success');
  });

  test('DEFAULT_OPTIONS is [claude, codex] at repo scope', () => {
    assert.deepEqual(DEFAULT_OPTIONS, { hosts: ['claude', 'codex'], scope: 'repo' });
  });
});

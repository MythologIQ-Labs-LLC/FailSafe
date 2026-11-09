import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import * as vscode from 'vscode';
import { createInstallSkillsHandler, createScaffoldWithWebOptions, runProvenanceStep, DEFAULT_OPTIONS } from '../../extension/installSkillsHandler';
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

const fakeRoots = new Set<string>();
class FakeIngestor {
  private readonly root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-install-handler-'));
  constructor() { fakeRoots.add(this.root); }

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
      : { ok: true as const, command: 'qor-logic 0.176.1 verified and dependency-ready' };
  }

  async installHost(host: QorLogicHost, scope: QorLogicScope): Promise<HostInstallResult> {
    this.installCalls.push({ host, scope });
    const err = this.hostFailures.get(host);
    if (err) {
      return { ok: false, host, scope, error: err, command: `qorlogic install --host ${host}` };
    }
    // Native test fixture must create the same kind of hashed record as
    // the actual frozen CLI; a fake exit code is not provenance evidence.
    const base = path.join(this.root,
      host === 'kilo-code' ? '.kilo' : `.${host}`);
    const entries: Array<{ path: string; sha256: string }> = [];
    for (let i = 0; i < 17; i += 1) {
      const file = path.join(base, host === 'gemini' ? 'commands' : 'skills', `qor-${i}.md`);
      const bytes = Buffer.from(`# ${host} ${i}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
      entries.push({ path: file, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    fs.writeFileSync(path.join(base, '.qorlogic-installed.json'), JSON.stringify({ files: entries }));
    return {
      ok: true, host, scope,
      command: `qorlogic install --host ${host}`,
      destination: `.${host}/skills/`,
      installedCount: entries.length,
    };
  }

  getWorkspaceRoot() { return this.root; }
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
  teardown(() => {
    for (const root of fakeRoots) fs.rmSync(root, { recursive: true, force: true });
    fakeRoots.clear();
  });
  test('#463: Console selected-skill requests (including []) fail before Python and pip', async () => {
    for (const filter of [{ claude: ['qor-audit'] }, { claude: [] }]) {
      const fake = new FakeIngestor();
      let pythonCalls = 0;
      let pipCalls = 0;
      fake.probePython = async () => { pythonCalls++; throw Error('unexpected Python probe'); };
      fake.ensurePackageInstalled = async () => { pipCalls++; throw Error('unexpected pip install'); };
      const events: QorLogicInstallInvocation[] = [];
      const handler = createScaffoldWithWebOptions(
        asIngestor(fake), { onProgress: (event) => events.push(event) },
      );
      const report = await handler(['claude'], 'repo', filter, { operationId: 'test-op-463' });
      assert.equal(report.ok, false);
      assert.deepEqual(report.invocations.map((e) => e.phase), ['qorlogic-install']);
      assert.equal(report.invocations[0].status, 'error');
      assert.equal(report.invocations[0].host, 'claude');
      assert.match(report.invocations[0].error ?? '', /Selected-skill installation is unavailable/);
      assert.equal(report.invocations[0].operationId, 'test-op-463');
      assert.equal(pythonCalls, 0);
      assert.equal(pipCalls, 0);
      assert.equal(fake.installCalls.length, 0);
      assert.equal(events.length, 1);
    }
  });

  test('#463: global Console operation fails before Python, pip or host writes', async () => {
    const fake = new FakeIngestor();
    let pythonCalls = 0;
    let pipCalls = 0;
    fake.probePython = async () => { pythonCalls++; throw Error('unexpected global Python probe'); };
    fake.ensurePackageInstalled = async () => { pipCalls++; throw Error('unexpected global pip install'); };
    const events: QorLogicInstallInvocation[] = [];
    const run = createScaffoldWithWebOptions(asIngestor(fake), { onProgress: (e) => events.push(e) });
    const report = await run(['claude'], 'global', undefined, { operationId: 'scope-test' });
    assert.equal(report.ok, false);
    assert.equal(report.invocations.length, 1);
    assert.equal(report.invocations[0].phase, 'qorlogic-install');
    assert.equal(report.invocations[0].scope, 'global');
    assert.match(report.invocations[0].error ?? '', /Global-scope installation is unavailable/);
    assert.equal(report.invocations[0].operationId, 'scope-test');
    assert.equal(pythonCalls, 0);
    assert.equal(pipCalls, 0);
    assert.equal(fake.installCalls.length, 0);
    assert.equal(events.length, 1);
  });

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

suite('#463 Console provenance uses verified disk receipts', () => {
  test('tampered receipt bytes cannot count as installed skills', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-provenance-'));
    try {
      const base = path.join(root, '.claude');
      const file = path.join(base, 'skills', 'qor-audit', 'SKILL.md');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const bytes = Buffer.from('# valid skill');
      fs.writeFileSync(file, bytes);
      const record = path.join(base, '.qorlogic-installed.json');
      fs.writeFileSync(record, JSON.stringify({ files: [{
        path: file, sha256: createHash('sha256').update(bytes).digest('hex'),
      }] }));
      const valid = await runProvenanceStep(root);
      assert.equal(valid.status, 'success');
      assert.equal(valid.summary?.hostsVerified, 1);
      assert.equal(valid.summary?.totalFiles, 1);
      fs.writeFileSync(file, 'tampered');
      const tampered = await runProvenanceStep(root);
      assert.equal(tampered.summary?.hostsVerified, 0);
      assert.equal(tampered.summary?.totalFiles, 0);
      assert.deepEqual(tampered.summary?.destinations, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  PythonInterpreterResolver,
  type RunCommand,
  type ResolvedInterpreter,
} from '../../qorlogic/PythonInterpreterResolver';
import {
  type IQorLogicPackageInstaller,
  type InstallerRun,
  type InstallerRunResult,
  type OutputChannelLike,
  type QorLogicInstallResult,
} from '../../qorlogic/QorLogicPackageInstaller';
import {
  QorLogicSkillIngestor,
  type QorLogicHost,
} from '../../qorlogic/QorLogicSkillIngestor';

class FakeInstaller implements IQorLogicPackageInstaller {
  public installed = true;
  public installResult: QorLogicInstallResult = { ok: true, command: 'python -m pip install qor-logic' };
  public installCalls = 0;
  async isInstalled(): Promise<boolean> { return this.installed; }
  async install(): Promise<QorLogicInstallResult> {
    this.installCalls += 1;
    return this.installResult;
  }
  async version(): Promise<string | null> { return '0.31.1'; }
}

function fixedResolver(command = 'python', args: string[] = []): PythonInterpreterResolver {
  const config = { get: () => undefined };
  const run: RunCommand = async () => ({ stdout: 'Python 3.12.0\n', stderr: '', code: 0 });
  const resolver = new PythonInterpreterResolver(config, null, run);
  const cached: ResolvedInterpreter = {
    ok: true, command, args, version: '3.12.0', source: 'user-setting',
  };
  (resolver as unknown as { cached: ResolvedInterpreter }).cached = cached;
  return resolver;
}

interface RecordedRun {
  cmd: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs: number;
}

function makeRun(
  responder: (call: RecordedRun) => InstallerRunResult,
): { run: InstallerRun; calls: RecordedRun[] } {
  const calls: RecordedRun[] = [];
  const run: InstallerRun = async (cmd, args, options) => {
    const call = { cmd, args: [...args], cwd: options.cwd, env: options.env, timeoutMs: options.timeoutMs };
    calls.push(call);
    return responder(call);
  };
  return { run, calls };
}

function ok(stdout = ''): InstallerRunResult {
  return { stdout, stderr: '', code: 0, timedOut: false };
}
function fail(stderr = 'install failed'): InstallerRunResult {
  return { stdout: '', stderr, code: 1, timedOut: false };
}

const sinkChannel: OutputChannelLike = { appendLine: () => undefined };

let tmpDir: string;
function withTmpDir(): string {
  return tmpDir;
}

function ensureSkillDir(host: QorLogicHost, skillName: string, ws: string): string {
  const subdir = host === 'gemini' ? 'commands' : 'skills';
  const skillDir = path.join(ws, `.${host}`, subdir, skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Stub');
  return skillDir;
}

suite('QorLogicSkillIngestor: command dispatch', function () {
  this.timeout(10000);
  setup(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingestor-')); });
  teardown(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ } });

  test('invokes python -m qor.cli install --host claude --scope repo', async () => {
    const installer = new FakeInstaller();
    const resolver = fixedResolver('/opt/py/python');
    const { run, calls } = makeRun(() => ok());
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, withTmpDir(), run, async () => undefined, sinkChannel,
    );

    await ingestor.ingest({ hosts: ['claude'], scope: 'repo' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, '/opt/py/python');
    assert.deepEqual(calls[0].args, ['-m', 'qor.cli', 'install', '--host', 'claude', '--scope', 'repo']);
  });

  test('runs both hosts sequentially', async () => {
    const installer = new FakeInstaller();
    const resolver = fixedResolver();
    const { run, calls } = makeRun(() => ok());
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, withTmpDir(), run, async () => undefined, sinkChannel,
    );

    await ingestor.ingest({ hosts: ['claude', 'codex'], scope: 'repo' });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((c) => c.args[c.args.indexOf('--host') + 1]), ['claude', 'codex']);
  });

  test('per-host failure does not abort siblings', async () => {
    const installer = new FakeInstaller();
    const resolver = fixedResolver();
    const { run } = makeRun((call) => {
      if (call.args.includes('claude')) return fail('claude broke');
      return ok();
    });
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, withTmpDir(), run, async () => undefined, sinkChannel,
    );

    const result = await ingestor.ingest({ hosts: ['claude', 'codex'], scope: 'repo' });

    assert.deepEqual(result.installedHosts, ['codex']);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].host, 'claude');
    assert.match(result.failures[0].error, /claude broke/);
    assert.equal(result.ok, false);
  });

  test('passes QORLOGIC_PROJECT_DIR env and cwd=workspaceRoot', async () => {
    const installer = new FakeInstaller();
    const resolver = fixedResolver();
    const { run, calls } = makeRun(() => ok());
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, withTmpDir(), run, async () => undefined, sinkChannel,
    );

    await ingestor.ingest({ hosts: ['claude'], scope: 'repo' });

    assert.equal(calls[0].cwd, withTmpDir());
    assert.equal(calls[0].env?.QORLOGIC_PROJECT_DIR, withTmpDir());
  });

  test('honors scope=global', async () => {
    const installer = new FakeInstaller();
    const resolver = fixedResolver();
    const { run, calls } = makeRun(() => ok());
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, withTmpDir(), run, async () => undefined, sinkChannel,
    );

    await ingestor.ingest({ hosts: ['claude'], scope: 'global' });

    assert.equal(calls[0].args[calls[0].args.indexOf('--scope') + 1], 'global');
  });
});

suite('QorLogicSkillIngestor: provenance synthesis', function () {
  this.timeout(10000);
  setup(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingestor-')); });
  teardown(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ } });

  test('writes synthesized SOURCE.yml when missing in installed skill dir', async () => {
    const installer = new FakeInstaller();
    const resolver = fixedResolver();
    const ws = withTmpDir();
    ensureSkillDir('claude', 'qor-plan', ws);
    const { run } = makeRun(() => ok());
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, ws, run, async () => undefined, sinkChannel,
    );

    await ingestor.ingest({ hosts: ['claude'], scope: 'repo' });

    const sourcePath = path.join(ws, '.claude', 'skills', 'qor-plan', 'SOURCE.yml');
    assert.ok(fs.existsSync(sourcePath), 'SOURCE.yml should be created');
    const content = fs.readFileSync(sourcePath, 'utf8');
    assert.match(content, /source_name: qor-logic/);
    assert.match(content, /installed_by: failsafe-v5/);
    assert.match(content, /admission_state: admitted/);
    assert.match(content, /trust_tier: curated/);
  });

  test('does not overwrite existing SOURCE.yml', async () => {
    const installer = new FakeInstaller();
    const resolver = fixedResolver();
    const ws = withTmpDir();
    const skillDir = ensureSkillDir('claude', 'qor-audit', ws);
    const existing = 'source_name: user-edited\ncustom: value\n';
    fs.writeFileSync(path.join(skillDir, 'SOURCE.yml'), existing);
    const { run } = makeRun(() => ok());
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, ws, run, async () => undefined, sinkChannel,
    );

    await ingestor.ingest({ hosts: ['claude'], scope: 'repo' });

    const after = fs.readFileSync(path.join(skillDir, 'SOURCE.yml'), 'utf8');
    assert.equal(after, existing);
  });

  test('walks codex subdir under .codex/skills', async () => {
    const installer = new FakeInstaller();
    const resolver = fixedResolver();
    const ws = withTmpDir();
    ensureSkillDir('codex', 'qor-implement', ws);
    const { run } = makeRun(() => ok());
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, ws, run, async () => undefined, sinkChannel,
    );

    await ingestor.ingest({ hosts: ['codex'], scope: 'repo' });

    assert.ok(fs.existsSync(path.join(ws, '.codex', 'skills', 'qor-implement', 'SOURCE.yml')));
  });
});

suite('QorLogicSkillIngestor: rescan + prerequisites', function () {
  this.timeout(10000);
  setup(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingestor-')); });
  teardown(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ } });

  test('calls rescan exactly once after all hosts complete', async () => {
    const installer = new FakeInstaller();
    const resolver = fixedResolver();
    const { run } = makeRun(() => ok());
    let rescanCount = 0;
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, withTmpDir(), run,
      async () => { rescanCount += 1; },
      sinkChannel,
    );

    await ingestor.ingest({ hosts: ['claude', 'codex'], scope: 'repo' });

    assert.equal(rescanCount, 1);
  });

  test('rescan is called even when all hosts fail', async () => {
    const installer = new FakeInstaller();
    const resolver = fixedResolver();
    const { run } = makeRun(() => fail());
    let rescanCount = 0;
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, withTmpDir(), run,
      async () => { rescanCount += 1; },
      sinkChannel,
    );

    await ingestor.ingest({ hosts: ['claude'], scope: 'repo' });

    assert.equal(rescanCount, 1);
  });

  test('auto-installs qor-logic when not yet present', async () => {
    const installer = new FakeInstaller();
    installer.installed = false;
    const resolver = fixedResolver();
    const { run } = makeRun(() => ok());
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, withTmpDir(), run, async () => undefined, sinkChannel,
    );

    await ingestor.ingest({ hosts: ['claude'], scope: 'repo' });

    assert.equal(installer.installCalls, 1);
  });

  test('skips install when qor-logic already installed', async () => {
    const installer = new FakeInstaller();
    installer.installed = true;
    const resolver = fixedResolver();
    const { run } = makeRun(() => ok());
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, withTmpDir(), run, async () => undefined, sinkChannel,
    );

    await ingestor.ingest({ hosts: ['claude'], scope: 'repo' });

    assert.equal(installer.installCalls, 0);
  });

  test('aborts with no-python-found when resolver yields nothing', async () => {
    const installer = new FakeInstaller();
    const config = { get: () => undefined };
    const run: RunCommand = async () => ({ stdout: '', stderr: '', code: 127 });
    const resolver = new PythonInterpreterResolver(config, null, run);
    const { run: instRun, calls } = makeRun(() => ok());
    const ingestor = new QorLogicSkillIngestor(
      installer, resolver, withTmpDir(), instRun, async () => undefined, sinkChannel,
    );

    const result = await ingestor.ingest({ hosts: ['claude'], scope: 'repo' });

    assert.equal(result.ok, false);
    assert.equal(calls.length, 0, 'should not invoke qorlogic CLI without Python');
    assert.equal(result.failures[0].error, 'no-python-found');
  });
});

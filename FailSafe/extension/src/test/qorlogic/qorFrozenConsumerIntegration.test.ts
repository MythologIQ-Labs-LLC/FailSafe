import { strict as assert } from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { verifyHostInstallReceipt } from '../../qorlogic/qorHostReceiptVerify';
import { qualifyQorHostExit } from '../../qorlogic/qorHostInstallOutput';
import { hasVerifiedBootstrapHosts, summarizeBootstrapIngestion } from '../../extension/bootstrapSkillOutcome';
import { aggregateReport, type QorLogicInstallInvocation } from '../../extension/installSkillsReport';
import { checkFrozenQorPackage } from '../../qorlogic/qorPackageEnsure';
import { preflightFrozenDependencies } from '../../qorlogic/qorDependencyPreflight';
import type { IQorLogicPackageInstaller } from '../../qorlogic/QorLogicPackageInstaller';
import type { ResolvedInterpreter } from '../../qorlogic/PythonInterpreterResolver';

/** Integrated controls, not a substitute for installed-wheel/native VS Code acceptance. */
suite('#463 frozen Qor-logic integrated consumer assurance', () => {
  let root: string;
  setup(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-463-integrated-')); });
  teardown(() => { fs.rmSync(root, { recursive: true, force: true }); });
  const start = () => new Date().toISOString();

  function installFixture(host: 'claude' | 'codex'): string {
    const base = path.join(root, `.${host}`);
    const file = path.join(base, 'skills', 'qor-audit', 'SKILL.md');
    const content = Buffer.from(`# ${host} audit`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    fs.writeFileSync(path.join(base, '.qorlogic-installed.json'), JSON.stringify({ files: [
      { path: file, sha256: createHash('sha256').update(content).digest('hex') },
    ] }));
    return file;
  }

  function resultFor(host: 'claude' | 'codex', proofHost: 'claude' | 'codex', count = 1) {
    const invocations: QorLogicInstallInvocation[] = [
      { phase: 'qorlogic-install', host, scope: 'repo', status: 'success',
        installedCount: count, startedAt: start() },
      { phase: 'provenance', status: 'success', startedAt: start(), summary: {
        hostsVerified: 1, totalFiles: 1, destinations: [],
        verifiedHosts: [{ host: proofHost, fileCount: 1 }],
      } },
    ];
    return aggregateReport(invocations);
  }

  test('positive CLI confirmation and actual hashed host receipt permit exact report', () => {
    installFixture('claude');
    const confirmed = qualifyQorHostExit({ stdout: 'Installed 1 files to claude\n', stderr: '',
      code: 0, timedOut: false }, 'claude', { appendLine: () => undefined });
    assert.deepEqual(confirmed, { ok: true, installedCount: 1 });
    const receipt = verifyHostInstallReceipt(root, 'claude');
    assert.equal(receipt.ok, true);
    if (receipt.ok && confirmed.ok) assert.equal(receipt.status.fileCount, confirmed.installedCount);
    assert.equal(resultFor('claude', 'claude').ok, true);
  });

  test('old valid receipt does not turn a zero-exit, no-op CLI into new installation', () => {
    installFixture('claude');
    assert.equal(verifyHostInstallReceipt(root, 'claude').ok, true);
    assert.deepEqual(qualifyQorHostExit({ stdout: '', stderr: '', code: 0, timedOut: false },
      'claude', { appendLine: () => undefined }),
    { ok: false, error: 'install-confirmation-missing-or-invalid' });
  });

  test('unrelated host receipt and count mismatch never authorize claimed host', () => {
    installFixture('codex');
    assert.equal(verifyHostInstallReceipt(root, 'codex').ok, true);
    assert.equal(resultFor('claude', 'codex').ok, false);
    assert.equal(resultFor('claude', 'claude', 2).ok, false);
  });

  test('both hosts permit bootstrap skip; tampering either one invalidates it', () => {
    installFixture('claude');
    const codexFile = installFixture('codex');
    assert.equal(hasVerifiedBootstrapHosts(root), true);
    const success = summarizeBootstrapIngestion({ ok: true, installedHosts: ['claude', 'codex'],
      skillCount: 2, failures: [], hostStatuses: [] });
    assert.equal(success.status, 'performed');
    fs.writeFileSync(codexFile, 'tampered after install');
    assert.equal(hasVerifiedBootstrapHosts(root), false);
    assert.equal(verifyHostInstallReceipt(root, 'codex').ok, false);
  });

  test('partial bootstrap is failed, not performed', () => {
    const partial = summarizeBootstrapIngestion({ ok: false, installedHosts: ['claude'],
      skillCount: 1, failures: [{ host: 'codex', error: 'install-receipt-missing' }],
      hostStatuses: [] });
    assert.equal(partial.status, 'failed');
    assert.match(partial.detail ?? '', /Verified 1\/2/);
  });

  test('matching version with broken dependencies never counts as ready', async () => {
    let installs = 0;
    const fake = {
      verifyInstalledVersion: async () => ({ installed: '0.176.1', minimum: '0.31.1',
        meetsFloor: true, testedAgainst: '0.169.0', matchesTested: false }),
      verifyInstalledDependencies: async () => ({ ok: false as const,
        error: 'dependencies-unsatisfied' as const, details: 'missing PyYAML' }),
      install: async () => { installs++; return { ok: true, command: 'unexpected' }; },
    } as unknown as IQorLogicPackageInstaller;
    assert.deepEqual(await checkFrozenQorPackage(fake),
      { ok: false, error: 'dependencies-unsatisfied' });
    assert.equal(installs, 0);
  });

  test('offline preflight refuses missing dependencies without installing anything', async () => {
    const py: ResolvedInterpreter = { ok: true, command: 'python', args: [],
      version: '3.13.0', source: 'probe' };
    let calls = 0;
    const result = await preflightFrozenDependencies(py, '/verified/wheel.whl',
      async (_cmd, args) => {
        calls++;
        assert.ok(args.includes('--dry-run'));
        assert.ok(args.includes('--no-index'));
        assert.ok(!args.includes('--no-deps'));
        return { stdout: '', stderr: 'PyYAML not installed', code: 1, timedOut: false };
      }, 1000);
    assert.deepEqual(result, { ok: false, error: 'dependency-preflight-failed',
      details: 'PyYAML not installed' });
    assert.equal(calls, 1);
  });
});
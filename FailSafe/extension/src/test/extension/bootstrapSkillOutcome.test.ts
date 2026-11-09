import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { hasVerifiedBootstrapHosts, summarizeBootstrapIngestion } from '../../extension/bootstrapSkillOutcome';
import type { QorLogicIngestResult } from '../../qorlogic/QorLogicSkillIngestor';

suite('#463: bootstrap host receipt and partial outcome', () => {
  let root: string;
  setup(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-bootstrap-')); });
  teardown(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function installFixture(host: 'claude' | 'codex'): string {
    const base = path.join(root, `.${host}`);
    const file = path.join(base, 'skills', 'qor-audit', 'SKILL.md');
    const data = Buffer.from(`# verified ${host}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    fs.writeFileSync(path.join(base, '.qorlogic-installed.json'), JSON.stringify({ files: [
      { path: file, sha256: createHash('sha256').update(data).digest('hex') },
    ] }));
    return file;
  }

  const report = (ok: boolean, installedHosts: Array<'claude' | 'codex'>,
    failures: QorLogicIngestResult['failures'] = []): QorLogicIngestResult =>
    ({ ok, installedHosts, skillCount: installedHosts.length, failures, hostStatuses: [] });

  test('stale SOURCE.yml alone cannot skip package-backed skill ingestion', () => {
    const file = path.join(root, '.claude', 'skills', 'qor-audit', 'SOURCE.yml');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'source: fake');
    assert.equal(hasVerifiedBootstrapHosts(root), false);
  });

  test('only one host with valid receipt is not complete', () => {
    installFixture('claude');
    assert.equal(hasVerifiedBootstrapHosts(root), false);
  });

  test('both verified built-in hosts allow idempotent bootstrap skip', () => {
    installFixture('claude');
    installFixture('codex');
    assert.equal(hasVerifiedBootstrapHosts(root), true);
  });

  test('tampering one host after installation invalidates skip', () => {
    installFixture('claude');
    const file = installFixture('codex');
    assert.equal(hasVerifiedBootstrapHosts(root), true);
    fs.writeFileSync(file, 'changed');
    assert.equal(hasVerifiedBootstrapHosts(root), false);
  });

  test('partial install is a failure, even if one host succeeded', () => {
    const out = summarizeBootstrapIngestion(report(false, ['claude'],
      [{ host: 'codex', error: 'install-receipt-missing' }]));
    assert.equal(out.status, 'failed');
    assert.match(out.detail ?? '', /Verified 1\/2/);
    assert.match(out.detail ?? '', /codex: install-receipt-missing/);
  });

  test('a falsely positive result missing codex cannot be completed', () => {
    const out = summarizeBootstrapIngestion(report(true, ['claude']));
    assert.equal(out.status, 'failed');
    assert.match(out.detail ?? '', /codex: not installed/);
  });

  test('both successful verified hosts result in performed', () => {
    const out = summarizeBootstrapIngestion(report(true, ['claude', 'codex']));
    assert.equal(out.status, 'performed');
    assert.match(out.detail ?? '', /hosts: claude, codex/);
  });
});

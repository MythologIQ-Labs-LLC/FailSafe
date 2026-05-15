import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getHostInstallStatus,
  getQorLogicInstallStatus,
  readInstallRecord,
} from '../../qorlogic/qorLogicInstallRecord';

let tmpRoot: string;

function writeRecord(host: string, files: Array<{ path: string; sha256: string }>): void {
  const dir = path.join(tmpRoot, `.${host}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.qorlogic-installed.json'),
    JSON.stringify({ files }),
    'utf-8',
  );
}

suite('qorLogicInstallRecord: readInstallRecord', function () {
  this.timeout(5000);
  setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-record-')); });
  teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ } });

  test('returns null when record file is absent', () => {
    assert.equal(readInstallRecord(tmpRoot, 'claude'), null);
  });

  test('returns null when record file is malformed JSON', () => {
    fs.mkdirSync(path.join(tmpRoot, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, '.claude', '.qorlogic-installed.json'), 'not json', 'utf-8');
    assert.equal(readInstallRecord(tmpRoot, 'claude'), null);
  });

  test('returns null when record has no files array', () => {
    fs.mkdirSync(path.join(tmpRoot, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, '.claude', '.qorlogic-installed.json'), '{}', 'utf-8');
    assert.equal(readInstallRecord(tmpRoot, 'claude'), null);
  });

  test('parses valid record with multiple files', () => {
    writeRecord('claude', [
      { path: '/abs/.claude/skills/qor-audit/SKILL.md', sha256: 'a' },
      { path: '/abs/.claude/agents/agent-architect.md', sha256: 'b' },
    ]);
    const rec = readInstallRecord(tmpRoot, 'claude');
    assert.ok(rec);
    assert.equal(rec!.files.length, 2);
  });
});

suite('qorLogicInstallRecord: getHostInstallStatus', function () {
  this.timeout(5000);
  setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-record-')); });
  teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ } });

  test('reports installed=false when record absent', () => {
    const status = getHostInstallStatus(tmpRoot, 'claude');
    assert.equal(status.installed, false);
    assert.equal(status.fileCount, 0);
    assert.deepEqual(status.destinations, []);
  });

  test('reports installed=true with file count and dedup destinations', () => {
    writeRecord('claude', [
      { path: '/abs/.claude/skills/qor-audit/SKILL.md', sha256: 'a' },
      { path: '/abs/.claude/skills/qor-audit/references/x.md', sha256: 'b' },
      { path: '/abs/.claude/agents/agent-architect.md', sha256: 'c' },
      { path: '/abs/.claude/skills/log-decision.md', sha256: 'd' },
    ]);
    const status = getHostInstallStatus(tmpRoot, 'claude');
    assert.equal(status.installed, true);
    assert.equal(status.fileCount, 4);
    // Parent-dir destinations, deduped + sorted.
    assert.ok(status.destinations.some((d) => d.endsWith('/skills/')));
    assert.ok(status.destinations.some((d) => d.endsWith('/skills/qor-audit/')));
    assert.ok(status.destinations.some((d) => d.endsWith('/skills/qor-audit/references/')));
    assert.ok(status.destinations.some((d) => d.endsWith('/agents/')));
  });

  test('handles Windows-style backslash paths in record', () => {
    writeRecord('claude', [
      { path: 'C:\\ws\\.claude\\skills\\qor-audit\\SKILL.md', sha256: 'a' },
    ]);
    const status = getHostInstallStatus(tmpRoot, 'claude');
    assert.equal(status.installed, true);
    assert.ok(status.destinations[0].endsWith('/skills/qor-audit/'));
  });
});

suite('qorLogicInstallRecord: getQorLogicInstallStatus', function () {
  this.timeout(5000);
  setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-record-')); });
  teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ } });

  test('anyInstalled=false when no host has a record', () => {
    const status = getQorLogicInstallStatus(tmpRoot);
    assert.equal(status.anyInstalled, false);
    assert.equal(status.totalFiles, 0);
  });

  test('anyInstalled=true if any single host record exists', () => {
    writeRecord('codex', [{ path: '/x/.codex/skills/y.md', sha256: 'a' }]);
    const status = getQorLogicInstallStatus(tmpRoot);
    assert.equal(status.anyInstalled, true);
    assert.equal(status.totalFiles, 1);
  });

  test('aggregates totalFiles across hosts', () => {
    writeRecord('claude', [
      { path: '/x/.claude/skills/a.md', sha256: '1' },
      { path: '/x/.claude/skills/b.md', sha256: '2' },
    ]);
    writeRecord('codex', [{ path: '/x/.codex/skills/c.md', sha256: '3' }]);
    const status = getQorLogicInstallStatus(tmpRoot);
    assert.equal(status.totalFiles, 3);
    assert.equal(status.hosts.filter((h) => h.installed).length, 2);
  });

  test('reports per-host status for all known hosts', () => {
    const status = getQorLogicInstallStatus(tmpRoot);
    const names = status.hosts.map((h) => h.host).sort();
    assert.deepEqual(names, ['claude', 'codex', 'gemini', 'kilo-code']);
  });
});

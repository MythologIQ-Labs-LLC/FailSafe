import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getHostInstallStatus,
  getQorLogicInstallStatus,
  readInstallRecord,
} from '../../qorlogic/qorLogicInstallRecord';
import { HOST_INSTALL_LAYOUTS, type QorLogicHost } from '../../qorlogic/hostLayouts';

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

  // FX511 — B197 surfacing: version-floor status passes through to hub payload.
  test('FX511 — no versionStatus arg leaves installedVersion/meetsFloor undefined (legacy back-compat)', () => {
    const status = getQorLogicInstallStatus(tmpRoot);
    assert.equal(status.installedVersion, undefined);
    assert.equal(status.minimumVersion, undefined);
    assert.equal(status.meetsFloor, undefined);
  });

  test('FX511 — versionStatus with meetsFloor=false populates floor fields', () => {
    const status = getQorLogicInstallStatus(tmpRoot, {
      installed: '0.30.0',
      minimum: '0.31.1',
      meetsFloor: false,
    });
    assert.equal(status.installedVersion, '0.30.0');
    assert.equal(status.minimumVersion, '0.31.1');
    assert.equal(status.meetsFloor, false);
  });

  test('FX511 — versionStatus with meetsFloor=true populates floor fields', () => {
    const status = getQorLogicInstallStatus(tmpRoot, {
      installed: '0.31.5',
      minimum: '0.31.1',
      meetsFloor: true,
    });
    assert.equal(status.installedVersion, '0.31.5');
    assert.equal(status.meetsFloor, true);
  });
});

// --- FX575 (B-B199-4): cross-host install-record round-trip ----------------
// The existing `writeRecord` helper above hardcodes the base dir as `.${host}`,
// which is correct ONLY for claude/codex. The real host layouts diverge:
//   kilo-code → base `.kilo`   (NOT `.kilo-code`)
//   gemini    → base `.gemini`, installMap `{ "commands/": ".gemini/commands" }`
// Every pre-B-B199-4 test wrote records only for claude/codex, leaving the
// kilo-code and gemini install-record round-trips genuinely uncovered. These
// cases use a LAYOUT-CORRECT helper that sources paths from HOST_INSTALL_LAYOUTS
// (the canonical truth) so they exercise the real per-host divergence the live
// `qor-logic install` path depends on — the proportionate, deterministic
// substitute for an impractical live-`pip` cross-host E2E.

// Write a record at the host's CANONICAL recordPath (from HOST_INSTALL_LAYOUTS),
// not the layout-wrong `.${host}` shortcut.
function writeRecordForHost(
  host: QorLogicHost,
  files: Array<{ path: string; sha256: string }>,
): void {
  const layout = HOST_INSTALL_LAYOUTS[host];
  const recordFull = path.join(tmpRoot, layout.recordPath);
  fs.mkdirSync(path.dirname(recordFull), { recursive: true });
  fs.writeFileSync(recordFull, JSON.stringify({ files }), 'utf-8');
}

suite('qorLogicInstallRecord: FX575 cross-host round-trip (B-B199-4)', function () {
  this.timeout(5000);
  setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qor-xhost-')); });
  teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ } });

  test('FX575 — kilo-code layout: record at `.kilo` (NOT `.kilo-code`) is read', () => {
    // Files placed directly under skills/ and agents/ so the derived
    // parent-dir destinations are `.../skills/` and `.../agents/`.
    writeRecordForHost('kilo-code', [
      { path: '/abs/.kilo/skills/qor-audit.md', sha256: 'a' },
      { path: '/abs/.kilo/agents/agent-architect.md', sha256: 'b' },
    ]);
    // The canonical record file lives under `.kilo`.
    assert.ok(
      fs.existsSync(path.join(tmpRoot, '.kilo', '.qorlogic-installed.json')),
      'record written under .kilo',
    );
    // The layout-wrong `.kilo-code` path must NOT exist — regression-guards the
    // bug the old `.${host}` helper masked.
    assert.equal(
      fs.existsSync(path.join(tmpRoot, '.kilo-code')),
      false,
      'no `.kilo-code` directory — base dir is `.kilo`',
    );
    const status = getHostInstallStatus(tmpRoot, 'kilo-code');
    assert.equal(status.installed, true);
    assert.equal(status.fileCount, 2);
    assert.ok(status.destinations.some((d) => d.endsWith('/skills/')));
    assert.ok(status.destinations.some((d) => d.endsWith('/agents/')));
  });

  test('FX575 — kilo-code: a record at the wrong `.kilo-code` path is NOT picked up', () => {
    // Write to the WRONG base dir the buggy `.${host}` helper would have used.
    const wrongDir = path.join(tmpRoot, '.kilo-code');
    fs.mkdirSync(wrongDir, { recursive: true });
    fs.writeFileSync(
      path.join(wrongDir, '.qorlogic-installed.json'),
      JSON.stringify({ files: [{ path: '/x/.kilo-code/skills/y.md', sha256: 'a' }] }),
      'utf-8',
    );
    // getHostInstallStatus reads `.kilo` per HOST_INSTALL_LAYOUTS → not installed.
    const status = getHostInstallStatus(tmpRoot, 'kilo-code');
    assert.equal(status.installed, false);
    assert.equal(status.fileCount, 0);
  });

  test('FX575 — gemini layout: record at `.gemini` with `commands/` destinations', () => {
    writeRecordForHost('gemini', [
      { path: '/abs/.gemini/commands/qor-audit.md', sha256: 'a' },
      { path: '/abs/.gemini/commands/qor-plan.md', sha256: 'b' },
      { path: '/abs/.gemini/commands/nested/qor-impl.md', sha256: 'c' },
    ]);
    assert.ok(
      fs.existsSync(path.join(tmpRoot, '.gemini', '.qorlogic-installed.json')),
      'record written under .gemini',
    );
    const status = getHostInstallStatus(tmpRoot, 'gemini');
    assert.equal(status.installed, true);
    assert.equal(status.fileCount, 3);
    // gemini uses `commands/` — NOT `skills/`+`agents/`.
    assert.ok(
      status.destinations.some((d) => d.endsWith('/commands/')),
      'gemini destinations use commands/',
    );
    assert.equal(
      status.destinations.some((d) => d.endsWith('/skills/') || d.endsWith('/agents/')),
      false,
      'gemini has no skills/ or agents/ destinations',
    );
  });

  test('FX575 — getQorLogicInstallStatus aggregates all 4 hosts incl. kilo-code + gemini', () => {
    writeRecordForHost('claude', [{ path: '/x/.claude/skills/a.md', sha256: '1' }]);
    writeRecordForHost('codex', [{ path: '/x/.codex/skills/b.md', sha256: '2' }]);
    writeRecordForHost('kilo-code', [
      { path: '/x/.kilo/skills/c.md', sha256: '3' },
      { path: '/x/.kilo/agents/d.md', sha256: '4' },
    ]);
    writeRecordForHost('gemini', [{ path: '/x/.gemini/commands/e.md', sha256: '5' }]);
    const status = getQorLogicInstallStatus(tmpRoot);
    assert.equal(status.anyInstalled, true);
    assert.equal(status.totalFiles, 5);
    assert.equal(status.hosts.filter((h) => h.installed).length, 4);
    // Every one of the 4 canonical hosts reports installed.
    const installedHosts = status.hosts.filter((h) => h.installed).map((h) => h.host).sort();
    assert.deepEqual(installedHosts, ['claude', 'codex', 'gemini', 'kilo-code']);
  });
});

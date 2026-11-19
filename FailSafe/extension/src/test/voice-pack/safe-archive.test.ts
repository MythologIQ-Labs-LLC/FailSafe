// #710: true-byte archive admission, without spawning an extractor or network calls.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { extractValidatedVoiceArchive, VOICE_ASSETS } from '../../voice-pack/safe-archive';
import { buildFixturePackEntries, buildFixtureTar, sha256OfBytes, TarFixtureEntry } from '../extension/voice-pack-install-test-helpers';

function fixture(run: (root: string, stage: string, archive: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-voice-safe-tar-'));
  const stage = path.join(root, 'staging');
  const archive = path.join(stage, 'download.tar.gz');
  fs.mkdirSync(stage);
  try { run(root, stage, archive); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function write(archive: string, entries: TarFixtureEntry[]): void {
  fs.writeFileSync(archive, buildFixtureTar(entries));
}
function deny(entries: TarFixtureEntry[], expression = /tar extract refused/): void {
  fixture((root, stage, archive) => {
    const outside = path.join(root, 'outside');
    write(archive, entries);
    assert.throws(() => extractValidatedVoiceArchive(archive, stage, '5.2.0'), expression);
    assert.equal(fs.existsSync(outside), false);
    assert.equal(fs.existsSync(path.join(stage, 'piper')), false);
    assert.equal(fs.existsSync(path.join(stage, 'voice-pack.manifest.json')), false);
  });
}
suite('voice pack strict archive reader #710', () => {
  test('admits exact six assets and verified manifest from real GNU/BSD tar producer', () => fixture((root, stage, archive) => {
    const source = path.join(root, 'source');
    fs.mkdirSync(source);
    for (const entry of buildFixturePackEntries()) {
      const file = path.join(source, entry.name);
      if (entry.type === '5') { fs.mkdirSync(file, { recursive: true }); continue; }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, entry.body ?? '');
    }
    // Pass only the archive basename: GNU tar treats Windows drive letters in
    // -f as remote-host syntax. This is also the production packager's route.
    const tar = spawnSync('tar', ['-czf', path.basename(archive), '-C', source,
      'piper', 'whisper', 'voice-pack.manifest.json'], {
      cwd: path.dirname(archive), encoding: 'utf8',
    });
    assert.equal(tar.status, 0, tar.stderr);
    const manifest = extractValidatedVoiceArchive(archive, stage, '5.2.0');
    assert.deepEqual([...manifest.expectedFiles].sort(), [...VOICE_ASSETS].sort());
    for (const rel of VOICE_ASSETS) {
      assert.equal(fs.readFileSync(path.join(stage, rel), 'utf8'), 'fixture:' + rel);
    }
  }));
  test('manual USTAR positive and exact hash checks', () => fixture((_root, stage, archive) => {
    write(archive, buildFixturePackEntries());
    const report = extractValidatedVoiceArchive(archive, stage, '5.2.0');
    assert.equal(report.version, '5.2.0');
    assert.equal(fs.readdirSync(stage).length, 4); // tarball, manifest, Piper, Whisper
  }));
  test('rejects traversal and absolute archive member paths before filesystem writes', () => {
    for (const name of ['../outside', '/tmp/outside', 'C:/outside', 'piper/../outside', 'piper\\outside']) {
      deny([...buildFixturePackEntries(), { name, body: 'untrusted' }]);
    }
  });
  test('rejects symlinks, hardlinks and unsupported tar types', () => {
    for (const type of ['1', '2', '3'] as const) {
      const entries = buildFixturePackEntries();
      const idx = entries.findIndex(item => item.name === VOICE_ASSETS[0]);
      entries[idx] = { ...entries[idx], type };
      deny(entries);
    }
  });
  test('rejects duplicate/colliding entries and unexpected executables', () => {
    const entries = buildFixturePackEntries();
    deny([...entries, { ...entries[2] }], /duplicate|excessive/);
    deny([...entries, { name: 'piper/unsafe.js', body: 'execute' }], /unexpected tar member/);
  });
  test('rejects incomplete archive and truncated compressed bytes', () => {
    const entries = buildFixturePackEntries();
    deny(entries.filter(item => item.name !== VOICE_ASSETS[0]), /missing required/);
    fixture((_root, stage, archive) => {
      const data = Buffer.from(buildFixtureTar(entries));
      fs.writeFileSync(archive, data.subarray(0, data.length - 7));
      assert.throws(() => extractValidatedVoiceArchive(archive, stage, '5.2.0'));
      assert.equal(fs.existsSync(path.join(stage, 'piper')), false);
    });
  });
  test('rejects empty inference asset even when the manifest hash matches', () => {
    const entries = buildFixturePackEntries();
    const target = VOICE_ASSETS[0];
    const idx = entries.findIndex(item => item.name === target);
    entries[idx] = { ...entries[idx], body: '' };
    const mi = entries.findIndex(item => item.name === 'voice-pack.manifest.json');
    const manifest = JSON.parse(String(entries[mi].body));
    manifest.sha256[target] = sha256OfBytes(Buffer.alloc(0));
    entries[mi] = { ...entries[mi], body: JSON.stringify(manifest) };
    deny(entries, /empty voice asset/);
  });

  test('rejects declared asset inflation before allocation or writing', () => {
    const entries = buildFixturePackEntries();
    const idx = entries.findIndex(item => item.name === VOICE_ASSETS[0]);
    entries[idx] = { ...entries[idx], declaredSize: 80 * 1024 * 1024 };
    deny(entries, /member size/);
  });
  test('rejects wrong version, bad hash and extra manifest keys', () => {
    const entries = buildFixturePackEntries();
    const index = entries.findIndex(item => item.name === 'voice-pack.manifest.json');
    const original = JSON.parse(String(entries[index].body));
    const edit = (change: (m: any) => void) => {
      const manifest = JSON.parse(JSON.stringify(original));
      change(manifest);
      const e = entries.map(item => ({ ...item }));
      e[index].body = JSON.stringify(manifest);
      return e;
    };
    deny(edit(m => { m.version = '6.0.13'; }), /schema\/version/);
    deny(edit(m => { m.sha256[VOICE_ASSETS[0]] = 'a'.repeat(64); }), /sha256 mismatch/);
    deny(edit(m => { m.sha256['extra.js'] = '0'.repeat(64); }), /file inventory mismatch/);
    deny(edit(m => { m.expectedFiles.push('../outside'); }), /file inventory mismatch/);
  });
  test('preexisting staging links cannot be overwritten', function () {
    if (process.platform === 'win32') this.skip();
    fixture((root, stage, archive) => {
      write(archive, buildFixturePackEntries());
      const outside = path.join(root, 'outside');
      fs.mkdirSync(outside);
      fs.symlinkSync(outside, path.join(stage, 'piper'), 'dir');
      assert.throws(() => extractValidatedVoiceArchive(archive, stage, '5.2.0'), /staging path already exists/);
      assert.deepEqual(fs.readdirSync(outside), []);
    });
  });
});

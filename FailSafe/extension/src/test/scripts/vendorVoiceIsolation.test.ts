// #707: isolated, pinned voice-vendor tooling; no live npm/network required.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as childProcess from 'child_process';

const extensionRoot = path.join(__dirname, '..', '..', '..');
const vendorTool = require(path.join(extensionRoot, 'scripts', 'vendor-voice.cjs'));

function temporary(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-707-voice-'));
  try { run(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

suite('voice vendor isolation #707', () => {
  test('core npm lock excludes native voice inference packages', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package-lock.json'), 'utf8'));
    assert.equal(pkg.devDependencies['piper-tts-web'], undefined);
    assert.equal(pkg.devDependencies['@xenova/transformers'], undefined);
    assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
    for (const entry of Object.keys(lock.packages)) {
      assert.equal(/(^|\/)onnxruntime-node$/.test(entry), false, entry);
      assert.equal(/(^|\/)piper-tts-web$/.test(entry), false, entry);
      assert.equal(entry.includes('@xenova/transformers'), false, entry);
    }
    assert.ok(pkg.optionalDependencies['better-sqlite3']);
  });

  test('pinned digest validates correct bytes and rejects changed bytes', () => {
    const bytes = Buffer.from('pinned original archive');
    const integrity = 'sha512-' + crypto.createHash('sha512').update(bytes).digest('base64');
    assert.doesNotThrow(() => vendorTool.assertPinnedDigest(bytes, integrity));
    assert.throws(() => vendorTool.assertPinnedDigest(Buffer.from('changed'), integrity), /mismatch/);
    assert.throws(() => vendorTool.assertPinnedDigest(bytes, 'sha256-not-supported'), /integrity/);
  });

  test('tar extracts approved member bytes without writing arbitrary paths', () => temporary(root => {
    const source = path.join(root, 'source');
    const asset = path.join(source, 'package', 'dist', 'piper-tts-web.js');
    fs.mkdirSync(path.dirname(asset), { recursive: true });
    fs.writeFileSync(asset, 'BROWSER-PIPER');
    const archive = path.join(root, 'source.tgz');
    const run = childProcess.spawnSync('tar', ['-czf', archive, '-C', source, 'package'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const outputs = vendorTool.extractApprovedArchiveMembers(archive, {
      'package/dist/piper-tts-web.js': 'piper/piper.min.js',
    });
    assert.equal(outputs.get('piper/piper.min.js').toString('utf8'), 'BROWSER-PIPER');
    assert.equal(fs.existsSync(path.join(root, 'piper')), false);
    assert.throws(() => vendorTool.extractApprovedArchiveMembers(archive, {
      '../escape': 'piper/piper.min.js',
    }), /invalid pinned/);
  }));

  test('write transaction preserves previous file on failed promotion', () => temporary(root => {
    const dir = path.join(root, 'vendor', 'piper');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'piper.min.js');
    fs.writeFileSync(target, 'OLD');
    const ops = {
      ...fs,
      renameSync(from: fs.PathLike, to: fs.PathLike) {
        if (String(from).includes('.new-')) throw new Error('injected promotion failure');
        fs.renameSync(from, to);
      },
    };
    assert.throws(
      () => vendorTool.commitOutputs(new Map([['piper/piper.min.js', Buffer.from('NEW')]]), path.join(root, 'vendor'), ops),
      /injected promotion failure/,
    );
    assert.equal(fs.readFileSync(target, 'utf8'), 'OLD');
  }));

  test('write transaction updates pinned browser assets successfully', () => temporary(root => {
    const outputs = new Map([['piper/piper.min.js', Buffer.from('NEW')]]);
    const warnings = vendorTool.commitOutputs(outputs, path.join(root, 'vendor'));
    assert.deepEqual(warnings, []);
    assert.equal(fs.readFileSync(path.join(root, 'vendor', 'piper', 'piper.min.js'), 'utf8'), 'NEW');
  }));
});

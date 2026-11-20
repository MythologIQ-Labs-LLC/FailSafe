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
      () => vendorTool.commitOutputs(new Map([['piper/piper.min.js', Buffer.from('NEW')]]), path.join(root, 'vendor'), ops, root),
      /injected promotion failure/,
    );
    assert.equal(fs.readFileSync(target, 'utf8'), 'OLD');
  }));

  test('partial staged write is removed, previous browser asset remains unchanged', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const dir = path.join(vendor, 'piper');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'piper.min.js');
    fs.writeFileSync(target, 'OLD');
    const ops = {
      ...fs,
      writeFileSync(file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, opts?: fs.WriteFileOptions) {
        if (String(file).includes('.new-')) {
          fs.writeFileSync(file, 'PARTIAL', { flag: 'wx' });
          throw new Error('simulated disk-full after partial staging');
        }
        fs.writeFileSync(file, data, opts);
      },
    };
    assert.throws(() => vendorTool.commitOutputs(
      new Map([['piper/piper.min.js', Buffer.from('NEW')]]), vendor, ops, root,
    ), /simulated disk-full/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'OLD');
    assert.deepEqual(fs.readdirSync(dir).filter(x => x.includes('.new-') || x.includes('.old-')), []);
  }));

  test('dangling vendor destination link refuses without staging or losing earlier assets', function () {
    if (process.platform === 'win32') this.skip(); // symlink privilege varies.
    temporary(root => {
      const vendor = path.join(root, 'vendor');
      const dir = path.join(vendor, 'piper');
      fs.mkdirSync(dir, { recursive: true });
      const prior = path.join(dir, 'piper_phonemize.wasm');
      fs.writeFileSync(prior, 'PRESERVE');
      const link = path.join(dir, 'piper.min.js');
      const outside = path.join(root, 'missing-external-asset');
      fs.symlinkSync(outside, link, 'file');
      assert.equal(fs.existsSync(link), false, 'the regression requires a dangling link');
      const outputs = new Map([
        ['piper/piper_phonemize.wasm', Buffer.from('REPLACEMENT')],
        ['piper/piper.min.js', Buffer.from('NEW')],
      ]);
      assert.throws(() => vendorTool.commitOutputs(outputs, vendor, fs, root),
        /unexpected vendor destination type/);
      assert.equal(fs.readFileSync(prior, 'utf8'), 'PRESERVE');
      assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
      assert.equal(fs.readlinkSync(link), outside);
      assert.equal(fs.existsSync(outside), false);
      assert.deepEqual(fs.readdirSync(dir).sort(),
        ['piper.min.js', 'piper_phonemize.wasm'].sort(), 'no staged files may remain');
    });
  });

  test('dangling backup collision injected after staging is never overwritten', function () {
    if (process.platform === 'win32') this.skip(); // symlink privilege varies.
    temporary(root => {
      const vendor = path.join(root, 'vendor');
      const dir = path.join(vendor, 'piper');
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, 'piper.min.js');
      fs.writeFileSync(target, 'PRESERVE');
      const outside = path.join(root, 'missing-backup-asset');
      let foreignBackup = '';
      const io = {
        ...fs,
        writeFileSync(file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView,
          opts?: fs.WriteFileOptions) {
          fs.writeFileSync(file, data, opts);
          if (String(file).includes('.new-')) {
            foreignBackup = String(file).replace('.new-', '.old-');
            fs.symlinkSync(outside, foreignBackup, 'file');
          }
        },
      };
      assert.throws(() => vendorTool.commitOutputs(
        new Map([['piper/piper.min.js', Buffer.from('NEW')]]), vendor, io, root,
      ), /voice vendor transaction collision/);
      assert.equal(fs.readFileSync(target, 'utf8'), 'PRESERVE');
      assert.ok(foreignBackup);
      assert.equal(fs.lstatSync(foreignBackup).isSymbolicLink(), true);
      assert.equal(fs.readlinkSync(foreignBackup), outside);
      assert.equal(fs.existsSync(outside), false);
      assert.deepEqual(fs.readdirSync(dir).filter(name => name.includes('.new-')), []);
    });
  });

  test('destination replaced with dangling link during staging is refused at promotion', function () {
    if (process.platform === 'win32') this.skip(); // symlink privilege varies.
    temporary(root => {
      const vendor = path.join(root, 'vendor');
      const dir = path.join(vendor, 'piper');
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, 'piper.min.js');
      fs.writeFileSync(target, 'ORIGINAL');
      const outside = path.join(root, 'missing-mutation');
      const io = {
        ...fs,
        writeFileSync(file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView,
          opts?: fs.WriteFileOptions) {
          fs.writeFileSync(file, data, opts);
          if (String(file).includes('.new-')) {
            fs.unlinkSync(target);
            fs.symlinkSync(outside, target, 'file');
          }
        },
      };
      assert.throws(() => vendorTool.commitOutputs(
        new Map([['piper/piper.min.js', Buffer.from('NEW')]]), vendor, io, root,
      ), /unexpected vendor destination type/);
      assert.equal(fs.lstatSync(target).isSymbolicLink(), true);
      assert.equal(fs.readlinkSync(target), outside);
      assert.equal(fs.existsSync(outside), false);
      assert.deepEqual(fs.readdirSync(dir).filter(name => name.includes('.new-')), []);
    });
  });

  test('same-size regular-file replacement during stage is rejected without clobbering new owner', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const dir = path.join(vendor, 'piper');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'piper.min.js');
    const displaced = path.join(root, 'original-displaced');
    fs.writeFileSync(target, 'ORIGINAL');
    let replaced = false;
    const io = {
      ...fs,
      writeFileSync(file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView,
        opts?: fs.WriteFileOptions) {
        fs.writeFileSync(file, data, opts);
        if (!replaced && String(file).includes('.new-')) {
          replaced = true;
          fs.renameSync(target, displaced);
          fs.writeFileSync(target, 'FOREIGN!');
        }
      },
    };
    assert.throws(() => vendorTool.commitOutputs(
      new Map([['piper/piper.min.js', Buffer.from('PINNED')]]), vendor, io, root,
    ), /voice vendor destination changed during promotion/);
    assert.equal(replaced, true, 'the replacement must happen after original preflight');
    assert.equal(fs.readFileSync(target, 'utf8'), 'FOREIGN!', 'foreign same-size regular file remains owned');
    assert.equal(fs.readFileSync(displaced, 'utf8'), 'ORIGINAL', 'original file was not destroyed');
    assert.deepEqual(fs.readdirSync(dir).filter(name => name.includes('.new-') || name.includes('.old-')), []);
  }));

  test('in-place modification after preflight is rejected and preserves changed bytes', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const dir = path.join(vendor, 'piper');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'piper.min.js');
    fs.writeFileSync(target, 'ORIGINAL');
    let modified = false;
    const io = {
      ...fs,
      writeFileSync(file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView,
        opts?: fs.WriteFileOptions) {
        fs.writeFileSync(file, data, opts);
        if (!modified && String(file).includes('.new-')) {
          modified = true;
          fs.appendFileSync(target, ':FOREIGN');
        }
      },
    };
    assert.throws(() => vendorTool.commitOutputs(
      new Map([['piper/piper.min.js', Buffer.from('PINNED')]]), vendor, io, root,
    ), /voice vendor destination changed during promotion/);
    assert.equal(modified, true);
    assert.equal(fs.readFileSync(target, 'utf8'), 'ORIGINAL:FOREIGN');
    assert.deepEqual(fs.readdirSync(dir).filter(name => name.includes('.new-') || name.includes('.old-')), []);
  }));

  test('staged asset byte tampering cannot be promoted even when it remains a normal file', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const dir = path.join(vendor, 'piper');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'piper.min.js');
    fs.writeFileSync(target, 'ORIGINAL');
    let tampered = false;
    const ops = {
      ...fs,
      writeFileSync(file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, opts?: fs.WriteFileOptions) {
        fs.writeFileSync(file, data, opts);
        if (!tampered && String(file).includes('.new-')) {
          tampered = true;
          fs.writeFileSync(file, 'POISON!', { flag: 'w' });
        }
      },
    };
    assert.throws(() => vendorTool.commitOutputs(
      new Map([['piper/piper.min.js', Buffer.from('PINNED!')]]), vendor, ops, root,
    ), /voice vendor staged asset content mismatch/);
    assert.equal(tampered, true, 'the staged asset must be rewritten during the transaction');
    assert.equal(fs.readFileSync(target, 'utf8'), 'ORIGINAL', 'installed asset is not overwritten');
    assert.deepEqual(fs.readdirSync(dir).filter(name => name.includes('.new-') || name.includes('.old-')), []);
  }));

  test('foreign pending inode substituted with identical bytes is refused and not deleted', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const dir = path.join(vendor, 'piper');
    fs.mkdirSync(dir, { recursive: true });
    const primary = path.join(dir, 'piper.min.js');
    const secondary = path.join(dir, 'piper_phonemize.wasm');
    fs.writeFileSync(primary, 'ORIGINAL');
    fs.writeFileSync(secondary, 'PREVIOUS');
    let firstPending = '';
    let injected = false;
    const ops = {
      ...fs,
      writeFileSync(file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, opts?: fs.WriteFileOptions) {
        fs.writeFileSync(file, data, opts);
        if (String(file).includes('piper.min.js.new-')) {
          firstPending = String(file);
        } else if (firstPending && String(file).includes('piper_phonemize.wasm.new-')) {
          const other = path.join(root, 'foreign-staged-content');
          fs.writeFileSync(other, 'PINNED!');
          fs.renameSync(other, firstPending); // Windows permits replacing an existing file only on supported hosts.
          injected = true;
        }
      },
    };
    assert.throws(() => vendorTool.commitOutputs(new Map([
      ['piper/piper.min.js', Buffer.from('PINNED!')],
      ['piper/piper_phonemize.wasm', Buffer.from('NEW-WASM')],
    ]), vendor, ops, root), /voice vendor staged file changed during promotion/);
    assert.equal(injected, true);
    assert.equal(fs.readFileSync(primary, 'utf8'), 'ORIGINAL');
    assert.equal(fs.readFileSync(secondary, 'utf8'), 'PREVIOUS');
    assert.equal(fs.readFileSync(firstPending, 'utf8'), 'PINNED!', 'foreign staged inode remains untouched');
    assert.deepEqual(fs.readdirSync(dir).filter(x => x.includes('.old-')), []);
    // Clean up foreign fixture after validating that rollback respected its ownership.
    fs.rmSync(firstPending);
  }));

  test('vendor root symlink is refused before writing any assets', function () {
    if (process.platform === 'win32') this.skip(); // Windows symlink privileges vary.
    temporary(root => {
      const outside = path.join(root, 'outside');
      fs.mkdirSync(outside);
      const vendor = path.join(root, 'vendor');
      fs.symlinkSync(outside, vendor, 'dir');
      assert.throws(() => vendorTool.commitOutputs(
        new Map([['piper/piper.min.js', Buffer.from('NEW')]]), vendor, fs, root,
      ), /vendor root must be a real directory/);
      assert.deepEqual(fs.readdirSync(outside), []);
    });
  });

  test('vendor ancestor symlink cannot create files outside trusted checkout', function () {
    if (process.platform === 'win32') this.skip(); // Junction/symlink privileges vary; real Unix negative is mandatory.
    temporary(root => {
      const checkout = path.join(root, 'checkout');
      const outside = path.join(root, 'outside');
      fs.mkdirSync(path.join(checkout, 'src'), { recursive: true });
      fs.mkdirSync(outside);
      fs.symlinkSync(outside, path.join(checkout, 'src', 'roadmap'), 'dir');
      const vendor = path.join(checkout, 'src', 'roadmap', 'ui', 'vendor');
      assert.throws(() => vendorTool.commitOutputs(
        new Map([['piper/piper.min.js', Buffer.from('NEW')]]), vendor, fs, checkout,
      ), /vendor ancestor must be a real directory/);
      assert.deepEqual(fs.readdirSync(outside), [], 'must refuse before even creating a directory outside');
    });
  });

  test('write transaction updates pinned browser assets successfully', () => temporary(root => {
    const outputs = new Map([['piper/piper.min.js', Buffer.from('NEW')]]);
    const warnings = vendorTool.commitOutputs(outputs, path.join(root, 'vendor'), fs, root);
    assert.deepEqual(warnings, []);
    assert.equal(fs.readFileSync(path.join(root, 'vendor', 'piper', 'piper.min.js'), 'utf8'), 'NEW');
  }));
  test('read-only pinned verification accepts byte-identical assets and preserves source metadata', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const assets = new Map([
      ['piper/piper.min.js', Buffer.from('PINNED-PIPER')],
      ['whisper/transformers.min.js', Buffer.from('PINNED-WHISPER')],
    ]);
    for (const [rel, data] of assets) {
      const file = path.join(vendor, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data);
    }
    const before = [...assets.keys()].map(rel => {
      const file = path.join(vendor, rel);
      const stat = fs.statSync(file);
      return { rel, bytes: fs.readFileSync(file), mtimeMs: stat.mtimeMs };
    });
    assert.equal(vendorTool.verifyPinnedVendorOutputs(assets, vendor, fs, root), 2);
    for (const prior of before) {
      const file = path.join(vendor, prior.rel);
      assert.deepEqual(fs.readFileSync(file), prior.bytes);
      assert.equal(fs.statSync(file).mtimeMs, prior.mtimeMs, 'verification must not rewrite the vendor tree');
    }
  }));

  test('read-only pinned verification refuses changed bytes, then passes after exact repair', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const file = path.join(vendor, 'piper', 'piper.min.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'DIFFERENT');
    const expected = new Map([['piper/piper.min.js', Buffer.from('PINNED')]]);
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(expected, vendor, fs, root), /asset mismatch/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'DIFFERENT', 'failed verification is read-only');
    fs.writeFileSync(file, 'PINNED');
    assert.equal(vendorTool.verifyPinnedVendorOutputs(expected, vendor, fs, root), 1);
  }));

  test('read-only pinned verification refuses missing, empty and wrong-type files', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const file = path.join(vendor, 'piper', 'piper.min.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const expected = new Map([['piper/piper.min.js', Buffer.from('PINNED')]]);
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(expected, vendor, fs, root), /asset missing/);
    fs.writeFileSync(file, '');
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(expected, vendor, fs, root), /invalid browser voice asset/);
    fs.rmSync(file);
    fs.mkdirSync(file);
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(expected, vendor, fs, root), /invalid browser voice asset/);
  }));

  test('read-only pinned verification refuses linked ancestor and never follows a source symlink', function () {
    if (process.platform === 'win32') this.skip();
    temporary(root => {
      const outside = path.join(root, 'outside');
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, 'piper.min.js'), 'PINNED');
      const vendor = path.join(root, 'vendor');
      fs.mkdirSync(vendor);
      fs.symlinkSync(outside, path.join(vendor, 'piper'), 'dir');
      const expected = new Map([['piper/piper.min.js', Buffer.from('PINNED')]]);
      assert.throws(() => vendorTool.verifyPinnedVendorOutputs(expected, vendor, fs, root), /ancestor must be a real directory/);
      assert.equal(fs.readFileSync(path.join(outside, 'piper.min.js'), 'utf8'), 'PINNED');
    });
  });

  test('read-only pinned verification rejects unauthorized asset names and empty inventory', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    fs.mkdirSync(vendor);
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(new Map(), vendor, fs, root), /approved asset map/);
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(
      new Map([['../outside', Buffer.from('X')]]), vendor, fs, root), /invalid pinned voice verification asset/);
  }));

  test('upstream parity is checked against committed HEAD bytes, never just a dirty worktree', () => temporary(root => {
    const extension = path.join(root, 'FailSafe', 'extension');
    const vendor = path.join(extension, 'src', 'roadmap', 'ui', 'vendor');
    const file = path.join(vendor, 'piper', 'piper.min.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'COMMITTED-PIN');
    const git = (...args: string[]) => {
      const run = childProcess.spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(run.status, 0, `git ${args.join(' ')} failed: ${run.stderr}`);
    };
    git('init', '-q');
    git('add', 'FailSafe/extension/src/roadmap/ui/vendor/piper/piper.min.js');
    git('-c', 'user.name=FailSafe Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-q', '-m', 'pinned fixture');
    const pinned = new Map([['piper/piper.min.js', Buffer.from('COMMITTED-PIN')]]);
    assert.equal(vendorTool.verifyPinnedVendorOutputs(pinned, vendor, fs, root), 1);
    assert.equal(vendorTool.verifyCommittedVendorOutputs(pinned, extension), 1);

    fs.writeFileSync(file, 'UNCOMMITTED-REPAIR');
    assert.throws(() => vendorTool.verifyPinnedVendorOutputs(pinned, vendor, fs, root), /asset mismatch/);
    assert.equal(vendorTool.verifyCommittedVendorOutputs(pinned, extension), 1,
      'Git snapshot remains original, independent of mutable worktree');

    const uncommitted = new Map([['piper/piper.min.js', Buffer.from('UNCOMMITTED-REPAIR')]]);
    assert.equal(vendorTool.verifyPinnedVendorOutputs(uncommitted, vendor, fs, root), 1);
    assert.throws(() => vendorTool.verifyCommittedVendorOutputs(uncommitted, extension),
      /pinned committed browser voice asset mismatch/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'UNCOMMITTED-REPAIR');
    assert.throws(() => vendorTool.verifyCommittedVendorOutputs(
      new Map([['whisper/transformers.min.js', Buffer.from('ANY')]]), extension),
    /committed browser voice asset is not a regular Git blob/);

    if (process.platform !== 'win32') {
      // A Git symlink blob whose target string exactly matches pinned bytes
      // must not masquerade as a normal browser asset.
      fs.rmSync(file);
      fs.symlinkSync('COMMITTED-PIN', file);
      git('add', 'FailSafe/extension/src/roadmap/ui/vendor/piper/piper.min.js');
      git('-c', 'user.name=FailSafe Fixture', '-c', 'user.email=fixture@example.invalid',
        'commit', '-q', '-m', 'symlink fixture');
      assert.throws(() => vendorTool.verifyCommittedVendorOutputs(pinned, extension),
        /not a regular Git blob/);
    }
  }));

  test('Whisper re-vendoring applies the same deterministic browser sanitization', () => {
    const before = Buffer.from(
      'var mod=eval("quire".replace(/^/,"re"))(moduleName);if(mod&&(mod.length||Object.keys(mod).length))return mod; new Function("return this")',
    );
    const after = vendorTool.sanitizeWhisperBrowserBundle(before).toString('utf8');
    assert.equal(after.includes('eval("quire"'), false);
    assert.equal(after.includes('new Function("return this")'), false);
    assert.ok(after.includes('var mod=null'));
    assert.ok(after.includes('(function(){return this})()'));
  });

});

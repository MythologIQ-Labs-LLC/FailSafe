// #707: isolated, pinned voice-vendor tooling; no live npm/network required.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { vendorTool, temporary } from './vendorVoiceTestSupport';

suite('voice vendor staging #707', () => {
  test('unknown-ownership partial staging remains quarantined, previous asset is unchanged', () => temporary(root => {
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
    const leftovers = fs.readdirSync(dir).filter(x => x.includes('.new-') || x.includes('.old-'));
    assert.equal(leftovers.length, 1, 'unknown ownership must not cause automatic deletion');
    assert.match(leftovers[0], /\.new-/);
    assert.equal(fs.readFileSync(path.join(dir, leftovers[0]), 'utf8'), 'PARTIAL');
    assert.throws(() => vendorTool.assertVoiceVendorInventory(vendor, fs, root),
      /unexpected browser voice vendor entry/);
  }));

  test('concurrent foreign staged collision survives an exclusive-write EEXIST', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const dir = path.join(vendor, 'piper');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'piper.min.js');
    fs.writeFileSync(target, 'ORIGINAL');
    let intruded = '';
    const ops = {
      ...fs,
      writeFileSync(file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView,
                    opts?: fs.WriteFileOptions) {
        if (String(file).includes('.new-')) {
          intruded = String(file);
          fs.writeFileSync(file, 'FOREIGN-STAGED-ENTRY', { flag: 'wx' });
          // The real exclusive create is now required to fail EEXIST.
          fs.writeFileSync(file, data, opts);
        } else {
          fs.writeFileSync(file, data, opts);
        }
      },
    };
    assert.throws(() => vendorTool.commitOutputs(
      new Map([['piper/piper.min.js', Buffer.from('NEW')]]), vendor, ops, root,
    ), /EEXIST/);
    assert.ok(intruded, 'foreign staging collision must have been exercised');
    assert.equal(fs.readFileSync(target, 'utf8'), 'ORIGINAL');
    assert.equal(fs.readFileSync(intruded, 'utf8'), 'FOREIGN-STAGED-ENTRY',
      'the rollback must not delete an entry whose inode it never claimed');
    assert.throws(() => vendorTool.assertVoiceVendorInventory(vendor, fs, root),
      /unexpected browser voice vendor entry/);
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
});

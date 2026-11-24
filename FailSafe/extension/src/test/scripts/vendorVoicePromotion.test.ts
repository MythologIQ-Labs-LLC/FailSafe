// #707: isolated, pinned voice-vendor tooling; no live npm/network required.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { vendorTool, temporary } from './vendorVoiceTestSupport';

suite('voice vendor promotion and rollback #707', () => {
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

  test('failed later promotion preserves foreign replacement and original backup', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const dir = path.join(vendor, 'piper');
    fs.mkdirSync(dir, { recursive: true });
    const first = path.join(dir, 'piper.min.js');
    const second = path.join(dir, 'piper_phonemize.wasm');
    fs.writeFileSync(first, 'FIRST-OLD');
    fs.writeFileSync(second, 'SECOND-OLD');
    let mutated = false;
    const io = {
      ...fs,
      renameSync(from: fs.PathLike, to: fs.PathLike) {
        if (!mutated && String(from).includes('piper_phonemize.wasm.new-')) {
          mutated = true;
          fs.unlinkSync(first);
          fs.writeFileSync(first, 'FOREIGN-PROMOTED');
          throw new Error('injected later promotion failure');
        }
        fs.renameSync(from, to);
      },
    };
    assert.throws(() => vendorTool.commitOutputs(new Map([
      ['piper/piper.min.js', Buffer.from('FIRST-NEW')],
      ['piper/piper_phonemize.wasm', Buffer.from('SECOND-NEW')],
    ]), vendor, io, root), /recovery may be required/);
    assert.equal(mutated, true);
    assert.equal(fs.readFileSync(first, 'utf8'), 'FOREIGN-PROMOTED',
      'rollback cannot remove a substituted installed target');
    assert.equal(fs.readFileSync(second, 'utf8'), 'SECOND-OLD',
      'unaffected second original is recovered');
    const backups = fs.readdirSync(dir).filter(name => name.startsWith('piper.min.js.old-'));
    assert.equal(backups.length, 1, 'do not discard unrecovered original');
    assert.equal(fs.readFileSync(path.join(dir, backups[0]), 'utf8'), 'FIRST-OLD');
    assert.deepEqual(fs.readdirSync(dir).filter(name => name.includes('.new-')), []);
  }));

  test('failed promotion refuses a substituted backup instead of installing it', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const dir = path.join(vendor, 'piper');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'piper.min.js');
    const displaced = path.join(root, 'original-backup-preserved');
    fs.writeFileSync(target, 'ORIGINAL');
    let replaced = false;
    const io = {
      ...fs,
      renameSync(from: fs.PathLike, to: fs.PathLike) {
        if (!replaced && String(from).includes('piper.min.js.new-')) {
          replaced = true;
          const backup = String(from).replace('.new-', '.old-');
          fs.renameSync(backup, displaced);
          fs.writeFileSync(backup, 'FOREIGN-BACKUP');
          throw new Error('injected destination promotion failure');
        }
        fs.renameSync(from, to);
      },
    };
    assert.throws(() => vendorTool.commitOutputs(new Map([
      ['piper/piper.min.js', Buffer.from('PINNED')],
    ]), vendor, io, root), /recovery may be required/);
    assert.equal(replaced, true);
    assert.equal(fs.existsSync(target), false, 'foreign backup cannot be restored');
    assert.equal(fs.readFileSync(displaced, 'utf8'), 'ORIGINAL');
    const backups = fs.readdirSync(dir).filter(name => name.includes('.old-'));
    assert.equal(backups.length, 1);
    assert.equal(fs.readFileSync(path.join(dir, backups[0]), 'utf8'), 'FOREIGN-BACKUP',
      'rollback does not overwrite or remove foreign backup');
  }));

  test('successful promotion keeps a foreign substituted backup instead of deleting it', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const dir = path.join(vendor, 'piper');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'piper.min.js');
    const displaced = path.join(root, 'original-backup');
    fs.writeFileSync(target, 'ORIGINAL');
    let replacement = '';
    const ops = {
      ...fs,
      renameSync(from: fs.PathLike, to: fs.PathLike) {
        fs.renameSync(from, to);
        if (String(from).includes('.new-')) {
          const backup = String(from).replace('.new-', '.old-');
          fs.renameSync(backup, displaced);
          fs.writeFileSync(backup, 'FOREIGN-BACKUP');
          replacement = backup;
        }
      },
    };
    const warnings: string[] = vendorTool.commitOutputs(
      new Map([['piper/piper.min.js', Buffer.from('PINNED')]]), vendor, ops, root,
    );
    assert.equal(fs.readFileSync(target, 'utf8'), 'PINNED', 'successful asset promotion stays intact');
    assert.equal(fs.readFileSync(displaced, 'utf8'), 'ORIGINAL', 'original saved elsewhere remains');
    assert.equal(fs.readFileSync(replacement, 'utf8'), 'FOREIGN-BACKUP',
      'cleanup cannot remove a foreign backup');
    assert.equal(warnings.length, 1, 'operator receives explicit stale-backup warning');
    assert.match(warnings[0], /voice vendor cleanup refuses foreign backup/);
    assert.deepEqual(fs.readdirSync(dir).filter(name => name.includes('.new-')), []);
  }));

  test('write transaction updates pinned browser assets successfully', () => temporary(root => {
    const outputs = new Map([['piper/piper.min.js', Buffer.from('NEW')]]);
    const warnings = vendorTool.commitOutputs(outputs, path.join(root, 'vendor'), fs, root);
    assert.deepEqual(warnings, []);
    assert.equal(fs.readFileSync(path.join(root, 'vendor', 'piper', 'piper.min.js'), 'utf8'), 'NEW');
  }));
});

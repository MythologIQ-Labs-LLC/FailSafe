// #707: isolated, pinned voice-vendor tooling; no live npm/network required.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { vendorTool, temporary } from './vendorVoiceTestSupport';

suite('voice vendor existing assets #707', () => {
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

  test('oversized or empty old asset is refused without reading, staging or overwriting', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const dir = path.join(vendor, 'piper');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'piper.min.js');
    for (const size of [0, 75 * 1024 * 1024 + 1]) {
      fs.writeFileSync(target, '');
      fs.truncateSync(target, size); // sparse file: no 75-MiB allocation
      // Count every io path that could read the target, not only openSync:
      // a readFileSync or stream on the original must fail this test (#707 V1).
      let reads = 0;
      let staged = 0;
      const onTarget = (file: unknown) => { if (String(file) === target) reads++; };
      const io = {
        ...fs,
        openSync: (...a: Parameters<typeof fs.openSync>) => { onTarget(a[0]); return fs.openSync(...a); },
        readFileSync: (...a: Parameters<typeof fs.readFileSync>) => { onTarget(a[0]); return fs.readFileSync(...a); },
        createReadStream: (...a: Parameters<typeof fs.createReadStream>) => { onTarget(a[0]); return fs.createReadStream(...a); },
        writeFileSync(file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView,
          options?: fs.WriteFileOptions) {
          if (String(file).includes('.new-')) staged++;
          fs.writeFileSync(file, data, options);
        },
      };
      assert.throws(() => vendorTool.commitOutputs(
        new Map([['piper/piper.min.js', Buffer.from('PINNED')]]), vendor, io, root,
      ), /existing voice vendor asset exceeds size budget or is empty/);
      assert.equal(reads, 0, 'the rejected existing file must never be opened or read');
      assert.equal(staged, 0, 'all preflight checks precede staging');
      assert.equal(fs.statSync(target).size, size, 'the original file remains untouched');
      assert.deepEqual(fs.readdirSync(dir), ['piper.min.js']);
    }
  }));

  test('old file modified after open is refused without promoting', () => temporary(root => {
    const vendor = path.join(root, 'vendor');
    const dir = path.join(vendor, 'piper');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'piper.min.js');
    fs.writeFileSync(target, 'OLD');
    let mutated = false;
    const io = {
      ...fs,
      readSync(fd: number, buffer: NodeJS.ArrayBufferView, offset: number,
        length: number, position: number | null) {
        if (!mutated) {
          mutated = true;
          fs.appendFileSync(target, Buffer.alloc(64 * 1024));
        }
        return fs.readSync(fd, buffer, offset, length, position);
      },
    };
    assert.throws(() => vendorTool.commitOutputs(
      new Map([['piper/piper.min.js', Buffer.from('PINNED')]]), vendor, io, root,
    ), /existing voice vendor asset changed during read/);
    assert.equal(mutated, true);
    assert.equal(fs.statSync(target).size, 3 + 64 * 1024);
    assert.deepEqual(fs.readdirSync(dir), ['piper.min.js'], 'no staging or backup survives');
  }));
});

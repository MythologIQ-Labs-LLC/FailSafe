// #517 FX972: RiskStore in one process. Corruption is refused without
// replacing the register, a non-cooperating write mid-update is detected,
// the lock is only ever removed by the holder that owns it, and nothing is
// read, copied or written through a link.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RiskStore, RiskStoreError } from '../../../shared/risk-store';
import { RiskReadResult, RiskStoreSeams } from '../../../shared/risk-store/RiskStore';
import { sha256 } from '../../../shared/risk-store/riskDocument';

type Patchable = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const realFs = require('fs') as Patchable;
// getLocks is exported only from lib/lockfile.js, not the package index or its types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getLocks } = require('proper-lockfile/lib/lockfile') as { getLocks(): Record<string, unknown> };

/** Replace fs[name] on the module object every importer resolves through. */
function patch(name: string, impl: unknown): () => void {
  const original = realFs[name];
  realFs[name] = impl;
  return () => { realFs[name] = original; };
}

function sleepSync(ms: number): void { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

function codeOf(fn: () => unknown): string {
  try { fn(); } catch (e) { return e instanceof RiskStoreError ? e.code : `other:${String(e)}`; }
  return 'none';
}

function firstId(r: RiskReadResult): unknown {
  if (r.state !== 'ok') throw new Error(`expected an ok read, got ${r.state}`);
  return r.doc.risks[0]?.id;
}

function errorOf(fn: () => unknown): RiskStoreError {
  try { fn(); } catch (e) { if (e instanceof RiskStoreError) return e; throw e; }
  throw new Error('expected a RiskStoreError');
}

const TORN = '{"risks": [{"id": "old-1"}, {"id": "old-2", "ti';

suite('RiskStore (#517 FX972)', () => {
  let ws = '';
  let outside = '';
  const cleanups: Array<() => void> = [];
  const risksDir = (): string => path.join(ws, '.failsafe', 'risks');
  const risksFile = (): string => path.join(risksDir(), 'risks.json');
  const lockDir = (): string => `${risksFile()}.lock`;
  const seed = (content: string): void => { fs.mkdirSync(risksDir(), { recursive: true }); fs.writeFileSync(risksFile(), content); };
  const entries = (): string[] => fs.readdirSync(risksDir()).filter((f) => f !== 'risks.json');
  const copies = (): string[] => entries().filter((f) => f.includes('.corrupt-'));
  const store = (opts = {}, seams: RiskStoreSeams = {}): RiskStore => new RiskStore(ws, opts, seams);
  const add = (id: string) => (doc: { risks: Array<Record<string, unknown>> }): void => { doc.risks.push({ id }); };

  setup(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-store-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-store-outside-'));
  });
  teardown(() => {
    for (const undo of cleanups.splice(0).reverse()) undo();
    for (const d of [ws, outside]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
  });

  test('T3 a torn register is refused, kept in place, and copied exactly once', () => {
    seed(TORN);
    const e = errorOf(() => store().mutate(add('new')));
    assert.equal(e.code, 'UNREADABLE');
    assert.match(e.message, /JSON|Unexpected|Expected/);
    assert.equal(fs.readFileSync(risksFile(), 'utf8'), TORN);
    const h = sha256(Buffer.from(TORN)).slice(0, 12);
    assert.equal(copies().length, 1);
    assert.match(copies()[0], new RegExp(`^risks\\.json\\.corrupt-${h}-[0-9a-f]{12}\\.bak$`));
    assert.equal(fs.readFileSync(path.join(risksDir(), copies()[0]), 'utf8'), TORN);
    const s = store();
    codeOf(() => s.mutate(add('again')));
    const t0 = Date.now();
    assert.equal(codeOf(() => s.mutate(add('again'))), 'UNREADABLE');
    assert.ok(Date.now() - t0 < 50, 'a known-unreadable register is refused without the re-read delay');
    assert.equal(copies().length, 1, 'repeated refusals reuse the one copy');
  });

  test('T4 wrong shape is refused; an empty or whitespace-only file is an empty register', () => {
    for (const shape of ['{"foo":1}', '[{"id":"a"}]']) {
      seed(shape);
      const e = errorOf(() => store().mutate(add('n')));
      assert.equal(e.code, 'UNREADABLE');
      assert.match(e.message, /no risks array/);
      assert.equal(fs.readFileSync(risksFile(), 'utf8'), shape);
    }
    for (const blank of ['', '  \n\t']) {
      seed(blank);
      store().mutate(add('n'));
      assert.deepEqual(JSON.parse(fs.readFileSync(risksFile(), 'utf8')).risks, [{ id: 'n' }]);
    }
  });

  test('T5 a torn read that heals within the re-read window is not a refusal', () => {
    seed(JSON.stringify({ risks: [{ id: 'a' }] }));
    let calls = 0;
    const readRaw = (file: string): Buffer | null => {
      calls++;
      return calls === 1 ? Buffer.from(TORN) : fs.readFileSync(file);
    };
    store({}, { readRaw }).mutate(add('b'));
    assert.deepEqual(JSON.parse(fs.readFileSync(risksFile(), 'utf8')).risks.map((r: { id: string }) => r.id), ['a', 'b']);
    assert.deepEqual(copies(), []);
  });

  test('T6 a non-cooperating write during the mutation is a CONFLICT and wins', () => {
    seed(JSON.stringify({ risks: [{ id: 'a' }] }));
    const external = JSON.stringify({ risks: [{ id: 'a' }, { id: 'external' }] });
    const code = codeOf(() => store().mutate((doc) => {
      doc.risks.push({ id: 'mine' });
      fs.writeFileSync(risksFile(), external);
    }));
    assert.equal(code, 'CONFLICT');
    assert.equal(fs.readFileSync(risksFile(), 'utf8'), external);
  });

  test('T7 nested and async mutations are refused at once and leave nothing behind', () => {
    seed(JSON.stringify({ risks: [] }));
    const before = fs.readFileSync(risksFile(), 'utf8');
    const t0 = Date.now();
    const nestedRoot = process.platform === 'win32' ? ws.toUpperCase() : ws;
    const inner = codeOf(() => store().mutate(() => codeOf(() => new RiskStore(nestedRoot).mutate(add('x')))));
    assert.equal(inner, 'none', 'the outer mutate completes');
    assert.ok(Date.now() - t0 < 100);
    let nested = '';
    store().mutate(() => { nested = codeOf(() => new RiskStore(nestedRoot).mutate(add('x'))); });
    assert.equal(nested, 'REENTRANT');
    assert.equal(codeOf(() => store().mutate(async (doc) => { doc.risks.push({ id: 'x' }); })), 'ASYNC_MUTATOR');
    assert.equal(fs.readFileSync(risksFile(), 'utf8'), before);
    assert.equal(fs.existsSync(lockDir()), false);
  });

  test('T8 no-op mutations write nothing; unknown fields survive; read() caches by file identity', () => {
    seed(JSON.stringify({ projectId: 'p', extra: { keep: true }, risks: [{ id: 'a', custom: 1 }] }));
    const pinned = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(risksFile(), pinned, pinned);
    const before = fs.readFileSync(risksFile(), 'utf8');
    store().mutate(() => undefined);
    assert.equal(fs.readFileSync(risksFile(), 'utf8'), before);
    assert.equal(fs.statSync(risksFile()).mtimeMs, pinned.getTime());
    store().mutate(add('b'));
    const doc = JSON.parse(fs.readFileSync(risksFile(), 'utf8'));
    assert.equal(doc.projectId, 'p');
    assert.deepEqual(doc.extra, { keep: true });
    assert.equal(doc.risks[0].custom, 1);

    let reads = 0;
    const counting = store({}, { readRaw: (f) => { reads++; return fs.readFileSync(f); } });
    counting.read(); counting.read();
    assert.equal(reads, 1, 'an unchanged file is parsed once');
    fs.writeFileSync(`${risksFile()}.new`, JSON.stringify({ risks: [{ id: 'replaced' }] }));
    fs.renameSync(`${risksFile()}.new`, risksFile());
    assert.equal(firstId(counting.read()), 'replaced');

    fs.writeFileSync(risksFile(), JSON.stringify({ risks: [{ id: 'AAAA' }] }));
    fs.utimesSync(risksFile(), pinned, pinned);
    const s1 = fs.statSync(risksFile(), { bigint: true });
    assert.equal(firstId(counting.read()), 'AAAA');
    sleepSync(20);
    fs.writeFileSync(risksFile(), JSON.stringify({ risks: [{ id: 'BBBB' }] }));
    fs.utimesSync(risksFile(), pinned, pinned);
    const s2 = fs.statSync(risksFile(), { bigint: true });
    assert.ok(s1.size === s2.size && s1.ino === s2.ino && s1.mtimeNs === s2.mtimeNs && s1.ctimeNs !== s2.ctimeNs,
      'inconclusive: the same-size write must change only ctime');
    assert.equal(firstId(counting.read()), 'BBBB');
  });

  suite('T9 Windows rename failures', () => {
    const eperm = (): Error => Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    const realRename = fs.renameSync;

    test('(a) EPERM five times, then success: the outer retry persists the write', () => {
      seed(JSON.stringify({ risks: [] }));
      let fails = 5;
      cleanups.push(patch('renameSync', (a: string, b: string) => { if (fails-- > 0) throw eperm(); realRename(a, b); }));
      store().mutate(add('ok'));
      assert.deepEqual(JSON.parse(fs.readFileSync(risksFile(), 'utf8')).risks, [{ id: 'ok' }]);
    });

    test('(b) EPERM always, at the default staleMs: WRITE_FAILED, bytes unchanged, no temp left', () => {
      seed(JSON.stringify({ risks: [] }));
      const before = fs.readFileSync(risksFile(), 'utf8');
      cleanups.push(patch('renameSync', () => { throw eperm(); }));
      assert.equal(codeOf(() => store().mutate(add('no'))), 'WRITE_FAILED');
      assert.equal(fs.readFileSync(risksFile(), 'utf8'), before);
      assert.deepEqual(entries().filter((f) => f.endsWith('.tmp')), []);
    });

    test('(c) an external write between outer attempts is a CONFLICT and survives', () => {
      seed(JSON.stringify({ risks: [] }));
      const external = JSON.stringify({ risks: [{ id: 'external' }] });
      let calls = 0;
      cleanups.push(patch('renameSync', (a: string, b: string) => {
        calls++;
        if (calls <= 3) {
          if (calls === 3) fs.writeFileSync(risksFile(), external);
          throw eperm();
        }
        realRename(a, b);
      }));
      assert.equal(codeOf(() => store().mutate(add('mine'))), 'CONFLICT');
      assert.equal(fs.readFileSync(risksFile(), 'utf8'), external);
    });
  });

  test('T10 orphan temps older than staleMs are swept; fresh ones are kept', () => {
    seed(JSON.stringify({ risks: [] }));
    const old = path.join(risksDir(), '.risks.json.aaaaaaaaaaaa.tmp');
    const fresh = path.join(risksDir(), '.risks.json.bbbbbbbbbbbb.tmp');
    fs.writeFileSync(old, 'x'); fs.writeFileSync(fresh, 'y');
    const past = new Date(Date.now() - 60000);
    fs.utimesSync(old, past, past);
    store().mutate(add('n'));
    assert.equal(fs.existsSync(old), false);
    assert.equal(fs.existsSync(fresh), true);
  });

  test('T18 (iii) a lock directory replaced under the holder is LOCK_LOST and left alone', () => {
    seed(JSON.stringify({ risks: [] }));
    const before = fs.readFileSync(risksFile(), 'utf8');
    let replacementIno = 0n;
    const code = codeOf(() => store({ staleMs: 5000 }).mutate((doc) => {
      fs.rmdirSync(lockDir());
      fs.mkdirSync(lockDir());
      replacementIno = fs.lstatSync(lockDir(), { bigint: true }).ino;
      doc.risks.push({ id: 'P' });
    }));
    assert.equal(code, 'LOCK_LOST');
    assert.equal(fs.readFileSync(risksFile(), 'utf8'), before);
    assert.equal(fs.lstatSync(lockDir(), { bigint: true }).ino, replacementIno, 'the replacement lock survives');
    fs.rmdirSync(lockDir());
  });

  for (const withFile of [true, false]) {
    test(`T18 (iv) a holder past its budget is LOCK_LOST and leaves the lock${withFile ? '' : ' (no risks.json)'}`, () => {
      if (withFile) seed(JSON.stringify({ risks: [] }));
      const before = withFile ? fs.readFileSync(risksFile(), 'utf8') : null;
      const code = codeOf(() => store({ staleMs: 2000 }).mutate((doc) => { doc.risks.push({ id: 'P' }); sleepSync(1500); }));
      assert.equal(code, 'LOCK_LOST');
      if (before !== null) assert.equal(fs.readFileSync(risksFile(), 'utf8'), before);
      else assert.equal(fs.existsSync(risksFile()), false);
      assert.ok(fs.existsSync(lockDir()), 'the no-rmdir release leaves the directory to stale recovery');
      assert.deepEqual(Object.keys(getLocks()).filter((k) => k.startsWith(path.resolve(ws))), []);
      fs.rmdirSync(lockDir());
    });
  }

  suite('T19 no predictable copy target', () => {
    const corrupt = (): string => { seed(TORN); return sha256(Buffer.from(TORN)).slice(0, 12); };

    test('(a) planted hard links at the predictable names are never written', () => {
      const h = corrupt();
      const target = path.join(outside, 'target.txt');
      fs.writeFileSync(target, 'OUTSIDE');
      const planted = [`risks.json.corrupt-${h}.bak`, `risks.json.corrupt-${h}-000000000000.bak`];
      for (const p of planted) fs.linkSync(target, path.join(risksDir(), p));
      assert.equal(codeOf(() => store().mutate(add('n'))), 'UNREADABLE');
      assert.equal(fs.readFileSync(target, 'utf8'), 'OUTSIDE');
      const made = copies().filter((f) => !planted.includes(f));
      assert.equal(made.length, 1);
      assert.match(made[0], new RegExp(`^risks\\.json\\.corrupt-${h}-[0-9a-f]{12}\\.bak$`));
      assert.equal(fs.readFileSync(path.join(risksDir(), made[0]), 'utf8'), TORN);
    });

    test('(b) planted symlinks (dangling and live) are never followed', function () {
      const h = corrupt();
      const target = path.join(outside, 'target.txt');
      fs.writeFileSync(target, 'OUTSIDE');
      try {
        fs.symlinkSync(target, path.join(risksDir(), `risks.json.corrupt-${h}-000000000000.bak`), 'file');
        fs.symlinkSync(path.join(outside, 'absent.txt'), path.join(risksDir(), `risks.json.corrupt-${h}-111111111111.bak`), 'file');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EPERM') this.skip();
        throw e;
      }
      const suffixes = ['000000000000', '111111111111', 'cccccccccccc'];
      assert.equal(codeOf(() => store({}, { randomSuffix: () => suffixes.shift()! }).mutate(add('n'))), 'UNREADABLE');
      assert.equal(fs.readFileSync(target, 'utf8'), 'OUTSIDE');
      assert.equal(fs.existsSync(path.join(outside, 'absent.txt')), false);
      assert.equal(fs.readFileSync(path.join(risksDir(), `risks.json.corrupt-${h}-cccccccccccc.bak`), 'utf8'), TORN);
    });

    test('(c) a random draw that hits a planted name moves on to the next draw', () => {
      const h = corrupt();
      const target = path.join(outside, 'target.txt');
      fs.writeFileSync(target, 'OUTSIDE');
      fs.linkSync(target, path.join(risksDir(), `risks.json.corrupt-${h}-000000000000.bak`));
      const suffixes = ['000000000000', 'aaaaaaaaaaaa'];
      assert.equal(codeOf(() => store({}, { randomSuffix: () => suffixes.shift()! }).mutate(add('n'))), 'UNREADABLE');
      assert.equal(fs.readFileSync(target, 'utf8'), 'OUTSIDE');
      assert.equal(fs.readFileSync(path.join(risksDir(), `risks.json.corrupt-${h}-aaaaaaaaaaaa.bak`), 'utf8'), TORN);
    });

    test('(d) a copy handle that is not the named file gets no bytes', () => {
      const h = corrupt();
      const trap = path.join(risksDir(), `risks.json.corrupt-${h}-bbbbbbbbbbbb.bak`);
      const elsewhere = path.join(outside, 'fresh.txt');
      const realOpen = fs.openSync;
      cleanups.push(patch('openSync', (p: fs.PathLike, flags: number | string, mode?: number) => {
        if (String(p) === trap) {
          fs.closeSync(realOpen(trap, 'w'));
          return realOpen(elsewhere, 'w');
        }
        return realOpen(p, flags, mode);
      }));
      const suffixes = ['bbbbbbbbbbbb', 'cccccccccccc'];
      assert.equal(codeOf(() => store({}, { randomSuffix: () => suffixes.shift()! }).mutate(add('n'))), 'UNREADABLE');
      assert.equal(fs.statSync(elsewhere).size, 0);
      assert.equal(fs.readFileSync(path.join(risksDir(), `risks.json.corrupt-${h}-cccccccccccc.bak`), 'utf8'), TORN);
    });
  });

  suite('T20 a linked or non-regular register', () => {
    test('a directory at risks.json is NOT_REGULAR_FILE and nothing is created', () => {
      fs.mkdirSync(risksFile(), { recursive: true });
      assert.equal(codeOf(() => store().mutate(add('n'))), 'NOT_REGULAR_FILE');
      assert.deepEqual(entries(), []);
      const r = store().read();
      assert.equal(r.state, 'unreadable');
    });

    test('a symlinked risks.json is never read or copied', function () {
      fs.mkdirSync(risksDir(), { recursive: true });
      const secret = path.join(outside, 'secret.txt');
      fs.writeFileSync(secret, 'aws_secret_access_key=xyz');
      try { fs.symlinkSync(secret, risksFile(), 'file'); } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EPERM') this.skip();
        throw e;
      }
      assert.equal(codeOf(() => store().mutate(add('n'))), 'NOT_REGULAR_FILE');
      assert.deepEqual(entries(), []);
      assert.equal(fs.readFileSync(secret, 'utf8'), 'aws_secret_access_key=xyz');
      const r = store().read();
      assert.equal(r.state, 'unreadable');
      assert.ok(!JSON.stringify(r).includes('aws_secret'));
    });
  });

  suite('T21 lock errors', () => {
    test('(a) a stale lock directory holding a file is LOCK_BLOCKED', () => {
      seed(JSON.stringify({ risks: [] }));
      const before = fs.readFileSync(risksFile(), 'utf8');
      fs.mkdirSync(lockDir());
      fs.writeFileSync(path.join(lockDir(), 'committed.txt'), 'x');
      const old = new Date(Date.now() - 60000);
      fs.utimesSync(lockDir(), old, old);
      const t0 = Date.now();
      const e = errorOf(() => store().mutate(add('n')));
      assert.equal(e.code, 'LOCK_BLOCKED');
      assert.match(e.message, /\.failsafe\/risks\/risks\.json\.lock/);
      assert.ok(Date.now() - t0 < 500);
      assert.equal(fs.readFileSync(risksFile(), 'utf8'), before);
    });

    test('(b) EPERM from mkdir and lstat on the lock path is contention', () => {
      seed(JSON.stringify({ risks: [] }));
      fs.mkdirSync(lockDir());
      const realMkdir = fs.mkdirSync;
      const realLstat = fs.lstatSync;
      let mkdirCalls = 0;
      let lstatCalls = 0;
      const eperm = (): Error => Object.assign(new Error('EPERM'), { code: 'EPERM' });
      const undoLstat = patch('lstatSync', (p: fs.PathLike, o?: fs.StatOptions) => {
        if (String(p) === lockDir() && lstatCalls < 2) { lstatCalls++; throw eperm(); }
        return realLstat(p, o as fs.StatOptions);
      });
      const undoMkdir = patch('mkdirSync', (p: fs.PathLike, o?: fs.MakeDirectoryOptions) => {
        if (String(p) === lockDir()) {
          mkdirCalls++;
          if (mkdirCalls <= 2) throw eperm();
          fs.rmdirSync(lockDir());
          undoMkdir(); undoLstat();
        }
        return realMkdir(p, o);
      });
      cleanups.push(undoMkdir, undoLstat);
      store().mutate(add('n'));
      assert.ok(lstatCalls >= 1, 'the contention lstat ran');
      assert.deepEqual(JSON.parse(fs.readFileSync(risksFile(), 'utf8')).risks, [{ id: 'n' }]);
    });

    test('(c) a fresh workspace: mutate creates the directories; read() creates nothing', () => {
      const other = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-store-fresh-'));
      cleanups.push(() => fs.rmSync(other, { recursive: true, force: true }));
      assert.equal(new RiskStore(other).read().state, 'absent');
      assert.equal(fs.existsSync(path.join(other, '.failsafe')), false);
      store().mutate(add('n'));
      assert.deepEqual(JSON.parse(fs.readFileSync(risksFile(), 'utf8')).risks, [{ id: 'n' }]);
    });

    test('(d) a link or a file at the lock path is LOCK_BLOCKED at once', function () {
      seed(JSON.stringify({ risks: [] }));
      const before = fs.readFileSync(risksFile(), 'utf8');
      const missing = path.join(outside, 'gone');
      const plant: Array<() => void> = [
        () => { fs.mkdirSync(missing); fs.symlinkSync(missing, lockDir(), 'junction'); fs.rmdirSync(missing); },
        () => fs.writeFileSync(lockDir(), 'not a directory'),
      ];
      if (process.platform !== 'win32') plant.push(() => fs.symlinkSync(missing, lockDir()));
      for (const make of plant) {
        make();
        const t0 = Date.now();
        assert.equal(codeOf(() => store().mutate(add('n'))), 'LOCK_BLOCKED');
        assert.ok(Date.now() - t0 < 100, `took ${Date.now() - t0} ms`);
        assert.equal(fs.readFileSync(risksFile(), 'utf8'), before);
        assert.ok(fs.lstatSync(lockDir()), 'the planted entry is left in place');
        fs.rmSync(lockDir(), { force: true, recursive: false });
      }
    });

    suite('(e) guarded lock removal', () => {
      const eperm = (): Error => Object.assign(new Error('EPERM'), { code: 'EPERM' });

      test('(i) one EPERM: the retry removes the lock and the next acquire is immediate', () => {
        seed(JSON.stringify({ risks: [] }));
        const realRmdir = fs.rmdirSync;
        let failed = false;
        cleanups.push(patch('rmdirSync', (p: fs.PathLike) => {
          if (String(p) === lockDir() && !failed) { failed = true; throw eperm(); }
          realRmdir(p);
        }));
        store().mutate(add('a'));
        assert.equal(fs.existsSync(lockDir()), false);
        const t0 = Date.now();
        store().mutate(add('b'));
        assert.ok(Date.now() - t0 < 100);
      });

      test('(ii) the retry never removes a lock directory that is not this holder\'s', () => {
        seed(JSON.stringify({ risks: [] }));
        const realRmdir = fs.rmdirSync;
        let calls = 0;
        let freshIno = 0n;
        cleanups.push(patch('rmdirSync', (p: fs.PathLike) => {
          if (String(p) !== lockDir()) return realRmdir(p);
          calls++;
          if (calls === 1) {
            realRmdir(p);
            fs.mkdirSync(lockDir());
            freshIno = fs.lstatSync(lockDir(), { bigint: true }).ino;
            throw eperm();
          }
          realRmdir(p);
        }));
        store().mutate(add('a'));
        assert.equal(calls, 1);
        assert.equal(fs.lstatSync(lockDir(), { bigint: true }).ino, freshIno);
      });

      test('(iii) the retry stops once the lock budget has run out', () => {
        seed(JSON.stringify({ risks: [] }));
        const realRmdir = fs.rmdirSync;
        let calls = 0;
        let late = false;
        cleanups.push(patch('rmdirSync', (p: fs.PathLike) => {
          if (String(p) !== lockDir()) return realRmdir(p);
          calls++;
          late = true;
          throw eperm();
        }));
        const clock = { t: 0 };
        store({ staleMs: 5000 }, { now: () => clock.t + (late ? 4500 : 0) }).mutate(add('a'));
        assert.equal(calls, 1);
        assert.ok(fs.existsSync(lockDir()));
      });
    });
  });

  suite('T23 a linked risks directory', () => {
    const junction = (target: string, at: string): void => fs.symlinkSync(target, at, 'junction');

    test('.failsafe/risks linked outside the workspace is UNSAFE_PATH and nothing lands outside', () => {
      fs.mkdirSync(path.join(ws, '.failsafe'));
      fs.writeFileSync(path.join(outside, 'risks.json'), JSON.stringify({ risks: [{ id: 'outside' }] }));
      const before = fs.readFileSync(path.join(outside, 'risks.json'), 'utf8');
      junction(outside, risksDir());
      assert.equal(codeOf(() => store().mutate(add('n'))), 'UNSAFE_PATH');
      assert.equal(store().read().state, 'unreadable');
      assert.deepEqual(fs.readdirSync(outside), ['risks.json']);
      assert.equal(fs.readFileSync(path.join(outside, 'risks.json'), 'utf8'), before);
    });

    test('.failsafe itself linked outside is UNSAFE_PATH', () => {
      fs.mkdirSync(path.join(outside, 'risks'));
      fs.writeFileSync(path.join(outside, 'risks', 'risks.json'), JSON.stringify({ risks: [{ id: 'outside' }] }));
      const before = fs.readFileSync(path.join(outside, 'risks', 'risks.json'), 'utf8');
      junction(outside, path.join(ws, '.failsafe'));
      assert.equal(codeOf(() => store().mutate(add('n'))), 'UNSAFE_PATH');
      assert.deepEqual(fs.readdirSync(path.join(outside, 'risks')), ['risks.json']);
      assert.equal(fs.readFileSync(path.join(outside, 'risks', 'risks.json'), 'utf8'), before);
    });

    test('a link planted between two mutations is caught by the second', () => {
      store().mutate(add('first'));
      fs.renameSync(path.join(ws, '.failsafe'), path.join(ws, 'moved'));
      fs.mkdirSync(path.join(outside, 'risks'));
      junction(outside, path.join(ws, '.failsafe'));
      assert.equal(codeOf(() => store().mutate(add('second'))), 'UNSAFE_PATH');
      assert.deepEqual(fs.readdirSync(path.join(outside, 'risks')), []);
    });
  });
});

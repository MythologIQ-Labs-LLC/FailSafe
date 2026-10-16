// #477 (plan-v608 lane B, O2, O4, O7-O10, O12, O16): durable, deduplicated,
// signed historical import of OpenHands runs. Reworks draft PR #507's suite:
// per-event evidence lives in its own file, keyed by export event id, signed
// for this install and folder, and verified on every read.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { observeOpenHandsRun, type AgentObservationEvent } from '../../../integrations/agent-observe/openhands-observer';
import { evidencePath, importKeyFor, persistOpenHandsObservations, RECORD_TYPE, runIdentityOf } from '../../../integrations/agent-observe/openhands-import';
import { createHash, randomUUID } from 'crypto';
import {
  canonicalJson, EVIDENCE_KEY_ID, EvidenceKeyHolder, normalizeFolder, signRecord, SECRET_STORAGE_REFUSAL,
  type SecretsLike, type Timer,
} from '../../../integrations/agent-observe/openhands-signing';
import { OpenHandsEvidenceReader, type FolderRef, type FsOps } from '../../../integrations/agent-observe/openhands-evidence';

// ---- fakes -------------------------------------------------------------------

/** Immediate Secret Storage with change events to every context. */
class AutoSecrets {
  stored: string | undefined;
  private readonly listeners = new Set<(e: { key: string }) => void>();
  failGet = false;
  context(): SecretsLike {
    return {
      get: async () => { if (this.failGet) throw new Error('keychain locked'); return this.stored; },
      store: async (_k, v) => { this.stored = v; for (const l of [...this.listeners]) l({ key: EVIDENCE_KEY_ID }); },
      onDidChange: (l) => { this.listeners.add(l); return { dispose: () => this.listeners.delete(l) }; },
    };
  }
}

/**
 * Secret Storage whose get, store and change delivery are deferred: the test
 * resolves each in a pinned order. Every get is counted per context, and an
 * operation the order does not name is left pending and fails `assertDrained`.
 */
class PinnedSecrets {
  stored: string | undefined;
  readonly gets = new Map<string, number>();
  private readonly pendingGets: Array<{ ctx: string; resolve: (v: string | undefined) => void; reject: (e: unknown) => void }> = [];
  private readonly pendingStores: Array<{ ctx: string; value: string; resolve: () => void }> = [];
  private readonly listeners = new Map<string, (e: { key: string }) => void>();
  private readonly queuedEvents: string[] = [];

  context(ctx: string): SecretsLike {
    return {
      get: () => {
        this.gets.set(ctx, (this.gets.get(ctx) ?? 0) + 1);
        return new Promise((resolve, reject) => this.pendingGets.push({ ctx, resolve, reject }));
      },
      store: (_k, value) => new Promise<void>((resolve) => this.pendingStores.push({ ctx, value, resolve })),
      onDidChange: (l) => { this.listeners.set(ctx, l); return { dispose: () => this.listeners.delete(ctx) }; },
    };
  }

  private async waitFor<T>(find: () => T | undefined, what: string): Promise<T> {
    for (let i = 0; i < 400; i++) {
      const hit = find();
      if (hit !== undefined) return hit;
      await new Promise((r) => setImmediate(r));
    }
    throw new assert.AssertionError({ message: `pinned order: expected ${what}, but it never happened` });
  }

  /** Resolve the oldest pending get of `ctx` with the stored value (or `override`). */
  async get(ctx: string, override?: { value?: string }): Promise<void> {
    const i = await this.waitFor(() => { const k = this.pendingGets.findIndex((g) => g.ctx === ctx); return k >= 0 ? k : undefined; }, `a get from ${ctx}`);
    const [g] = this.pendingGets.splice(i, 1);
    g.resolve(override ? override.value : this.stored);
    await settle();
  }

  /** Leave the oldest pending get of `ctx` unanswered forever (a hung keychain). */
  async hang(ctx: string): Promise<void> {
    const i = await this.waitFor(() => { const k = this.pendingGets.findIndex((g) => g.ctx === ctx); return k >= 0 ? k : undefined; }, `a get from ${ctx}`);
    this.pendingGets.splice(i, 1);
  }

  /** Apply the oldest pending store of `ctx`; queue a change event for every context. */
  async store(ctx: string): Promise<void> {
    const i = await this.waitFor(() => { const k = this.pendingStores.findIndex((s) => s.ctx === ctx); return k >= 0 ? k : undefined; }, `a store from ${ctx}`);
    const [s] = this.pendingStores.splice(i, 1);
    this.stored = s.value;
    for (const c of this.listeners.keys()) this.queuedEvents.push(c);
    s.resolve();
    await settle();
  }

  /** Deliver one queued change event to `ctx`. */
  async deliver(ctx: string): Promise<void> {
    const i = this.queuedEvents.indexOf(ctx);
    assert.ok(i >= 0, `no queued change event for ${ctx}`);
    this.queuedEvents.splice(i, 1);
    this.listeners.get(ctx)?.({ key: EVIDENCE_KEY_ID });
    await settle();
  }

  assertDrained(expectedGets: Record<string, number>): void {
    assert.deepEqual(this.pendingGets.map((g) => g.ctx), [], 'no unplanned get is left pending');
    assert.deepEqual(this.pendingStores.map((s) => s.ctx), [], 'no unplanned store is left pending');
    assert.deepEqual(Object.fromEntries(this.gets), expectedGets, 'get count per context');
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

/** A timer the test fires by hand. */
function manualTimer(): { timer: Timer; fire(): void } {
  const pending: Array<() => void> = [];
  return { timer: (_ms, fire) => { pending.push(fire); return () => { const i = pending.indexOf(fire); if (i >= 0) pending.splice(i, 1); }; }, fire: () => pending.splice(0).forEach((f) => f()) };
}

// ---- fixtures ------------------------------------------------------------------

const tmp = (p: string) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)));
const roots: string[] = [];
function workspace(): string { const r = tmp('fs-oh-'); roots.push(r); return r; }

function records(raw: unknown[], version = '1.0.0'): AgentObservationEvent[] {
  return observeOpenHandsRun(raw, version).records;
}
const SDK = (id: string | number, tool = 'execute_bash') => ({ id, timestamp: '2026-10-10T10:00:00Z', source: 'agent', action: { kind: 'ExecuteBashAction' }, tool_name: tool });

function writeExport(root: string, raw: unknown[]): { file: string; bytes: Buffer } {
  const file = path.join(root, `run-${Math.random().toString(36).slice(2)}.json`);
  const bytes = Buffer.from(JSON.stringify({ version: '1.0.0', events: raw }));
  fs.writeFileSync(file, bytes);
  return { file, bytes };
}

async function importInto(root: string, raw: unknown[], keys: EvidenceKeyHolder, exp?: { file: string; bytes: Buffer }) {
  const e = exp ?? writeExport(root, raw);
  return persistOpenHandsObservations(root, e.file, e.bytes, records(raw), { keys });
}

const lines = (root: string) => fs.existsSync(evidencePath(root))
  ? fs.readFileSync(evidencePath(root), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const folderRef = (root: string): FolderRef => ({ fsPath: root, name: path.basename(root) });

function autoKeys(secrets = new AutoSecrets()): { secrets: AutoSecrets; keys: EvidenceKeyHolder } {
  return { secrets, keys: new EvidenceKeyHolder(secrets.context()) };
}

suiteTeardown(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 3 }); });

// ---- O2 / O7 / O9 / O10 ---------------------------------------------------------

suite('OpenHands historical import: store, keys, redaction (#477)', () => {
  test('O2 a repeat import adds nothing; a re-export with one new event adds only it; integer ids dedup too', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    const two = [SDK('evt-1'), SDK('evt-2', 'str_replace_editor')];
    assert.deepEqual(await importInto(root, two, keys), { imported: 2, duplicates: 0, unverified: 0, summaryWritten: true });
    const again = await importInto(root, two, keys);
    assert.equal(again.imported, 0); assert.equal(again.duplicates, 2);
    // #477 delta LD1 cost: with no run identity a longer re-export is a new
    // file, so it is keyed by that file and re-imports every event.
    const reexport = await importInto(root, [...two, SDK('evt-3')], keys);
    assert.equal(reexport.imported, 3); assert.equal(reexport.duplicates, 0);
    assert.equal((await importInto(root, [SDK(41), SDK(42)], keys)).imported, 2);
    assert.equal((await importInto(root, [SDK(41), SDK(42)], keys)).imported, 0);
    assert.equal(lines(root).length, 7);
    assert.ok(lines(root).every((r) => r.type === RECORD_TYPE && r.origin === 'historical-export' && /^[0-9a-f]{64}$/.test(r.sig)));
    const summary = fs.readFileSync(path.join(root, '.failsafe', 'logs', 'transparency.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(summary.length, 5, 'one transparency summary line per import, never one per event');
    assert.ok(lines(root).every((r) => r.v === 2), 'records are v2');
    assert.ok(summary.every((s) => s.type === 'agent.import.summary'));
  });

  test('O7 a flattened action carrying a credential, a path id and a script timestamp never reach the file', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    const raw = [{ action: 'curl -H "Authorization: Bearer sk-live-XYZ" https://x', id: '../../etc/passwd', timestamp: '<script>' }];
    const before = Date.now();
    await importInto(root, raw, keys);
    const text = fs.readFileSync(evidencePath(root), 'utf8');
    for (const s of ['sk-live-XYZ', 'Bearer', 'curl', '../../etc/passwd', '<script>']) assert.ok(!text.includes(s), `${s} was written`);
    const [rec] = lines(root);
    assert.equal(rec.verb, 'unrecognized');
    assert.equal(rec.idSource, 'index');
    assert.equal(rec.sourceTimestamp, undefined);
    assert.ok(Date.parse(rec.importedAt) >= before - 1000);
  });

  test('O9 a held lock refuses the import and leaves the lock', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    fs.mkdirSync(path.dirname(evidencePath(root)), { recursive: true });
    fs.writeFileSync(`${evidencePath(root)}.lock`, 'held');
    await assert.rejects(importInto(root, [SDK('a')], keys), /OPENHANDS_IMPORT_LOCKED/);
    assert.equal(fs.existsSync(`${evidencePath(root)}.lock`), true);
    assert.equal(fs.existsSync(evidencePath(root)), false);
  });

  test('O10 a torn evidence line is ignored and its event re-imported; a corrupt transparency line has no effect', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    await importInto(root, [SDK('t-1'), SDK('t-2')], keys);
    const text = fs.readFileSync(evidencePath(root), 'utf8').trim().split('\n');
    fs.writeFileSync(evidencePath(root), `${text[0]}\n${text[1].slice(0, 40)}`);
    fs.appendFileSync(path.join(root, '.failsafe', 'logs', 'transparency.jsonl'), 'not json at all\n');
    const r = await importInto(root, [SDK('t-1'), SDK('t-2')], keys);
    assert.deepEqual([r.imported, r.duplicates, r.unverified], [1, 1, 1]);
  });

  test('O4 the evidence target as a directory, then read-only, fails the import with no success', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    fs.mkdirSync(evidencePath(root), { recursive: true });
    await assert.rejects(importInto(root, [SDK('d')], keys), /OPENHANDS_IMPORT_INVALID_LOG/);
    const root2 = workspace();
    await importInto(root2, [SDK('d')], keys);
    fs.chmodSync(evidencePath(root2), 0o444);
    try {
      await assert.rejects(importInto(root2, [SDK('e')], keys), /EPERM|EACCES/);
    } finally { fs.chmodSync(evidencePath(root2), 0o644); }
  });

  test('O8 a linked .failsafe/logs (junction on win32, symlink elsewhere) is refused; the outside file is untouched', async () => {
    const root = workspace();
    const outside = workspace();
    const { keys } = autoKeys();
    fs.mkdirSync(path.join(root, '.failsafe'), { recursive: true });
    const sentinel = path.join(outside, 'openhands-imports.jsonl');
    fs.writeFileSync(sentinel, 'untouched');
    // Must not skip: a junction needs no privilege on win32, and POSIX allows symlinks.
    fs.symlinkSync(outside, path.join(root, '.failsafe', 'logs'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(fs.lstatSync(path.join(root, '.failsafe', 'logs')).isSymbolicLink(), true, 'the link exists');
    await assert.rejects(importInto(root, [SDK('l')], keys), /OPENHANDS_IMPORT_SYMLINK/);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'untouched');
  });
});

// ---- O12: untrusted evidence --------------------------------------------------------

suite('OpenHands evidence is verified and sanitized on read (#477 O12)', () => {
  test('a hand-written file in a fresh workspace shows nothing and does not suppress a real import', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    await keys.ensureKey();
    await keys.loadKey();
    const realEvents = records([SDK('real-1')]);
    const realExport = writeExport(root, [SDK('real-1')]);
    const realSha = createHash('sha256').update(realExport.bytes).digest('hex');
    const forged = {
      v: 2, type: RECORD_TYPE, source: 'openhands', origin: 'historical-export',
      importKey: importKeyFor(realEvents[0], realSha), sourceSha256: realSha, idSource: 'export', sourceEventId: 'real-1',
      kind: 'action', verb: 'execute_bash', severity: 'x" onclick="alert(1)', artifactPath: 'C:/Windows/notepad.exe',
      sourceTimestamp: '<script>', importedAt: '2026-01-01T00:00:00.000Z', summary: 'forged', sig: 'a'.repeat(64),
    };
    fs.mkdirSync(path.dirname(evidencePath(root)), { recursive: true });
    fs.writeFileSync(evidencePath(root), JSON.stringify(forged) + '\n');
    const reader = new OpenHandsEvidenceReader(keys, () => [folderRef(root)]);
    const before = reader.read();
    assert.deepEqual([before.entries.length, before.unverified], [0, 1]);
    const r = await importInto(root, [SDK('real-1')], keys, realExport);
    assert.equal(r.imported, 1, 'the forged key did not suppress the real event');
    assert.equal(lines(root)[0].sig, 'a'.repeat(64), 'the forged line stays in the file untouched');
    const after = reader.read();
    assert.deepEqual([after.entries.length, after.unverified], [1, 1]);
  });

  test('a record signed here and then edited by hand is not shown', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    await importInto(root, [SDK('e-1')], keys);
    const [rec] = lines(root);
    rec.verb = 'read';
    fs.writeFileSync(evidencePath(root), JSON.stringify(rec) + '\n');
    await keys.loadKey();
    const read = new OpenHandsEvidenceReader(keys, () => [folderRef(root)]).read();
    assert.deepEqual([read.entries.length, read.unverified], [0, 1]);
  });

  test('signed records with out-of-set fields: severity becomes info, artifactPath is dropped, bad kind and bad hash are skipped', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    await keys.ensureKey();
    await keys.loadKey();
    const key = keys.current()!;
    const folder = normalizeFolder(root);
    const base = { v: 1, type: RECORD_TYPE, source: 'openhands', origin: 'historical-export', sourceSha256: 'b'.repeat(64), idSource: 'export', verb: 'execute_bash', importedAt: '2026-01-01T00:00:00.000Z', summary: 's' };
    const recs = [
      { ...base, importKey: '1'.repeat(64), kind: 'action', severity: 'catastrophic' },
      { ...base, importKey: '2'.repeat(64), kind: 'action', severity: 'high', artifactPath: 'C:/x.txt' },
      { ...base, importKey: '3'.repeat(64), kind: 'teleport', severity: 'info' },
      { ...base, importKey: 'not-a-hash', kind: 'action', severity: 'info' },
    ].map((r) => ({ ...r, sig: signRecord(key, folder, r) }));
    fs.mkdirSync(path.dirname(evidencePath(root)), { recursive: true });
    fs.writeFileSync(evidencePath(root), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const read = new OpenHandsEvidenceReader(keys, () => [folderRef(root)]).read();
    assert.equal(read.entries.length, 2);
    assert.equal(read.skipped, 2);
    assert.deepEqual(read.entries.map((e) => e.severity).sort(), ['error', 'info']);
    assert.ok(read.entries.every((e) => e.artifactPath === undefined && e.category === 'imported'));
  });

  test('a Secret Storage that fails makes the import refuse with nothing written', async () => {
    const root = workspace();
    const secrets = new AutoSecrets();
    secrets.failGet = true;
    const keys = new EvidenceKeyHolder(secrets.context());
    await assert.rejects(importInto(root, [SDK('s')], keys), new RegExp(SECRET_STORAGE_REFUSAL));
    assert.equal(fs.existsSync(evidencePath(root)), false);
    assert.equal(fs.existsSync(`${evidencePath(root)}.lock`), false);
  });

  test('canonical JSON sorts keys recursively and drops undefined', () => {
    assert.equal(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: undefined } }), '{"a":{"d":[2,{"y":2,"z":1}]},"b":1}');
  });
});

// ---- O16: key lifecycle under pinned orders -----------------------------------------------

function countingFs(): { fsx: FsOps; opens: () => number } {
  let n = 0;
  return {
    opens: () => n,
    fsx: {
      statSync: (p) => fs.statSync(p),
      openSync: (p, f) => { n++; return fs.openSync(p, f); },
      readSync: (fd, b, o, l, p) => fs.readSync(fd, b, o, l, p),
      closeSync: (fd) => fs.closeSync(fd),
    },
  };
}

suite('OpenHands evidence key lifecycle (#477 O16)', () => {
  test('O16a race: both find no key, A stores KA, B stores KB, both sign with KB; all four records verify, before and after reload', async () => {
    const S = new PinnedSecrets();
    const F1 = workspace(); const F2 = workspace();
    const A = new EvidenceKeyHolder(S.context('A'));
    const B = new EvidenceKeyHolder(S.context('B'));
    void A.loadKey(); void B.loadKey();
    await S.get('A'); await S.get('B');                     // activation reads: none
    const ia = importInto(F1, [SDK('a1'), SDK('a2')], A);
    const ib = importInto(F2, [SDK('b1'), SDK('b2')], B);
    await S.get('A'); await S.get('B');                     // ensureKey reads: none
    await S.store('A'); await S.store('B');                 // KA, then KB
    for (const c of ['A', 'A', 'B', 'B']) { await S.deliver(c); await S.get(c); } // reloads -> KB
    await S.get('A'); await S.get('B');                     // under-lock reads -> KB
    await ia; await ib;
    const folders = () => [folderRef(F1), folderRef(F2)];
    assert.equal(new OpenHandsEvidenceReader(A, folders).read().entries.length, 4);
    assert.equal(new OpenHandsEvidenceReader(B, folders).read().entries.length, 4);
    const C = new EvidenceKeyHolder(S.context('C'));
    const D = new EvidenceKeyHolder(S.context('D'));
    void C.loadKey(); void D.loadKey();
    await S.get('C'); await S.get('D');
    assert.equal(new OpenHandsEvidenceReader(C, folders).read().entries.length, 4);
    assert.equal(new OpenHandsEvidenceReader(D, folders).read().entries.length, 4);
    const exp = writeExport(F1, [SDK('a1'), SDK('a2')]);
    const repeat = persistOpenHandsObservations(F1, exp.file, exp.bytes, records([SDK('a1'), SDK('a2')]), { keys: B });
    await S.get('B'); await S.get('B');                     // ensureKey + under-lock
    assert.equal((await repeat).imported, 0);
    S.assertDrained({ A: 5, B: 7, C: 1, D: 1 });
  });

  test('O16b sequential: B reads A\'s key instead of creating one', async () => {
    const S = new PinnedSecrets();
    const F1 = workspace(); const F2 = workspace();
    const A = new EvidenceKeyHolder(S.context('A'));
    const B = new EvidenceKeyHolder(S.context('B'));
    void A.loadKey(); void B.loadKey();
    await S.get('A'); await S.get('B');
    const ia = importInto(F1, [SDK('a1'), SDK('a2')], A);
    await S.get('A'); await S.store('A');
    await S.deliver('A'); await S.get('A'); await S.deliver('B'); await S.get('B');
    await S.get('A'); await ia;
    const ib = importInto(F2, [SDK('b1'), SDK('b2')], B);
    await S.get('B'); await S.get('B'); await ib;
    const folders = () => [folderRef(F1), folderRef(F2)];
    const C = new EvidenceKeyHolder(S.context('C'));
    void C.loadKey(); await S.get('C');
    for (const h of [A, B, C]) assert.equal(new OpenHandsEvidenceReader(h, folders).read().entries.length, 4);
    S.assertDrained({ A: 4, B: 4, C: 1 });
  });

  test('O16c no change events at all: the signing key is the under-lock read', async () => {
    const S = new PinnedSecrets();
    const F1 = workspace(); const F2 = workspace();
    const A = new EvidenceKeyHolder(S.context('A'));
    const B = new EvidenceKeyHolder(S.context('B'));
    void A.loadKey(); void B.loadKey();
    await S.get('A'); await S.get('B');
    const ia = importInto(F1, [SDK('a1'), SDK('a2')], A);
    const ib = importInto(F2, [SDK('b1'), SDK('b2')], B);
    await S.get('A'); await S.get('B');
    await S.store('A'); await S.store('B');                 // events never delivered
    await S.get('A'); await S.get('B');
    await ia; await ib;
    const C = new EvidenceKeyHolder(S.context('C'));
    void C.loadKey(); await S.get('C');
    assert.equal(new OpenHandsEvidenceReader(C, () => [folderRef(F1), folderRef(F2)]).read().entries.length, 4);
    S.assertDrained({ A: 3, B: 3, C: 1 });
  });

  test('O16d a window that only reads picks up the new key and drops its cache', async () => {
    const S = new PinnedSecrets();
    const F = workspace();
    const A = new EvidenceKeyHolder(S.context('A'));
    const B = new EvidenceKeyHolder(S.context('B'));
    void A.loadKey(); void B.loadKey();
    await S.get('A'); await S.get('B');
    const ib = importInto(F, [SDK('b1'), SDK('b2')], B);
    await S.get('B'); await S.store('B'); await S.get('B');
    await ib;                                               // written, lock released; events held back
    const spy = countingFs();
    const reader = new OpenHandsEvidenceReader(A, () => [folderRef(F)], spy.fsx);
    const first = reader.read();
    assert.deepEqual([first.entries.length, spy.opens()], [0, 1], 'read the file and cached the empty result');
    await S.deliver('A'); await S.get('A');                 // A re-reads -> KB
    const second = reader.read();
    assert.equal(second.entries.length, 2);
    assert.equal(spy.opens(), 2, 'exactly two reads: the cache was cleared by the key change');
    S.assertDrained({ A: 2, B: 3 });
  });

  test('O16e a verified line copied into another folder does not verify there', async () => {
    const S = new PinnedSecrets();
    const F1 = workspace(); const F2 = workspace();
    const A = new EvidenceKeyHolder(S.context('A'));
    void A.loadKey(); await S.get('A');
    const ia = importInto(F1, [SDK('c1')], A);
    await S.get('A'); await S.store('A'); await S.deliver('A'); await S.get('A'); await S.get('A');
    await ia;
    fs.mkdirSync(path.dirname(evidencePath(F2)), { recursive: true });
    fs.copyFileSync(evidencePath(F1), evidencePath(F2));
    const read = new OpenHandsEvidenceReader(A, () => [folderRef(F2)]).read();
    assert.deepEqual([read.entries.length, read.unverified], [0, 1]);
    S.assertDrained({ A: 4 });
  });

  test('O16f the same verified line twice is shown once', async () => {
    const S = new PinnedSecrets();
    const F = workspace();
    const A = new EvidenceKeyHolder(S.context('A'));
    void A.loadKey(); await S.get('A');
    const ia = importInto(F, [SDK('f1')], A);
    await S.get('A'); await S.store('A'); await S.deliver('A'); await S.get('A'); await S.get('A');
    await ia;
    const line = fs.readFileSync(evidencePath(F), 'utf8');
    fs.appendFileSync(evidencePath(F), line);
    assert.equal(new OpenHandsEvidenceReader(A, () => [folderRef(F)]).read().entries.length, 1);
    S.assertDrained({ A: 4 });
  });

  test('O16g an import waits for a pending activation read; a hung or emptied under-lock read refuses and releases the lock', async () => {
    const S = new PinnedSecrets();
    const F = workspace();
    const t = manualTimer();
    const A = new EvidenceKeyHolder(S.context('A'), { timer: t.timer });
    void A.loadKey();                                       // activation read still pending
    const ia = importInto(F, [SDK('g1')], A);
    await S.get('A'); await S.get('A');                     // activation, then ensureKey: none
    await S.store('A'); await S.deliver('A'); await S.get('A'); await S.get('A');
    assert.equal((await ia).imported, 1);

    const hung = importInto(F, [SDK('g2')], A);
    await S.get('A');                                       // ensureKey: key exists
    await S.hang('A');                                      // under-lock read never answers
    t.fire();
    await assert.rejects(hung, new RegExp(SECRET_STORAGE_REFUSAL));
    assert.equal(fs.existsSync(`${evidencePath(F)}.lock`), false);

    const emptied = importInto(F, [SDK('g3')], A);
    await S.get('A');                                       // ensureKey: key exists
    await S.get('A', { value: undefined });                 // the entry was deleted in between
    await assert.rejects(emptied, new RegExp(SECRET_STORAGE_REFUSAL));
    assert.equal(fs.existsSync(`${evidencePath(F)}.lock`), false);
    assert.equal(lines(F).length, 1, 'only g1 was ever written');
    S.assertDrained({ A: 8 });
  });
});

// ---- review delta (plan-v608-laneB-delta-review) ------------------------------------

const EV = (id: string, tool = 'execute_bash') => ({ id, timestamp: '2026-10-10T10:00:00Z', action: { kind: 'ExecuteBashAction' }, tool_name: tool });

async function importEnvelope(root: string, env: Record<string, unknown>, keys: EvidenceKeyHolder) {
  const bytes = Buffer.from(JSON.stringify(env));
  const file = path.join(root, `run-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, bytes);
  const recs = observeOpenHandsRun(env.events, '1.0.0').records;
  return persistOpenHandsObservations(root, file, bytes, recs, { keys, runId: runIdentityOf(env) });
}

suite('OpenHands run-scoped deduplication (#477 delta D1)', () => {
  const pair = async (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const root = workspace();
    const { keys } = autoKeys();
    const events = [EV('e0'), EV('e1')];
    const first = await importEnvelope(root, { ...a, events }, keys);
    const second = await importEnvelope(root, { ...b, events, note: 'second file' }, keys);
    return { first: first.imported, second: second.imported, root };
  };

  test('two different runs (UUID conversation ids) with the same string ids both import', async () => {
    const r = await pair({ conversation_id: randomUUID() }, { conversation_id: randomUUID() });
    assert.deepEqual([r.first, r.second], [2, 2]);
    assert.ok(lines(r.root).every((l) => l.v === 2 && typeof l.runId === 'string'));
  });

  test('the same run re-exported with one more event imports only the new one', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    const conversation_id = randomUUID();
    await importEnvelope(root, { conversation_id, events: [EV('e0'), EV('e1')] }, keys);
    assert.equal((await importEnvelope(root, { conversation_id, events: [EV('e0'), EV('e1'), EV('e2')] }, keys)).imported, 1);
  });

  test('integer ids with no run identity are file-scoped: two runs both import', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    const ints = [{ ...EV('x'), id: 0 }, { ...EV('x'), id: 1 }];
    assert.equal((await importEnvelope(root, { events: ints }, keys)).imported, 2);
    assert.equal((await importEnvelope(root, { events: ints, note: 'other run' }, keys)).imported, 2);
  });

  test('a named field below the 8-character floor ("1", "default") is not a run identity', async () => {
    const one = await pair({ conversation_id: '1' }, { conversation_id: '1' });
    assert.deepEqual([one.first, one.second], [2, 2]);
    const dflt = await pair({ conversation_id: 'default' }, { conversation_id: 'default' });
    assert.deepEqual([dflt.first, dflt.second], [2, 2]);
  });

  test('a named field of exactly 8 characters is a run identity (the second export of that run imports 0)', async () => {
    const r = await pair({ conversation_id: 'abcdefgh' }, { conversation_id: 'abcdefgh' });
    assert.deepEqual([r.first, r.second], [2, 0]);
  });

  test('the generic id field needs a UUID or 16+ hex: "untitled-run" is not a run identity', async () => {
    const r = await pair({ id: 'untitled-run' }, { id: 'untitled-run' });
    assert.deepEqual([r.first, r.second], [2, 2]);
    assert.equal(runIdentityOf({ id: 'a1b2c3d4e5f60718' }), 'a1b2c3d4e5f60718');
    assert.equal(runIdentityOf({ id: 42 }), undefined, 'numbers never count');
  });

  test('disagreeing qualified fields mean no run identity: the import is file-scoped', async () => {
    const env = { conversation_id: randomUUID(), session_id: randomUUID() };
    assert.equal(runIdentityOf(env), undefined);
    const r = await pair(env, env);
    assert.deepEqual([r.first, r.second], [2, 2]);
  });

  test('a crafted export without a run identity cannot pre-claim a real run\'s string ids', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    await importEnvelope(root, { events: [EV('e0'), EV('e1')] }, keys);
    assert.equal((await importEnvelope(root, { conversation_id: randomUUID(), events: [EV('e0'), EV('e1')] }, keys)).imported, 2);
  });
});

suite('OpenHands link refusal on every write path (#477 delta D2)', () => {
  test('a linked .failsafe is refused before mkdir, so no logs folder appears at the link target', async () => {
    const root = workspace();
    const outside = workspace();
    const { keys } = autoKeys();
    fs.symlinkSync(outside, path.join(root, '.failsafe'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(fs.lstatSync(path.join(root, '.failsafe')).isSymbolicLink(), true, 'the link exists');
    await assert.rejects(importInto(root, [SDK('m')], keys), /OPENHANDS_IMPORT_SYMLINK/);
    assert.equal(fs.existsSync(path.join(outside, 'logs')), false);
  });

  test('a hard-linked transparency.jsonl refuses the summary; the events are saved and the outside file is unchanged', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    fs.mkdirSync(path.join(root, '.failsafe', 'logs'), { recursive: true });
    // Same volume as the workspace (both under os.tmpdir()): a cross-volume hard link fails with EXDEV.
    const outsideDir = workspace();
    const outside = path.join(outsideDir, 'victim.jsonl');
    fs.writeFileSync(outside, 'untouched\n');
    fs.linkSync(outside, path.join(root, '.failsafe', 'logs', 'transparency.jsonl'));
    assert.equal(fs.statSync(outside).nlink, 2, 'the hard link exists');
    const r = await importInto(root, [SDK('h1')], keys);
    assert.equal(r.imported, 1);
    assert.equal(r.summaryWritten, false);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'untouched\n');
  });

  test('a symlinked transparency.jsonl refuses the summary (POSIX)', async function () {
    if (process.platform === 'win32') { this.skip(); return; } // a file symlink needs Developer Mode on win32
    const root = workspace();
    const { keys } = autoKeys();
    fs.mkdirSync(path.join(root, '.failsafe', 'logs'), { recursive: true });
    const outside = path.join(workspace(), 'victim.jsonl');
    fs.writeFileSync(outside, 'untouched\n');
    fs.symlinkSync(outside, path.join(root, '.failsafe', 'logs', 'transparency.jsonl'), 'file');
    const r = await importInto(root, [SDK('s1')], keys);
    assert.equal(r.summaryWritten, false);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'untouched\n');
  });
});

suite('OpenHands evidence reads (#477 delta D6b, D6f)', () => {
  test('D6b deduplication over 30,000 records never reads the evidence file whole', async function () {
    this.timeout(120000);
    const root = workspace();
    const { keys } = autoKeys();
    const raw = Array.from({ length: 30000 }, (_, i) => SDK(`b${i}`));
    const exp = writeExport(root, raw);
    assert.equal((await importInto(root, raw, keys, exp)).imported, 30000);
    // Patched on the real module object: the TS namespace import is getter-only,
    // and the importer's own namespace import reads through to this object.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const realFs = require('fs') as { readFileSync: unknown };
    const realRead = fs.readFileSync;
    const target = evidencePath(root);
    let blocked = 0;
    realFs.readFileSync = ((p: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(p) === target) blocked++;
      if (String(p) === target) throw new Error('the evidence file was read whole');
      return (realRead as (...a: unknown[]) => unknown)(p, ...rest);
    }) as unknown;
    try {
      const again = await importInto(root, raw, keys, exp);
      assert.deepEqual([again.imported, again.duplicates, blocked], [0, 30000, 0]);
    } finally {
      realFs.readFileSync = realRead;
    }
  });

  test('D6f a multi-byte character across the 64 KiB tail-chunk boundary reads back verified', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    await keys.ensureKey(); await keys.loadKey();
    const key = keys.current()!;
    const folder = normalizeFolder(root);
    let m = 65000;
    let line = '';
    for (let i = 0; i < 6; i++) {
      const rec: Record<string, unknown> = {
        v: 2, type: RECORD_TYPE, source: 'openhands', origin: 'historical-export', importKey: 'c'.repeat(64), sourceSha256: 'd'.repeat(64),
        idSource: 'export', kind: 'observation', verb: 'read', severity: 'info', importedAt: '2026-01-01T00:00:00.000Z',
        summary: 'a'.repeat(70000) + '\u00e9' + 'b'.repeat(m),
      };
      rec.sig = signRecord(key, folder, rec);
      line = JSON.stringify(rec) + '\n';
      const buf = Buffer.from(line, 'utf8');
      const tail = buf.length - (buf.indexOf(Buffer.from('\u00e9', 'utf8')) + 1); // bytes after the first byte of the character
      if (tail === 65536) break;
      m += 65536 - tail;
    }
    const buf = Buffer.from(line, 'utf8');
    assert.equal(buf.length - (buf.indexOf(Buffer.from('\u00e9', 'utf8')) + 1), 65536, 'the character straddles the boundary');
    fs.mkdirSync(path.dirname(evidencePath(root)), { recursive: true });
    fs.writeFileSync(evidencePath(root), buf);
    const read = new OpenHandsEvidenceReader(keys, () => [folderRef(root)]).read();
    assert.deepEqual([read.entries.length, read.unverified], [1, 0]);
  });

  test('D6f severity keeps three tiers: high is error, warn is warning', async () => {
    const root = workspace();
    const { keys } = autoKeys();
    const warn = { id: 't-warn', timestamp: '2026-10-10T10:00:00Z', source: 'agent', action: { kind: 'FileEditAction' }, tool_name: 'str_replace_editor' };
    await importInto(root, [SDK('t-high'), warn], keys);
    await keys.loadKey();
    const read = new OpenHandsEvidenceReader(keys, () => [folderRef(root)]).read();
    assert.deepEqual(read.entries.map((e) => e.severity).sort(), ['error', 'warning']);
  });
});

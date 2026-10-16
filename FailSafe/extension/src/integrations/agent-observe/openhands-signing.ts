/**
 * openhands-signing — binds OpenHands evidence records to this VS Code install
 * and workspace folder (#477).
 *
 * The evidence file lives in the workspace, so a cloned repository, a pulled
 * change or a copied folder could otherwise ship records this install never
 * wrote. Every record line therefore carries an HMAC-SHA256 under a 32-byte key
 * kept in VS Code Secret Storage, over the folder's normalized real path and the
 * record's canonical JSON. A line that does not verify is ignored and counted.
 * This binds records to this install and folder; it is not tamper-proofing
 * against the person using it: whoever can read the Secret Storage entry can
 * sign forged records.
 *
 * Key lifecycle:
 *  - activation only reads the key (`loadKey`), into memory;
 *  - `ensureKey` (before the importer takes its lock) reads it and creates and
 *    stores one only when none exists;
 *  - the key that signs is the value read under the lock (`readUnderLock`),
 *    with a timeout; an empty, malformed or timed-out read refuses the import;
 *  - Secret Storage change events re-read the key into memory, then notify
 *    listeners (the reader clears its cache only after the new key is held).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as fs from 'fs';

export const EVIDENCE_KEY_ID = 'failsafe.openhandsEvidenceKey.v1';
export const UNDER_LOCK_TIMEOUT_MS = 2000;
const KEY_RE = /^[0-9a-f]{64}$/;
const DOMAIN = 'failsafe-openhands-evidence-v1';

export const SECRET_STORAGE_REFUSAL = 'FailSafe cannot reach Secret Storage to sign the evidence; nothing was written';

export class EvidenceKeyError extends Error {
  constructor() { super(SECRET_STORAGE_REFUSAL); }
}

export interface Disposable { dispose(): void }

export interface SecretsLike {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  onDidChange(listener: (e: { key: string }) => void): Disposable;
}

/** Recursively sorted keys, no whitespace: the one serialization writer and reader share. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The folder bound into each signature: the workspace folder whose
 * `.failsafe/logs` holds the file, as its real path with forward slashes,
 * lower-cased on win32 only (darwin volumes can be case-sensitive).
 */
export function normalizeFolder(folder: string, platform: NodeJS.Platform = process.platform): string {
  let real = folder;
  try { real = fs.realpathSync.native(folder); } catch { /* a missing folder keeps its given path */ }
  const slashed = real.replace(/\\/g, '/');
  return platform === 'win32' ? slashed.toLowerCase() : slashed;
}

function macInput(folder: string, record: Record<string, unknown>): string {
  const { sig: _sig, ...rest } = record;
  return `${DOMAIN}\n${folder}\n${canonicalJson(rest)}`;
}

export function signRecord(key: string, folder: string, record: Record<string, unknown>): string {
  return createHmac('sha256', Buffer.from(key, 'hex')).update(macInput(folder, record), 'utf8').digest('hex');
}

export function verifyRecord(key: string | undefined, folder: string, record: Record<string, unknown>): boolean {
  if (!key || typeof record.sig !== 'string') return false;
  const expected = Buffer.from(signRecord(key, folder, record), 'utf8');
  const given = Buffer.from(record.sig, 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type Timer = (ms: number, fire: () => void) => () => void;
const realTimer: Timer = (ms, fire) => { const t = setTimeout(fire, ms); return () => clearTimeout(t); };

function withTimeout<T>(p: PromiseLike<T>, ms: number, timer: Timer): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = timer(ms, () => reject(new EvidenceKeyError()));
    Promise.resolve(p).then((v) => { cancel(); resolve(v); }, (e) => { cancel(); reject(e); });
  });
}

export class EvidenceKeyHolder {
  private key: string | undefined;
  private loaded = false;
  private loading: Promise<void> | undefined;
  private readonly listeners: Array<() => void> = [];
  private readonly subscription: Disposable;

  constructor(
    private readonly secrets: SecretsLike,
    private readonly opts: { timeoutMs?: number; timer?: Timer } = {},
  ) {
    this.subscription = secrets.onDidChange((e) => {
      if (e.key !== EVIDENCE_KEY_ID) return;
      void this.reload();
    });
  }

  /** The key held in memory (what the synchronous reader uses). */
  current(): string | undefined { return this.key; }

  /** True once the activation read has resolved. */
  isLoaded(): boolean { return this.loaded; }

  /** Activation: read the key into memory; never creates one. */
  loadKey(): Promise<void> {
    if (!this.loading) {
      this.loading = Promise.resolve(this.secrets.get(EVIDENCE_KEY_ID)).then(
        (v) => { this.setKey(v); this.loaded = true; },
        () => { this.loaded = true; },
      );
    }
    return this.loading;
  }

  /** Before the importer's lock: read, and create + store a key only when none exists. */
  async ensureKey(): Promise<void> {
    try {
      const existing = await this.secrets.get(EVIDENCE_KEY_ID);
      if (existing && KEY_RE.test(existing)) return;
      await this.secrets.store(EVIDENCE_KEY_ID, randomBytes(32).toString('hex'));
    } catch {
      throw new EvidenceKeyError();
    }
  }

  /** Under the lock: the stored key, read once with a timeout. That value, and only it, signs. */
  async readUnderLock(): Promise<string> {
    let v: string | undefined;
    try {
      v = await withTimeout(this.secrets.get(EVIDENCE_KEY_ID), this.opts.timeoutMs ?? UNDER_LOCK_TIMEOUT_MS, this.opts.timer ?? realTimer);
    } catch {
      throw new EvidenceKeyError();
    }
    if (!v || !KEY_RE.test(v)) throw new EvidenceKeyError();
    this.setKey(v);
    return v;
  }

  /** Called after the in-memory key has changed. */
  onKeyChanged(listener: () => void): Disposable {
    this.listeners.push(listener);
    return { dispose: () => { const i = this.listeners.indexOf(listener); if (i >= 0) this.listeners.splice(i, 1); } };
  }

  dispose(): void { this.subscription.dispose(); }

  private async reload(): Promise<void> {
    try {
      this.setKey(await this.secrets.get(EVIDENCE_KEY_ID));
      this.loaded = true;
    } catch {
      // Keep the key we have; the next change event retries.
    }
  }

  private setKey(v: string | undefined): void {
    const next = v && KEY_RE.test(v) ? v : undefined;
    if (next === this.key) return;
    this.key = next;
    for (const l of [...this.listeners]) l();
  }
}

let holder: EvidenceKeyHolder | null = null;

/** Installed at activation (wireIntegrationEvidence); null until then. */
export function setOpenHandsEvidenceKeys(h: EvidenceKeyHolder | null): void { holder = h; }
export function getOpenHandsEvidenceKeys(): EvidenceKeyHolder | null { return holder; }

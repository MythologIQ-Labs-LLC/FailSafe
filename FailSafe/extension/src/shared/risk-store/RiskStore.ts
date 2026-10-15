/**
 * RiskStore - the one owner of every read-modify-write of
 * .failsafe/risks/risks.json (#517).
 *
 * mutate(fn) takes the cross-process lock, reads the register fresh, runs the
 * mutator once, and writes only if the document changed. Before every write
 * attempt it confirms the lock is still this holder's and that nothing else
 * changed the file since the read, so no writer can silently overwrite
 * another's update. An unreadable register is never replaced: a copy is kept
 * and the mutation is refused. Every top-level key and every record field is
 * written back as read.
 */

import * as fs from "fs";
import * as path from "path";
import { writeFileAtomicSync } from "../writeFileAtomic";
import {
  checkRiskDir,
  classify,
  readRegularFile,
  saveCorruptCopy,
  sha256,
  sweepOrphanTemps,
} from "./riskDocument";
import {
  RiskStoreError,
  RiskStoreErrorCode,
  asyncMutator,
  conflict,
  errorCode,
  unreadable,
  unsafePath,
  writeFailed,
} from "./riskStoreError";
import { acquireRiskLock, RiskLock } from "./riskStoreLock";

export { RiskStoreError } from "./riskStoreError";
export type { RiskStoreErrorCode } from "./riskStoreError";

export interface RiskDocument {
  risks: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export type RiskReadResult =
  | { state: "absent" }
  | { state: "ok"; doc: RiskDocument }
  | { state: "unreadable"; reason: string; code: RiskStoreErrorCode };

export interface RiskStoreOptions {
  lockTimeoutMs?: number;
  staleMs?: number;
}

/** @internal Test seams; not part of the public API. */
export interface RiskStoreSeams {
  now?: () => number;
  readRaw?: (file: string) => Buffer | null;
  randomSuffix?: () => string;
}

const DEFAULT_LOCK_TIMEOUT_MS = 6000;
const DEFAULT_STALE_MS = 5000;
const MIN_STALE_MS = 2000;
const READ_ATTEMPTS = 4;
const REREAD_MS = 50;
const WRITE_ATTEMPTS = 5;
const TRANSIENT = new Set(["EPERM", "EACCES", "EBUSY"]);

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof (value as { then?: unknown }).then === "function";
}

interface Loaded { doc: RiskDocument; raw: Buffer | null }

export class RiskStore {
  readonly risksPath: string;
  private readonly lockTimeoutMs: number;
  private readonly staleMs: number;
  private readonly readRaw: (file: string) => Buffer | null;
  private cache: { key: string; doc: RiskDocument } | null = null;
  private lastUnreadable: { hash: string; error: RiskStoreError } | null = null;

  static forWorkspace(workspaceRoot: string, opts: RiskStoreOptions = {}): RiskStore {
    return new RiskStore(workspaceRoot, opts);
  }

  constructor(
    private readonly workspaceRoot: string,
    opts: RiskStoreOptions = {},
    private readonly seams: RiskStoreSeams = {},
  ) {
    this.risksPath = path.resolve(workspaceRoot, ".failsafe", "risks", "risks.json");
    this.lockTimeoutMs = opts.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    this.staleMs = Math.max(opts.staleMs ?? DEFAULT_STALE_MS, MIN_STALE_MS);
    this.readRaw = seams.readRaw ?? readRegularFile;
  }

  /** Lock-free read for display. Never creates, copies or renames anything. */
  read(): RiskReadResult {
    try {
      if (checkRiskDir(this.workspaceRoot, false) === "absent") return { state: "absent" };
      const key = this.statKey();
      if (key === null) return { state: "absent" };
      if (this.cache?.key === key) return { state: "ok", doc: structuredClone(this.cache.doc) };
      const raw = this.readRaw(this.risksPath);
      if (raw === null) return { state: "absent" };
      const c = classify(raw);
      if (c.kind === "bad") return { state: "unreadable", reason: c.reason, code: "UNREADABLE" };
      const doc: RiskDocument = c.kind === "ok" ? c.doc : { risks: [] };
      this.cache = { key, doc };
      return { state: "ok", doc: structuredClone(doc) };
    } catch (error) {
      // Display reads never throw: any failure is unreadable, and an fs
      // error contributes only its code, never a path or file bytes.
      if (error instanceof RiskStoreError) {
        return { state: "unreadable", reason: error.message, code: error.code };
      }
      return { state: "unreadable", reason: errorCode(error), code: "UNREADABLE" };
    }
  }

  /**
   * Run fn against the fresh register under the lock and write the result if
   * it changed. fn runs exactly once and must be synchronous.
   */
  mutate<T>(fn: (doc: RiskDocument) => T): T {
    checkRiskDir(this.workspaceRoot, true);
    const lock = acquireRiskLock(this.risksPath, {
      timeoutMs: this.lockTimeoutMs,
      staleMs: this.staleMs,
      now: this.seams.now,
      ensureParent: () => checkRiskDir(this.workspaceRoot, true),
    });
    try {
      sweepOrphanTemps(this.risksPath, this.staleMs);
      const { doc, raw } = this.loadForMutation();
      const before = JSON.stringify(doc);
      const result = fn(doc);
      if (isThenable(result)) {
        Promise.resolve(result).catch(() => undefined);
        throw asyncMutator();
      }
      if (!Array.isArray(doc.risks)) {
        throw new TypeError("RiskStore.mutate: the mutator left risks as a non-array; nothing was written");
      }
      if (JSON.stringify(doc) === before) return result;
      doc.lastUpdated = new Date().toISOString();
      this.writeChecked(lock, raw, JSON.stringify(doc, null, 2));
      return result;
    } finally {
      this.cache = null;
      lock.release();
    }
  }

  private statKey(): string | null {
    try {
      const st = fs.lstatSync(this.risksPath, { bigint: true });
      return `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}`;
    } catch (error) {
      if (errorCode(error) === "ENOENT") return null;
      throw error;
    }
  }

  /** readRaw with every fs failure typed: the code only, no path. */
  private readTyped(onError: (code: string, error: unknown) => RiskStoreError): Buffer | null {
    try {
      return this.readRaw(this.risksPath);
    } catch (error) {
      if (error instanceof RiskStoreError) throw error;
      throw onError(errorCode(error), error);
    }
  }

  /** LD3 step 4 / LD5: a fresh register, or a refusal with a kept copy. */
  private loadForMutation(): Loaded {
    const load = (): Buffer | null => this.readTyped((code) => unreadable(code, null));
    let raw = load();
    if (raw === null) return { doc: { risks: [] }, raw: null };
    const firstHash = sha256(raw);
    if (this.lastUnreadable?.hash === firstHash) throw this.lastUnreadable.error;
    let c = classify(raw);
    for (let attempt = 1; c.kind === "bad" && attempt < READ_ATTEMPTS; attempt++) {
      sleepSync(REREAD_MS);
      raw = load();
      if (raw === null) return { doc: { risks: [] }, raw: null };
      c = classify(raw);
    }
    if (c.kind === "ok") return { doc: c.doc, raw };
    if (c.kind === "empty") return { doc: { risks: [] }, raw };
    throw this.refuseUnreadable(raw, c.reason);
  }

  private refuseUnreadable(raw: Buffer, reason: string): RiskStoreError {
    let nlink = 1n;
    try {
      nlink = fs.lstatSync(this.risksPath, { bigint: true }).nlink;
    } catch {
      nlink = 2n; // cannot confirm a single link: keep no copy
    }
    const bak = saveCorruptCopy(this.risksPath, raw, nlink, this.seams.randomSuffix);
    const rel = bak ? path.relative(this.workspaceRoot, bak).split(path.sep).join("/") : null;
    const error = unreadable(reason, rel);
    this.lastUnreadable = { hash: sha256(raw), error };
    return error;
  }

  /** LD3 step 8: lock check, path check and byte compare before each attempt. */
  private writeChecked(lock: RiskLock, raw: Buffer | null, text: string): void {
    for (let attempt = 1; ; attempt++) {
      lock.assertHeld();
      if (checkRiskDir(this.workspaceRoot, false) !== "ok") throw unsafePath();
      const current = this.readTyped((code, error) => writeFailed(code, error));
      const unchanged = current === null ? raw === null : raw !== null && current.equals(raw);
      if (!unchanged) throw conflict();
      try {
        writeFileAtomicSync(this.risksPath, text);
        return;
      } catch (error) {
        const code = errorCode(error);
        if (attempt >= WRITE_ATTEMPTS || !TRANSIENT.has(code)) throw writeFailed(code, error);
        sleepSync(100 * attempt);
      }
    }
  }
}

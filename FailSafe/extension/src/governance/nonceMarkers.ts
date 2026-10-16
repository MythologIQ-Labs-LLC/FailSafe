/**
 * nonceMarkers - one exclusive file per consumed nonce (v6.0.8 #472, review
 * delta LD-1).
 *
 * The store's lock cannot prove ownership: two processes that recover a
 * crashed holder's lock at the same moment can both come to hold it. A
 * consumption is therefore decided by the file system, not the lock: it
 * creates `nonces.consumed/<sha256 of the nonce>` with flag wx, and only the
 * process whose create succeeds may accept the nonce. A nonce with a marker is
 * used, whatever nonces.json says, so a consumption reverted there by a lost
 * update is still refused. This relies on exclusive create being atomic, as
 * the mkdir lock does (local NTFS, ext4, APFS, SMB2+; not NFSv2).
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { codeOf, fsyncDir, NonceStoreBusyError, TRANSIENT } from "./nonceStore";

/** Markers are kept this long past their nonce's expiry, like consumed records. */
export const MARKER_GRACE_MS = 60 * 60 * 1000;

/** @internal Test seam; production passes none. */
export interface MarkerSeams {
  /** Opens a new marker file (default: flag wx, mode 0o600). */
  openMarker?: (file: string) => number;
}

/** Another holder created this nonce's marker first: the nonce is used. */
export class NonceMarkerTakenError extends Error {
  constructor() {
    super("This nonce was already used.");
    this.name = "NonceMarkerTakenError";
  }
}

/** nonces.consumed is a link or not a folder: a store failure. */
export class NonceMarkerDirError extends Error {
  constructor(readonly dir: string) {
    super(`${dir} is a link or not a folder.`);
    this.name = "NonceMarkerDirError";
  }
}

export class NonceMarkers {
  constructor(readonly dir: string, private readonly seams: MarkerSeams = {}) {}

  /** True when the nonce has a marker. Never existsSync: it reads EPERM as absent. */
  has(nonce: string): boolean {
    if (!this.checkDir(false)) return false; // no folder yet: no markers
    try {
      fs.lstatSync(this.file(nonce));
      return true;
    } catch (error) {
      if (codeOf(error) === "ENOENT") return false;
      throw this.classify(error);
    }
  }

  /** Create the nonce's marker; NonceMarkerTakenError if it already exists. */
  create(nonce: string, expiresAt: number): void {
    this.checkDir(true);
    let fd: number;
    try {
      fd = (this.seams.openMarker ?? ((f: string) => fs.openSync(f, "wx", 0o600)))(this.file(nonce));
    } catch (error) {
      if (codeOf(error) === "EEXIST") throw new NonceMarkerTakenError();
      throw this.classify(error);
    }
    try {
      fs.writeFileSync(fd, JSON.stringify({ expiresAt }), "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fsyncDir(this.dir);
  }

  /** Delete markers once `now > expiresAt + MARKER_GRACE_MS`; unreadable ones stay. */
  sweep(now: number): number {
    if (!this.checkDir(false)) return 0;
    let removed = 0;
    for (const name of fs.readdirSync(this.dir)) {
      const file = path.join(this.dir, name);
      try {
        const { expiresAt } = JSON.parse(fs.readFileSync(file, "utf8")) as { expiresAt?: unknown };
        if (typeof expiresAt === "number" && now > expiresAt + MARKER_GRACE_MS) {
          fs.unlinkSync(file);
          removed++;
        }
      } catch {
        // Unreadable or already gone: left for a later sweep.
      }
    }
    return removed;
  }

  private file(nonce: string): string {
    return path.join(this.dir, crypto.createHash("sha256").update(nonce).digest("hex"));
  }

  /**
   * The marker folder must be a real folder, never a link or junction. False
   * when it does not exist (and `create` is false); with `create`, a missing
   * folder is made with a non-recursive mkdir and the store folder is fsynced.
   */
  private checkDir(create: boolean): boolean {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(this.dir);
    } catch (error) {
      if (codeOf(error) !== "ENOENT") throw this.classify(error);
      if (!create) return false;
      try { fs.mkdirSync(this.dir); } catch (e) { if (codeOf(e) !== "EEXIST") throw this.classify(e); }
      fsyncDir(path.dirname(this.dir));
      st = fs.lstatSync(this.dir);
    }
    if (st.isSymbolicLink() || !st.isDirectory()) throw new NonceMarkerDirError(this.dir);
    return true;
  }

  /** Transient errors are busy (this call refused, the guard stays on); others are failures. */
  private classify(error: unknown): Error {
    const code = codeOf(error);
    if (TRANSIENT.has(code)) return new NonceStoreBusyError("MARKER_BUSY", `A nonce marker could not be checked just now (${code}).`);
    return error instanceof Error ? error : new Error(String(error));
  }
}

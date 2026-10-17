/**
 * lockQueue - first-come, first-served order for waiters on a cross-process
 * file lock (v6.0.8 #528, LD-4).
 *
 * A waiter holds a ticket: an empty file in `<file>.queue` whose name starts
 * with the time it was taken, so names sort oldest first. A waiter with a
 * ticket tries the lock only while its ticket is the oldest live one, and a
 * caller that finds others queued takes a ticket before its first try, so a
 * writer coming back for its next update queues behind earlier waiters.
 *
 * The queue only orders attempts. Mutual exclusion stays with the lock
 * directory. Any queue failure (a link or file at the queue path, a deleted
 * or unwritable ticket, an unreadable directory) makes the caller continue
 * without a ticket, which is the unqueued behavior of v6.0.7. A ticket that
 * looks dead is skipped, so a crashed waiter, a clock jump or a coarse mtime
 * can cost fairness but never block the lock.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Logger } from "../Logger";

/** @internal Test seam (LD-4.8); production passes none. */
export interface QueueSeams {
  /** The mtime a liveness check sees for a ticket (default: the real one). */
  mtimeMs?: (ticketPath: string, realMtimeMs: number) => number;
}

/** Another waiter's ticket counts while refreshed within this window. */
const LIVE_MS = 1500;
/** A ticket dated further ahead than this is a leftover from a clock jump. */
const FUTURE_MS = 2000;
const CREATE_ATTEMPTS = 3;
const TRANSIENT = new Set(["EPERM", "EBUSY", "EACCES"]);
const logger = new Logger("LockQueue");

function codeOf(error: unknown): string {
  return (error as NodeJS.ErrnoException | undefined)?.code ?? "UNKNOWN";
}

export class LockQueue {
  private ticket: string | null = null;
  private disabled = false;
  private madeTicket = false;

  constructor(
    private readonly dir: string,
    private readonly staleMs: number,
    private readonly label: string,
    private readonly seams: QueueSeams = {},
  ) {}

  /** On arrival, queue behind anyone already waiting. */
  arrive(): void {
    if (this.liveTickets().length > 0) this.join();
  }

  /** Take a ticket (once per acquire). */
  join(): void {
    if (this.ticket || this.disabled) return;
    const name = `${String(Date.now()).padStart(15, "0")}-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
    for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
      try {
        if (!this.usableDir(true)) return;
        fs.writeFileSync(path.join(this.dir, name), "", { flag: "wx" });
        this.ticket = name;
        this.madeTicket = true;
        return;
      } catch (error) {
        // ENOENT: another waiter removed the empty queue directory just now.
        if (codeOf(error) !== "ENOENT" || attempt === CREATE_ATTEMPTS) return this.disable(error);
      }
    }
  }

  /** May this caller try the lock now? Without a ticket, or once patience ran out, always. */
  mayAttempt(patient: boolean): boolean {
    if (!this.ticket || patient) return true;
    return this.isHead();
  }

  /** True when this caller's ticket is the oldest live ticket. */
  isHead(): boolean {
    if (!this.ticket) return false;
    const live = this.liveTickets();
    return live.length > 0 && live[0] === this.ticket;
  }

  /** Keep this caller's ticket live. A ticket someone deleted means: continue unqueued. */
  refresh(): void {
    if (!this.ticket) return;
    try {
      const now = new Date();
      fs.utimesSync(path.join(this.dir, this.ticket), now, now);
    } catch (error) {
      if (TRANSIENT.has(codeOf(error))) return;
      this.ticket = null;
      this.disable(error);
    }
  }

  /** Drop the ticket, and the queue directory when it is empty. Never throws. */
  leave(): void {
    if (this.ticket) {
      try { fs.unlinkSync(path.join(this.dir, this.ticket)); } catch { /* already gone */ }
      this.ticket = null;
    }
    if (!this.madeTicket) return;
    try {
      if (this.usableDir(false)) fs.rmdirSync(this.dir);
    } catch {
      // ENOTEMPTY: others still queued. ENOENT: already removed.
    }
  }

  /** Names of live tickets, oldest first; this caller's own ticket is always live. */
  private liveTickets(): string[] {
    if (this.disabled) return [];
    let names: string[];
    try {
      if (!this.usableDir(false)) return [];
      names = fs.readdirSync(this.dir);
    } catch (error) {
      if (codeOf(error) === "ENOENT") return [];
      this.disable(error);
      return [];
    }
    return names.filter((name) => name === this.ticket || this.isLive(name)).sort();
  }

  /** Another waiter's ticket: live, ignored, or a leftover that is deleted. */
  private isLive(name: string): boolean {
    const file = path.join(this.dir, name);
    let mtime: number;
    try {
      mtime = fs.lstatSync(file).mtimeMs;
    } catch {
      return false;
    }
    if (this.seams.mtimeMs) mtime = this.seams.mtimeMs(file, mtime);
    const now = Date.now();
    if (mtime > now + FUTURE_MS || now - mtime > this.staleMs) {
      try { fs.unlinkSync(file); } catch { /* another waiter removed it */ }
      return false;
    }
    return now - mtime <= LIVE_MS;
  }

  /**
   * The queue path must be a real directory (never a link or junction); with
   * create, a missing one is made. False when absent; a queue failure otherwise.
   */
  private usableDir(create: boolean): boolean {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(this.dir);
    } catch (error) {
      if (codeOf(error) !== "ENOENT") throw error;
      if (!create) return false;
      try { fs.mkdirSync(this.dir); } catch (e) { if (codeOf(e) !== "EEXIST") throw e; }
      st = fs.lstatSync(this.dir);
    }
    if (st.isSymbolicLink() || !st.isDirectory()) {
      this.disable(Object.assign(new Error("the queue path is not a real directory"), { code: "ENOTDIR" }));
      return false;
    }
    return true;
  }

  private disable(error: unknown): void {
    if (!this.disabled) logger.warn(`${this.label} lock queue unavailable (${codeOf(error)}); waiting unqueued`);
    this.disabled = true;
  }
}

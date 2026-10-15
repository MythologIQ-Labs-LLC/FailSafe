/**
 * writeFileAtomicSync - replace a file so readers see the old bytes or the
 * new bytes, never a truncated mix (FX963).
 *
 * The data goes to a temp file in the same directory, is flushed to disk,
 * then renamed over the target. On Windows a rename can be refused briefly
 * while another process (an indexer, an antivirus scan, a reader in another
 * window) has the target open, so EPERM/EBUSY/EACCES are retried a few times.
 *
 * This closes torn writes. It does not serialize two writers: two processes
 * that read-modify-write the same file can still lose one update.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const RENAME_ATTEMPTS = 3;
const RENAME_RETRY_MS = 50;
const RETRYABLE = new Set(["EPERM", "EBUSY", "EACCES"]);

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (attempt >= RENAME_ATTEMPTS || !RETRYABLE.has(code)) throw error;
      sleepSync(RENAME_RETRY_MS);
    }
  }
}

export function writeFileAtomicSync(target: string, data: string): void {
  const dir = path.dirname(target);
  const tmp = path.join(
    dir,
    `.${path.basename(target)}.${crypto.randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, data, "utf8");
    const fd = fs.openSync(tmp, "r+");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    renameWithRetry(tmp, target);
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // The temp file is left behind only if it cannot be removed either;
      // the original error is the one the caller needs.
    }
    throw error;
  }
}

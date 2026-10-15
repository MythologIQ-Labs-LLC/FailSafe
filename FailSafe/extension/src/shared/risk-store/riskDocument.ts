/**
 * riskDocument - reading risks.json safely and keeping a copy of a corrupt
 * one (#517 LD3 step 0, LD5).
 *
 * Nothing here follows a link: the risks directory must resolve inside the
 * workspace, the register must be a regular file read through the handle
 * that was checked, and the saved copy of an unreadable register is written
 * only to a fresh, unpredictable name whose handle is checked before a byte
 * is written.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { errorCode, notRegularFile, unsafePath } from "./riskStoreError";

export type Classified =
  | { kind: "ok"; doc: Record<string, unknown> & { risks: Array<Record<string, unknown>> } }
  | { kind: "empty" }
  | { kind: "bad"; reason: string };

const CASE_FOLDING = process.platform === "win32" || process.platform === "darwin";
const TRANSIENT = new Set(["EPERM", "EACCES", "EBUSY"]);
const C = fs.constants as typeof fs.constants & { O_NOFOLLOW?: number; O_NONBLOCK?: number };
const NOFOLLOW = C.O_NOFOLLOW ?? 0;
const READ_FLAGS = C.O_RDONLY | NOFOLLOW | (C.O_NONBLOCK ?? 0);
const CREATE_FLAGS = C.O_WRONLY | C.O_CREAT | C.O_EXCL | NOFOLLOW;
const COPY_ATTEMPTS = 3;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function samePath(a: string, b: string): boolean {
  return CASE_FOLDING ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function exists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw unsafePath();
  }
}

function realpathOrUnsafe(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    throw unsafePath();
  }
}

/**
 * LD3 step 0. Each component (.failsafe, then .failsafe/risks) must resolve
 * to its own place under the workspace before the next one is created, so a
 * link can never make the store create a directory outside it. With create,
 * a missing component is made with a non-recursive mkdir. Returns "absent"
 * (check-only, a component is missing) or "ok"; throws UNSAFE_PATH otherwise.
 */
export function checkRiskDir(workspaceRoot: string, create: boolean): "ok" | "absent" {
  const root = realpathOrUnsafe(workspaceRoot);
  let rel = "";
  for (const part of [".failsafe", "risks"]) {
    rel = path.join(rel, part);
    const dir = path.join(workspaceRoot, rel);
    if (!exists(dir)) {
      if (!create) return "absent";
      try {
        fs.mkdirSync(dir);
      } catch (error) {
        if (errorCode(error) !== "EEXIST") throw unsafePath();
      }
    }
    if (!samePath(realpathOrUnsafe(dir), path.join(root, rel))) throw unsafePath();
  }
  return "ok";
}

/** Read a regular file through a checked handle; null when absent. */
export function readRegularFile(file: string): Buffer | null {
  for (let attempt = 1; ; attempt++) {
    try {
      return readRegularFileOnce(file);
    } catch (error) {
      if (attempt >= 5 || !TRANSIENT.has(errorCode(error))) throw error;
      sleepSync(20 * attempt);
    }
  }
}

function readRegularFileOnce(file: string): Buffer | null {
  let before: fs.BigIntStats;
  try {
    before = fs.lstatSync(file, { bigint: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
  // A hard link is a link too: its bytes may belong to a file elsewhere.
  if (!before.isFile() || before.nlink !== 1n) throw notRegularFile();
  let fd: number;
  try {
    fd = fs.openSync(file, READ_FLAGS);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT") return null;
    if (code === "ELOOP") throw notRegularFile();
    throw error;
  }
  try {
    const st = fs.fstatSync(fd, { bigint: true });
    if (!st.isFile() || st.nlink !== 1n || st.dev !== before.dev || st.ino !== before.ino) throw notRegularFile();
    return fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** The parse failure without the excerpt V8 quotes from the file (#517 review). */
function parseFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Unexpected end of JSON input/.test(message)) return "invalid JSON (unexpected end of input)";
  const name = error instanceof Error ? error.name : "SyntaxError";
  const at = /position (\d+)/.exec(message);
  return at ? `invalid JSON (${name} at position ${at[1]})` : `invalid JSON (${name})`;
}

export function classify(bytes: Buffer): Classified {
  const text = bytes.toString("utf8");
  if (text.trim() === "") return { kind: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { kind: "bad", reason: parseFailureReason(error) };
  }
  const obj = parsed as { risks?: unknown } | null;
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || !Array.isArray(obj.risks)) {
    return { kind: "bad", reason: "no risks array" };
  }
  return { kind: "ok", doc: obj as Record<string, unknown> & { risks: Array<Record<string, unknown>> } };
}

export function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function defaultRandomSuffix(): string {
  return crypto.randomBytes(6).toString("hex");
}

/** An existing copy with these exact bytes, read like risks.json itself. */
function findExistingCopy(dir: string, prefix: string, bytes: Buffer): string | null {
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith(prefix) || !name.endsWith(".bak")) continue;
    const full = path.join(dir, name);
    try {
      if (fs.lstatSync(full, { bigint: true }).nlink !== 1n) continue;
      const existing = readRegularFile(full);
      if (existing && existing.equals(bytes)) return full;
    } catch {
      continue;
    }
  }
  return null;
}

/** Write bytes into a brand-new file only if handle and name agree. */
function writeFresh(full: string, bytes: Buffer): boolean {
  let fd: number;
  try {
    fd = fs.openSync(full, CREATE_FLAGS, 0o600);
  } catch {
    return false;
  }
  try {
    const st = fs.fstatSync(fd, { bigint: true });
    let named: fs.BigIntStats;
    try {
      named = fs.lstatSync(full, { bigint: true });
    } catch {
      return false;
    }
    const fresh = (s: fs.BigIntStats): boolean => s.isFile() && s.nlink === 1n && s.size === 0n;
    if (!fresh(st) || !fresh(named) || st.dev !== named.dev || st.ino !== named.ino) return false;
    let offset = 0;
    while (offset < bytes.length) offset += fs.writeSync(fd, bytes, offset, bytes.length - offset);
    fs.fsyncSync(fd);
    return true;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * LD5 saved copy: risks.json.corrupt-HASH12-RAND12.bak. Returns the path, or
 * null when no copy could be saved safely.
 */
export function saveCorruptCopy(
  risksPath: string,
  bytes: Buffer,
  nlink: bigint,
  randomSuffix: () => string = defaultRandomSuffix,
): string | null {
  if (nlink > 1n) return null;
  const dir = path.dirname(risksPath);
  const prefix = `${path.basename(risksPath)}.corrupt-${sha256(bytes).slice(0, 12)}-`;
  try {
    const existing = findExistingCopy(dir, prefix, bytes);
    if (existing) return existing;
  } catch {
    // An unreadable directory listing only means no reuse.
  }
  for (let attempt = 0; attempt < COPY_ATTEMPTS; attempt++) {
    const full = path.join(dir, `${prefix}${randomSuffix()}.bak`);
    try {
      if (writeFresh(full, bytes)) return full;
    } catch {
      // A failed write is a failed copy; the refusal itself still stands.
    }
  }
  return null;
}

/** LD3 step 3: remove temps a dead holder left behind; never follow links. */
export function sweepOrphanTemps(risksPath: string, staleMs: number): void {
  const dir = path.dirname(risksPath);
  const prefix = `.${path.basename(risksPath)}.`;
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - staleMs;
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(".tmp")) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.lstatSync(full);
      if ((st.isFile() || st.isSymbolicLink()) && st.mtimeMs < cutoff) fs.unlinkSync(full);
    } catch {
      // EISDIR, EPERM, EBUSY, ENOENT: leave it for a later sweep.
    }
  }
}

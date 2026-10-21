// B330 — workspace containment for the Workspace › Taxonomy write targets
// (docs/roadmap/tracker-config.yaml and .failsafe/governance/tracker-taxonomy.directive.md).
//
// checkWriteTarget is the side-effect-free pre-check, run for BOTH targets before anything
// is read, created or written. writeContained is the write itself: the folder is prepared
// with the architecture bootstrap's preparedFolder (realpath checked before and after the
// mkdir), re-verified immediately before the open, and the opened file is identity-checked
// before a single byte is written. Node has no openat/O_NOFOLLOW for folders on Windows,
// so a folder swapped after the last check is narrowed, not eliminated (B332).

import * as fs from "fs";
import * as path from "path";
import { existingAncestorInside, preparedFolder } from "../../governance/architecture/ArchitectureIndexBootstrap";

export type TargetCode =
  | "unresolved-path" | "outside-workspace" | "not-a-folder" | "link-refused"
  | "not-a-file" | "hard-linked" | "no-file-identity";

export interface Identity { dev: bigint; ino: bigint }

export type TargetCheck =
  | { ok: true; present: boolean; isFile: boolean; identity?: Identity }
  | { ok: false; code: TargetCode; message: string };

/** Same file-system path: `path.relative` is case-insensitive on win32. */
export function samePath(a: string, b: string): boolean {
  return path.relative(a, b) === "";
}

const sameIdentity = (a: Identity, b: Identity): boolean => a.dev === b.dev && a.ino === b.ino;
const rel = (root: string, p: string): string => path.relative(root, p).split(path.sep).join("/");
const codeOf = (err: unknown): string | undefined => (err as NodeJS.ErrnoException)?.code;

/** Nearest existing ancestor of an absent file must be a folder (or a link to one). */
function ancestorIsFolder(file: string): string | null {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    let st: fs.Stats | undefined;
    try { st = fs.lstatSync(dir); } catch { /* keep walking up */ }
    if (st) return st.isDirectory() || st.isSymbolicLink() ? null : dir;
    if (path.dirname(dir) === dir) return null;
  }
}

/**
 * The side-effect-free pre-check (LD2), in this order: the folder's nearest existing
 * ancestor resolves (else `unresolved-path`) inside the real root (else
 * `outside-workspace`) and is a folder (else `not-a-folder`); the file is not a link
 * (`link-refused`), is a regular file when `kind` is "config" (`not-a-file`), has one
 * name (`hard-linked`) and a usable identity (`no-file-identity`). A directive that is
 * present but not a regular file passes; its open then fails (N-e).
 */
export function checkWriteTarget(rootReal: string, file: string, kind: "config" | "directive"): TargetCheck {
  const relFile = rel(rootReal, file);
  const where = existingAncestorInside(rootReal, path.dirname(file));
  if (where === "unresolved") return { ok: false, code: "unresolved-path", message: `${rel(rootReal, path.dirname(file))} could not be resolved` };
  if (where === "outside") return { ok: false, code: "outside-workspace", message: `${rel(rootReal, path.dirname(file))} resolves outside the workspace` };
  const notFolder = ancestorIsFolder(file);
  if (notFolder) return { ok: false, code: "not-a-folder", message: `${rel(rootReal, notFolder)} is not a folder` };
  let st: fs.BigIntStats;
  try { st = fs.lstatSync(file, { bigint: true }); } catch (err) {
    const code = codeOf(err);
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: true, present: false, isFile: false };
    return { ok: false, code: "unresolved-path", message: `${relFile} could not be resolved` };
  }
  if (st.isSymbolicLink()) return { ok: false, code: "link-refused", message: `${relFile} is a symbolic link; FailSafe does not follow it` };
  if (!st.isFile()) {
    if (kind === "config") return { ok: false, code: "not-a-file", message: `${relFile} exists but could not be read` };
    return { ok: true, present: true, isFile: false };
  }
  if (st.nlink > 1n) return { ok: false, code: "hard-linked", message: `${relFile} has other hard links; FailSafe does not read or write through it` };
  if (st.ino === 0n) return { ok: false, code: "no-file-identity", message: `${relFile} has no stable file identity on this volume; FailSafe cannot verify a write to it` };
  return { ok: true, present: true, isFile: true, identity: { dev: st.dev, ino: st.ino } };
}

export type WriteResult =
  | { ok: true }
  | { ok: false; race: boolean; detail: string };

/** Prepare a target's folder (LD3 a). Null: it does not stay inside the real root. */
export function prepareTargetFolder(rootReal: string, file: string): string | null {
  return preparedFolder(rootReal, file);
}

function writeAll(fd: number, bytes: Buffer): void {
  let off = 0;
  while (off < bytes.length) off += fs.writeSync(fd, bytes, off, bytes.length - off, off);
}

/**
 * Write `bytes` to `file` inside `preparedReal` (LD3 b-d). A race (folder or file changed
 * since the checks) answers `race: true`; any other I/O error `race: false`. Nothing is
 * written unless the opened file is the one that was checked (or was just created here).
 */
export function writeContained(rootReal: string, file: string, bytes: Buffer, pre: Extract<TargetCheck, { ok: true }>, preparedReal: string): WriteResult {
  const name = path.basename(file);
  // (b) the prepared folder is still the same real folder, immediately before the open.
  let folderNow: string;
  try { folderNow = fs.realpathSync.native(path.dirname(file)); } catch {
    return { ok: false, race: true, detail: `${rel(rootReal, path.dirname(file))} changed while saving` };
  }
  if (!samePath(folderNow, preparedReal)) return { ok: false, race: true, detail: `${rel(rootReal, path.dirname(file))} changed while saving` };
  const expectedReal = path.join(preparedReal, name);
  return pre.present ? overwrite(rootReal, file, bytes, pre, expectedReal) : create(rootReal, file, bytes, expectedReal);
}

/** (c) exclusive create; the new file must be where it was meant to be, with one name. */
function create(rootReal: string, file: string, bytes: Buffer, expectedReal: string): WriteResult {
  let fd: number;
  try { fd = fs.openSync(file, "wx"); } catch (err) {
    if (codeOf(err) === "EEXIST") return { ok: false, race: true, detail: `${rel(rootReal, file)} appeared while saving` };
    return { ok: false, race: false, detail: err instanceof Error ? err.message : String(err) };
  }
  let opened: fs.BigIntStats | undefined;
  let verified = false;
  try {
    opened = fs.fstatSync(fd, { bigint: true });
    const real = fs.realpathSync.native(file);
    const atPath = fs.lstatSync(file, { bigint: true });
    verified = samePath(real, expectedReal) && sameIdentity(atPath, opened) && opened.ino !== 0n && opened.nlink === 1n;
    if (verified) { writeAll(fd, bytes); return { ok: true }; }
  } catch (err) {
    if (verified) return { ok: false, race: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    fs.closeSync(fd);
  }
  // Not verified: remove the empty file only if the path still names the file opened here.
  let left = true;
  try {
    const now = fs.lstatSync(file, { bigint: true });
    if (opened && opened.ino !== 0n && sameIdentity(now, opened)) { fs.unlinkSync(file); left = false; }
  } catch { /* nothing at the path any more */ left = false; }
  const where = left ? `; an empty file was left at ${file}` : "";
  return { ok: false, race: true, detail: `${rel(rootReal, path.dirname(file))} changed while saving${where}` };
}

/** (d) overwrite in place; the opened file must be the one the pre-check saw, still at the
 *  expected real path with one name (the same post-open checks as create). An ENOENT at
 *  the open is a race (409 for the config): the file was removed since the pre-check. */
function overwrite(rootReal: string, file: string, bytes: Buffer, pre: Extract<TargetCheck, { ok: true }>, expectedReal: string): WriteResult {
  let fd: number;
  try { fd = fs.openSync(file, "r+"); } catch (err) {
    if (codeOf(err) === "ENOENT") return { ok: false, race: true, detail: `${rel(rootReal, file)} disappeared while saving` };
    return { ok: false, race: false, detail: err instanceof Error ? err.message : String(err) };
  }
  let verified = false;
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    const atPath = fs.lstatSync(file, { bigint: true });
    const real = fs.realpathSync.native(file);
    verified = !!pre.identity && sameIdentity(opened, pre.identity) && opened.nlink === 1n
      && sameIdentity(atPath, opened) && samePath(real, expectedReal);
  } catch { /* the path no longer resolves: a race */ }
  if (!verified) {
    fs.closeSync(fd);
    return { ok: false, race: true, detail: `${rel(rootReal, file)} changed while saving` };
  }
  try {
    fs.ftruncateSync(fd, 0);
    writeAll(fd, bytes);
    return { ok: true };
  } catch (err) {
    return { ok: false, race: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    fs.closeSync(fd);
  }
}

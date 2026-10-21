/**
 * Affected architecture decisions (B311, plan-b311-b312 LD5): which canonical or proposed registry
 * rows name a set of files, as warn-only lines for the L3 dialogs, the L3 panel and the governed
 * commit prompt.
 *
 * Matching is by string only: a row matches a file by its document path ("document") or by a safe,
 * non-pattern path in its contract or verification cell, whether or not that file exists. A
 * descriptive, superseded or historical row is never reported. Nothing here runs git, stats a
 * matched file or blocks: the index is read with async I/O (realpath, stat, one bounded read), the
 * only synchronous work is normalising the paths and parsing one index of at most 2 MiB, and the
 * whole call races a time budget. Cells over 4 KiB are not checked and are counted in a line.
 *
 * Every line is review text (hidden code points as [U+XXXX]; ids and domains as the reviewer sees
 * them) capped at 240 code points.
 */

import * as fs from "fs";
import * as path from "path";
import {
  CELL_LIMIT_BYTES, isInside, isParseFailure, MAX_DOC_BYTES, normalizeIndexPath,
} from "./ArchitectureIndexDiscovery";
import { capReview, cellValues, parseRegistryText, renderDomainForReview, reviewText, type RegistryRow } from "./architectureIndexCore";

/** Rows in these statuses are reported (proposed is intended, not yet accepted, authority). */
const REPORTED: ReadonlySet<string> = new Set(["canonical", "proposed"]);
export const AFFECTED_LINE_LIMIT = 240;
export const AFFECTED_DEFAULT_LINES = 5;
export const AFFECTED_BUDGET_MS = 1000;

export type AffectedVia = "document" | "contract" | "verification";

export interface AffectedRow {
  id: string;
  status: string;
  domain: string;
  docPath: string | null;
  via: AffectedVia;
}

export interface AffectedEntry {
  /** The path as given. */
  input: string;
  /** The workspace-relative POSIX path it was matched as. */
  rel: string;
  rows: AffectedRow[];
}

const onWindows = process.platform === "win32";
const keyOf = (rel: string): string => (onWindows ? rel.toLowerCase() : rel);

/** A path given relative to the workspace root, or absolute inside it, as a workspace-relative POSIX path; null when it escapes. */
function relativeInside(root: string, input: string): string | null {
  const abs = path.resolve(root, input.replace(/\\/g, "/"));
  if (!isInside(root, abs)) return null;
  const rel = path.relative(root, abs).split(path.sep).join("/");
  return rel === "" ? null : rel;
}

/** A cell with no backticked token and no markdown link holds no path value (the common `-` and `unknown`). */
const mayHoldPaths = (cell: string): boolean => cell.includes("`") || cell.includes("](");

/** Rows are indexed in slices of this many; describe yields to the event loop between slices. */
const SLICE_ROWS = 500;

interface PathIndex { byKey: Map<string, AffectedRow[]>; tooLong: number }

/** Add rows[from, to) to the path -> rows index (one pass over each cell). */
function indexRows(rows: RegistryRow[], from: number, to: number, linkBase: string, index: PathIndex): void {
  const { byKey } = index;
  for (let k = from; k < to; k += 1) {
    const r = rows[k];
    if (!REPORTED.has(r.status)) continue;
    const seen = new Set<string>();
    const add = (p: string, via: AffectedVia): void => {
      const key = keyOf(p);
      if (seen.has(key)) return;
      seen.add(key);
      const list = byKey.get(key) ?? [];
      list.push({ id: r.id, status: r.status, domain: r.domain, docPath: r.docPath, via });
      byKey.set(key, list);
    };
    if (r.docPath) add(r.docPath, "document");
    for (const via of ["contract", "verification"] as const) {
      const cell = r[via] ?? "";
      // A UTF-16 unit is at most 3 UTF-8 bytes, so only a cell over 1365 units can be over 4 KiB.
      if (cell.length > 1365 && Buffer.byteLength(cell, "utf8") > CELL_LIMIT_BYTES) { index.tooLong += 1; continue; }
      if (!mayHoldPaths(cell)) continue;
      for (const v of cellValues(cell, linkBase)) {
        if (v.kind === "path" && !/[*?]/.test(v.path)) add(v.path, via);
      }
    }
  }
}

/** Each given path's rows: one lookup per path in the index. */
function lookup(index: PathIndex, paths: string[], root: string): AffectedEntry[] {
  const entries: AffectedEntry[] = [];
  const given = new Set<string>();
  for (const input of paths) {
    if (typeof input !== "string" || input === "" || given.has(input)) continue;
    given.add(input);
    const rel = relativeInside(root, input);
    if (rel === null) continue;
    entries.push({ input, rel, rows: index.byKey.get(keyOf(rel)) ?? [] });
  }
  return entries;
}

/** Which canonical or proposed rows name each path (pure; escaping paths are dropped). */
export function affectedArchitecture(rows: RegistryRow[], paths: string[], root: string, linkBase: string): AffectedEntry[] {
  const index: PathIndex = { byKey: new Map(), tooLong: 0 };
  indexRows(rows, 0, rows.length, linkBase, index);
  return lookup(index, paths, root);
}

const nextTick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export type IndexRead =
  | { kind: "text"; text: string }
  | { kind: "absent" | "not-a-file" | "too-large" | "outside-workspace" };

/**
 * The index text through async I/O only: realpath of the root and the file, a stat, and one read
 * of at most the stat size + 1 bytes (at most MAX_DOC_BYTES + 1). A file that grew past its stat
 * size while being read is not parsed.
 */
export async function readIndexAsync(root: string, rel: string): Promise<IndexRead> {
  let rootReal: string;
  let real: string;
  try {
    rootReal = await fs.promises.realpath(root);
    real = await fs.promises.realpath(path.resolve(root, ...rel.split("/")));
  } catch {
    return { kind: "absent" };
  }
  if (!isInside(rootReal, real)) return { kind: "outside-workspace" };
  const st = await fs.promises.stat(real);
  if (!st.isFile()) return { kind: "not-a-file" };
  if (st.size > MAX_DOC_BYTES) return { kind: "too-large" };
  const handle = await fs.promises.open(real, "r");
  try {
    const buf = Buffer.allocUnsafe(st.size + 1);
    let n = 0;
    while (n < buf.length) {
      const { bytesRead } = await handle.read(buf, n, buf.length - n, n);
      if (bytesRead === 0) break;
      n += bytesRead;
    }
    if (n > st.size) throw new Error("the index changed while it was read");
    return { kind: "text", text: buf.subarray(0, n).toString("utf8") };
  } finally {
    await handle.close();
  }
}

export type AffectedState =
  | "ok" | "no-workspace" | "absent" | "bad-index-path" | "not-a-file" | "too-large" | "outside-workspace" | "invalid"
  | "timeout" | "error";

export interface AffectedDescription {
  state: AffectedState;
  /** At most `maxLines` match lines, then "and N more", then a cell-too-long line; or one "not checked" line. */
  lines: string[];
  /** Each given path's match lines (uncapped in number; each line capped). */
  byPath: Record<string, string[]>;
}

export interface AffectedContext {
  workspaceRoot: string | null | undefined;
  /** `failsafe.architecture.indexPath`. */
  indexPathSetting?: string;
  /** Accepted and never called: this path runs no git. */
  git?: unknown;
}

export interface AffectedOptions {
  maxLines?: number;
  budgetMs?: number;
  /** Seam: the index read (default readIndexAsync). */
  readIndex?: (root: string, rel: string) => Promise<IndexRead>;
}

const notChecked = (state: AffectedState): AffectedDescription =>
  ({ state, lines: [`Architecture authority not checked (${state}).`], byPath: {} });

/** One line: `<path>: <id> (<status>, "<domain>") <document>, via <document|contract|verification>`. */
export function affectedLine(rel: string, row: AffectedRow): string {
  return capReview(`${reviewText(rel)}: ${renderDomainForReview(row.id)} (${row.status}, "${renderDomainForReview(row.domain)}") ` +
    `${row.docPath === null ? "(no safe link)" : reviewText(row.docPath)}, via ${row.via}`, AFFECTED_LINE_LIMIT);
}

async function describe(ctx: AffectedContext, paths: string[], opts: AffectedOptions): Promise<AffectedDescription> {
  const root = ctx.workspaceRoot;
  if (!root) return { state: "no-workspace", lines: [], byPath: {} };
  const indexPath = normalizeIndexPath(ctx.indexPathSetting);
  if (!indexPath) return notChecked("bad-index-path");
  const read = await (opts.readIndex ?? readIndexAsync)(root, indexPath);
  if (read.kind === "absent") return { state: "absent", lines: [], byPath: {} };
  if (read.kind !== "text") return notChecked(read.kind);
  await nextTick();
  const parsed = parseRegistryText(read.text, indexPath);
  if (parsed.problems.some(isParseFailure)) return notChecked("invalid");
  // The parse is one synchronous call; indexing the rows yields between slices.
  const index: PathIndex = { byKey: new Map(), tooLong: 0 };
  const linkBase = path.posix.dirname(indexPath);
  for (let from = 0; from < parsed.rows.length; from += SLICE_ROWS) {
    await nextTick();
    indexRows(parsed.rows, from, Math.min(from + SLICE_ROWS, parsed.rows.length), linkBase, index);
  }
  const entries = lookup(index, paths, root);
  const tooLong = index.tooLong;
  const byPath: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  const all: string[] = [];
  for (const e of entries) {
    const lines = e.rows.map((r) => affectedLine(e.rel, r));
    if (lines.length) byPath[e.input] = lines;
    all.push(...lines);
  }
  const max = opts.maxLines ?? AFFECTED_DEFAULT_LINES;
  const lines = all.length > max ? [...all.slice(0, max), `and ${all.length - max} more`] : all;
  if (tooLong > 0) lines.push(`${tooLong} registry cell(s) over 4 KiB not checked (cell too long).`);
  return { state: "ok", lines, byPath };
}

/**
 * Warn-only lines for the files a decision or commit touches. Never throws and never runs past
 * `budgetMs` (default 1 s): past it, the answer is one "not checked (timeout)" line.
 */
export async function describeAffectedArchitecture(
  ctx: AffectedContext, paths: string[], opts: AffectedOptions = {},
): Promise<AffectedDescription> {
  if (!Array.isArray(paths) || paths.length === 0) return { state: "ok", lines: [], byPath: {} };
  let timer: NodeJS.Timeout | undefined;
  const budget = new Promise<AffectedDescription>((resolve) => {
    timer = setTimeout(() => resolve(notChecked("timeout")), opts.budgetMs ?? AFFECTED_BUDGET_MS);
  });
  try {
    return await Promise.race([describe(ctx, paths, opts).catch(() => notChecked("error")), budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

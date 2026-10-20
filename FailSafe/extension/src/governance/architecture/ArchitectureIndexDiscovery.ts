/**
 * Managed architecture index discovery (#531 LD3).
 *
 * Reads the workspace's architecture index (setting `failsafe.architecture.indexPath`,
 * default `docs/ARCHITECTURE_INDEX.md`), validates it with the user-repo profile, and lists
 * documents that match the architecture globs but have no registry row, each with string-based
 * suggestions. Read-only; a missing workspace, git or repository is a typed state, never a throw.
 *
 * The file list is `git ls-files -z -co --exclude-standard` through the trusted git resolver
 * (argv, no shell), filtered to files that exist: untracked documents are visible, ignored
 * folders are not, and a tracked file deleted from disk is dropped. Overlap is string comparison
 * and token suggestions only. See docs/architecture/MANAGED_ARCHITECTURE_INDEX.md.
 */

import { spawnSync } from "child_process";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { trustedGitPath, TrustedGitUnavailable } from "../../shared/git/trustedGit";
import {
  DEFAULT_INDEX_PATH, hasRegistryHeader, matchesGlob, suggestFor, userRepoProfile, validateIndex,
  type IndexProblem, type RegistryRow,
} from "./architectureIndexCore";

export type ArchitectureIndexState =
  | "present" | "present-with-problems" | "invalid" | "absent" | "present-elsewhere"
  | "bad-index-path" | "no-git" | "not-a-repo" | "no-workspace";

/** States in which an index exists; bootstrap answers reuse for every one of them. */
export const INDEX_PRESENT_STATES: ReadonlySet<ArchitectureIndexState> =
  new Set(["present", "present-with-problems", "invalid", "present-elsewhere"]);

export interface ArchitectureCandidate {
  path: string;
  suggestions: string[];
}

export interface SnapshotRow {
  id: string;
  domain: string;
  docPath: string | null;
  status: string;
  owner: string;
  supersedes: string;
  related: string;
  governanceRef: string;
  updatedBy: string;
  /** #531 slice 2: the row's 1-based line in the index file. */
  line: number;
  /** #531 slice 2: the document path is in the `ls-files -co` list (exists and is not ignored). */
  listed: boolean;
}

export interface ArchitectureIndexSnapshot {
  state: ArchitectureIndexState;
  /** The normalised setting value (or the raw value when refused). */
  indexPath: string;
  /** For present-elsewhere: the default-glob match that carries an index. */
  elsewherePath?: string;
  detail?: string;
  rows: SnapshotRow[];
  problems: IndexProblem[];
  candidates: ArchitectureCandidate[];
  normativeGlobs: string[];
  legacyGlobs: string[];
  checkedAt: string;
  /** #531 slice 2: SHA-256 of the index file's bytes, or null when no index was read. */
  indexSha256: string | null;
}

export type GitOutcome =
  | { kind: "ok"; stdout: string }
  | { kind: "exit"; status: number; stderr: string }
  | { kind: "unavailable"; detail: string };

export type ArchitectureGit = (root: string, args: string[]) => GitOutcome;

const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;
const MAX_DOC_BYTES = 2 * 1024 * 1024;

/** A git runner over a resolver (the trusted one by default; tests inject a failing one). */
export function makeArchitectureGit(resolve: (cwd: string) => string = trustedGitPath): ArchitectureGit {
  return (root, args) => {
    let exe: string;
    try {
      exe = resolve(root);
    } catch (e) {
      if (e instanceof TrustedGitUnavailable) return { kind: "unavailable", detail: e.message };
      throw e;
    }
    const r = spawnSync(exe, args, { // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- the trusted resolver's validated absolute git path, argv array, no shell
      cwd: root, encoding: "utf8", shell: false, windowsHide: true, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER,
    });
    if (r.error) return { kind: "unavailable", detail: r.error.message };
    if (r.status !== 0) return { kind: "exit", status: r.status ?? -1, stderr: String(r.stderr ?? "").trim() };
    return { kind: "ok", stdout: String(r.stdout ?? "") };
  };
}

export const defaultArchitectureGit: ArchitectureGit = makeArchitectureGit();

/** Workspace-relative POSIX index path, or null when absolute or escaping. Empty means the default. */
export function normalizeIndexPath(setting: string | undefined | null): string | null {
  const raw = String(setting ?? "").trim() || DEFAULT_INDEX_PATH;
  const s = raw.replace(/\\/g, "/");
  if (s.startsWith("/") || /^[A-Za-z]:/.test(s)) return null;
  const n = path.posix.normalize(s).replace(/^\.\//, "");
  if (n === "." || n === ".." || n.startsWith("../") || n.endsWith("/")) return null;
  return n;
}

/** True when `child` is `parent` or inside it (both absolute; Windows compares case-insensitively). */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Absolute real path of a workspace-relative file when it exists and resolves inside the workspace. */
export function resolveInsideWorkspace(root: string, rel: string): { abs: string; inside: boolean } | null {
  const abs = path.resolve(root, ...rel.split("/"));
  let real: string;
  try { real = fs.realpathSync.native(abs); } catch { return null; }
  let rootReal: string;
  try { rootReal = fs.realpathSync.native(root); } catch { return null; }
  return { abs: real, inside: isInside(rootReal, real) };
}

/** The file's text and the SHA-256 of its bytes (one read, so the hash is of what was parsed). */
function readInside(root: string, rel: string): { text: string; sha256: string } | null {
  const r = resolveInsideWorkspace(root, rel);
  if (!r || !r.inside) return null;
  try {
    const st = fs.statSync(r.abs);
    if (!st.isFile() || st.size > MAX_DOC_BYTES) return null;
    const bytes = fs.readFileSync(r.abs);
    return { text: bytes.toString("utf8"), sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch {
    return null;
  }
}

/** ls-files output: deduped, existing regular files only (`-c` lists tracked files deleted from disk). */
function listFiles(root: string, git: ArchitectureGit): { files: string[] } | { state: ArchitectureIndexState; detail: string } {
  const out = git(root, ["ls-files", "-z", "-co", "--exclude-standard"]);
  if (out.kind === "unavailable") return { state: "no-git", detail: out.detail };
  if (out.kind === "exit") return { state: "not-a-repo", detail: out.stderr.split(/\r?\n/)[0] ?? "" };
  const files = [...new Set(out.stdout.split("\0").filter(Boolean))].filter((p) => {
    try { return fs.statSync(path.join(root, p)).isFile(); } catch { return false; }
  });
  return { files: files.sort() };
}

function toSnapshotRow(r: RegistryRow, listed: ReadonlySet<string>): SnapshotRow {
  return {
    id: r.id, domain: r.domain, docPath: r.docPath, status: r.status, owner: r.owner, supersedes: r.supersedes,
    related: r.related, governanceRef: r.governance_ref, updatedBy: r.updated_by, line: r.line,
    listed: r.docPath !== null && listed.has(r.docPath),
  };
}

const isNormative = (p: string, globs: string[], legacy: string[]): boolean =>
  globs.some((g) => matchesGlob(g, p)) && !legacy.some((g) => matchesGlob(g, p));

const isParseFailure = (p: IndexProblem): boolean =>
  p.code === "missing-section" || (p.code === "bad-row" && p.detail.startsWith("registry header"));

const looksLikeIndex = (text: string): boolean => hasRegistryHeader(text) || /^```architecture-normative/m.test(text);

export interface DiscoveryOptions {
  workspaceRoot: string | null | undefined;
  indexPathSetting?: string;
  git?: ArchitectureGit;
  now?: () => Date;
}

export function discoverArchitectureIndex(opts: DiscoveryOptions): ArchitectureIndexSnapshot {
  const checkedAt = (opts.now ?? (() => new Date()))().toISOString();
  const indexPath = normalizeIndexPath(opts.indexPathSetting);
  const profile = userRepoProfile(indexPath ?? DEFAULT_INDEX_PATH);
  const base: ArchitectureIndexSnapshot = {
    state: "absent", indexPath: indexPath ?? String(opts.indexPathSetting ?? ""), rows: [], problems: [], candidates: [],
    normativeGlobs: profile.normativeGlobs, legacyGlobs: profile.legacyGlobs, checkedAt, indexSha256: null,
  };
  const root = opts.workspaceRoot;
  if (!root) return { ...base, state: "no-workspace" };
  if (!indexPath) return { ...base, state: "bad-index-path", detail: "the index path is absolute or leaves the workspace" };

  const listed = listFiles(root, opts.git ?? defaultArchitectureGit);
  if ("state" in listed) return { ...base, state: listed.state, detail: listed.detail };
  const files = listed.files;

  const located = resolveInsideWorkspace(root, indexPath);
  if (located && !located.inside) return { ...base, state: "bad-index-path", detail: "the index path resolves outside the workspace" };
  const index = located ? readInside(root, indexPath) : null;

  if (index === null) return discoverAbsent(root, base, files, profile.normativeGlobs, profile.legacyGlobs);

  const result = validateIndex({ indexText: index.text, readmeText: "", governanceText: "", tracked: files }, profile);
  const state: ArchitectureIndexState = result.problems.some(isParseFailure) ? "invalid"
    : result.problems.length ? "present-with-problems" : "present";
  const globs = result.globs.length ? result.globs : profile.normativeGlobs;
  const legacy = result.legacy.length ? result.legacy : profile.legacyGlobs;
  const listedFiles = new Set(files);
  const registered = new Set(result.rows.map((r) => r.docPath).filter(Boolean));
  const candidates = files
    .filter((p) => p !== indexPath && !registered.has(p) && isNormative(p, globs, legacy))
    .map((p) => ({ path: p, suggestions: suggestFor(p, result.rows) }));
  return {
    ...base, state, rows: result.rows.map((r) => toSnapshotRow(r, listedFiles)), problems: result.problems, candidates,
    normativeGlobs: globs, legacyGlobs: legacy, indexSha256: index.sha256,
  };
}

function discoverAbsent(
  root: string, base: ArchitectureIndexSnapshot, files: string[], globs: string[], legacy: string[],
): ArchitectureIndexSnapshot {
  const matches = files.filter((p) => isNormative(p, globs, legacy));
  // Overlap before bootstrapping: suggest among the other candidates (string tokens only).
  const peers = matches.map((p) => ({ docPath: p, domain: "", status: "descriptive" }));
  const candidates = matches.map((p) => ({ path: p, suggestions: suggestFor(p, peers.filter((x) => x.docPath !== p)) }));
  // Present-elsewhere looks only at default-glob matches (disclosed in the ADR).
  const elsewhere = matches.find((p) => {
    const read = readInside(root, p);
    return read !== null && looksLikeIndex(read.text);
  });
  if (elsewhere) return { ...base, state: "present-elsewhere", elsewherePath: elsewhere, candidates };
  return { ...base, state: "absent", candidates };
}

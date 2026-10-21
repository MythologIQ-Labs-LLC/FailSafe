/**
 * Architecture authority assessment (#531 slice 2, plan-531b LD4).
 *
 * A pure reading of a discovery snapshot: which rows claim authority for which domain, and where
 * that authority is missing or contradicted. Findings come from the validator's structured problem
 * fields and the rows, never from parsing `detail` text, and each one carries provenance: the index
 * line of every row, the SHA-256 of each document, the index hash and HEAD. The same inputs give the
 * same output apart from `checkedAt`.
 *
 * Kinds: conflicting-canonical, canonical-missing, dangling-supersession, domain-hidden-characters,
 * domain-non-ascii and unregistered-normative. Domains are compared by their declared string (the
 * domain key); similarity never creates or removes a finding. Read-only: git runs only through the
 * trusted runner (`rev-parse` here, `ls-files` in discovery) and nothing leaves the machine.
 */

import * as fs from "fs";
import {
  defaultArchitectureGit, MAX_DOC_BYTES, resolveInsideWorkspace, type ArchitectureGit, type ArchitectureIndexSnapshot,
  type ArchitectureIndexState, type CellPath, type CellPaths, type SnapshotRow,
} from "./ArchitectureIndexDiscovery";
import { sha256, sourceShaOf } from "./ArchitectureIndexBootstrap";
import { blankLinks, domainKey, hiddenCharacterProblem, INTAKE_CHARSET, matchesGlob, nonAsciiCodePoints } from "./architectureIndexCore";

export type AuthorityFindingKind =
  | "conflicting-canonical" | "canonical-missing" | "dangling-supersession"
  | "domain-hidden-characters" | "domain-non-ascii" | "unregistered-normative";

export type DocState = "present" | "not-on-disk" | "not-listed" | "outside-workspace" | "too-large" | "no-safe-link";

export interface AuthorityRowRef {
  id: string;
  status: string;
  domain: string;
  docPath: string | null;
  line: number;
  docSha256: string | null;
  docState: DocState;
}

export interface AuthorityFinding {
  kind: AuthorityFindingKind;
  domainKey?: string;
  /** canonical-missing: the doc state; dangling-supersession: unknown-id, no-successor or cycle. */
  reason?: string;
  detail: string;
  rows: AuthorityRowRef[];
  /** dangling-supersession unknown-id: the id `supersedes` names. */
  ref?: string;
  /** domain-hidden-characters and domain-non-ascii: the code points, as U+XXXX. */
  codePoints?: string[];
  /** unregistered-normative: the document, its glob, its hash and the string suggestions (advisory). */
  path?: string;
  glob?: string;
  docSha256?: string | null;
  suggestions?: string[];
}

export interface AuthorityProvenance {
  indexPath: string;
  indexSha256: string | null;
  sourceSha: string | null;
  sourceShaReason?: "unborn" | "unavailable";
  checkedAt: string;
}

export interface AuthorityDomain {
  key: string;
  /** The raw domain cells for this key, in row order (the byte-exact datalist). */
  cells: string[];
  canonical: string[];
  proposed: string[];
}

export interface ArchitectureAuthorityReport {
  state: ArchitectureIndexState;
  findings: AuthorityFinding[];
  provenance: AuthorityProvenance;
  domains: AuthorityDomain[];
}

export interface AuthorityContext {
  workspaceRoot: string | null | undefined;
  git?: ArchitectureGit;
}

const KIND_ORDER: AuthorityFindingKind[] = [
  "conflicting-canonical", "canonical-missing", "dangling-supersession", "domain-hidden-characters", "domain-non-ascii",
  "unregistered-normative",
];
const WITH_INDEX: ReadonlySet<ArchitectureIndexState> = new Set(["present", "present-with-problems", "invalid"]);
const DOC_STATE_TEXT: Record<DocState, string> = {
  present: "present", "not-on-disk": "not on disk", "not-listed": "exists but git does not list it (ignored)",
  "outside-workspace": "resolves outside the workspace", "too-large": "larger than 2 MiB", "no-safe-link": "has no safe relative link",
};
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Where a document is and the SHA-256 of its bytes (null when it cannot be read). */
export function documentState(root: string, docPath: string | null, listed: boolean): { docState: DocState; docSha256: string | null } {
  if (!docPath) return { docState: "no-safe-link", docSha256: null };
  const located = resolveInsideWorkspace(root, docPath);
  if (!located) return { docState: "not-on-disk", docSha256: null };
  if (!located.inside) return { docState: "outside-workspace", docSha256: null };
  try {
    const st = fs.statSync(located.abs);
    if (!st.isFile()) return { docState: "not-on-disk", docSha256: null };
    if (st.size > MAX_DOC_BYTES) return { docState: "too-large", docSha256: null };
    const docSha256 = sha256(fs.readFileSync(located.abs));
    return { docState: listed ? "present" : "not-listed", docSha256 };
  } catch {
    return { docState: "not-on-disk", docSha256: null };
  }
}

/** A row reference with line, document state and hash. */
export function rowRef(root: string, row: SnapshotRow): AuthorityRowRef {
  const { docState, docSha256 } = documentState(root, row.docPath, row.listed);
  return { id: row.id, status: row.status, domain: row.domain, docPath: row.docPath, line: row.line, docSha256, docState };
}

function domainsOf(rows: SnapshotRow[]): AuthorityDomain[] {
  const byKey = new Map<string, AuthorityDomain>();
  for (const r of rows) {
    const key = domainKey(r.domain);
    const d = byKey.get(key) ?? { key, cells: [], canonical: [], proposed: [] };
    if (!d.cells.includes(r.domain)) d.cells.push(r.domain);
    if (r.status === "canonical") d.canonical.push(r.id);
    if (r.status === "proposed") d.proposed.push(r.id);
    byKey.set(key, d);
  }
  return [...byKey.values()].sort((a, b) => cmp(a.key, b.key));
}

function rowFindings(root: string, snap: ArchitectureIndexSnapshot): AuthorityFinding[] {
  const out: AuthorityFinding[] = [];
  const byId = new Map<string, SnapshotRow>();
  for (const r of snap.rows) if (!byId.has(r.id)) byId.set(r.id, r);
  const refOf = (id: string): AuthorityRowRef[] => {
    const r = byId.get(id);
    return r ? [rowRef(root, r)] : [];
  };

  const conflicts = new Map<string, string[]>();
  for (const p of snap.problems) {
    if (p.code !== "conflicting-canonical" || !p.domain || !p.ids) continue;
    const ids = conflicts.get(p.domain) ?? [];
    for (const id of p.ids) if (!ids.includes(id)) ids.push(id);
    conflicts.set(p.domain, ids);
  }
  for (const [key, ids] of conflicts) {
    // Every canonical row of the key, in index order (the problem pairs name the first row twice).
    const rows = snap.rows.filter((r) => r.status === "canonical" && domainKey(r.domain) === key && ids.includes(r.id));
    out.push({
      kind: "conflicting-canonical", domainKey: key, rows: rows.map((r) => rowRef(root, r)),
      detail: `domain "${key}" has ${rows.length} canonical documents; exactly one may be canonical`,
    });
  }

  for (const r of snap.rows.filter((x) => x.status === "canonical")) {
    const ref = rowRef(root, r);
    if (ref.docState === "present") continue;
    out.push({
      kind: "canonical-missing", domainKey: domainKey(r.domain), reason: ref.docState, rows: [ref],
      detail: `${r.id} is canonical but its document ${r.docPath ?? "(no link)"} ${DOC_STATE_TEXT[ref.docState]}`,
    });
  }

  for (const p of snap.problems) {
    if (p.code === "dangling-ref" && p.field === "supersedes" && p.ids) {
      const rows = refOf(p.ids[0]);
      out.push({
        kind: "dangling-supersession", reason: "unknown-id", ref: p.ref, rows, domainKey: rows[0] ? domainKey(rows[0].domain) : "",
        detail: `${p.ids[0]} supersedes ${p.ref}, which is not registered`,
      });
    } else if (p.code === "superseded-without-successor" && p.ids) {
      const rows = refOf(p.ids[0]);
      out.push({
        kind: "dangling-supersession", reason: "no-successor", rows, domainKey: rows[0] ? domainKey(rows[0].domain) : "",
        detail: `${p.ids[0]} is superseded but no row names it in supersedes`,
      });
    } else if (p.code === "supersede-cycle" && p.ids) {
      const rows = p.ids.flatMap(refOf);
      out.push({
        kind: "dangling-supersession", reason: "cycle", rows, domainKey: rows[0] ? domainKey(rows[0].domain) : "",
        detail: `supersedes forms a cycle: ${[...p.ids, p.ids[0]].join(" -> ")}`,
      });
    }
  }

  for (const r of snap.rows) {
    const hidden = hiddenCharacterProblem(r.domain);
    if (hidden) {
      out.push({
        kind: "domain-hidden-characters", domainKey: domainKey(r.domain), rows: [rowRef(root, r)],
        codePoints: nonAsciiCodePoints(r.domain), detail: `${r.id}: the domain has ${hidden}`,
      });
    }
    if (r.domain && !INTAKE_CHARSET.test(r.domain)) {
      const codePoints = nonAsciiCodePoints(r.domain);
      out.push({
        kind: "domain-non-ascii", domainKey: domainKey(r.domain), rows: [rowRef(root, r)], codePoints,
        detail: `${r.id}: the domain uses characters outside A-Z, a-z, 0-9, space and . _ / & ( ) -: ${codePoints.join(", ")}. ` +
          "It may look like another domain; FailSafe compares domains as written.",
      });
    }
  }
  return out;
}

function unregisteredFindings(root: string, snap: ArchitectureIndexSnapshot): AuthorityFinding[] {
  return snap.candidates.map((c) => {
    const { docSha256 } = documentState(root, c.path, true);
    const glob = snap.normativeGlobs.find((g) => matchesGlob(g, c.path));
    return {
      kind: "unregistered-normative" as const, path: c.path, glob, docSha256, suggestions: c.suggestions, rows: [],
      detail: `${c.path} matches ${glob ?? "a normative glob"} and has no registry row (suggestions are a string match, not proof of the same content)`,
    };
  });
}

function sortKey(f: AuthorityFinding): string[] {
  return [String(KIND_ORDER.indexOf(f.kind)).padStart(2, "0"), f.domainKey ?? "", f.rows[0]?.id ?? "", f.path ?? ""];
}

export function assessArchitectureAuthority(snap: ArchitectureIndexSnapshot, ctx: AuthorityContext): ArchitectureAuthorityReport {
  const root = ctx.workspaceRoot;
  const source = root ? sourceShaOf(root, ctx.git ?? defaultArchitectureGit) : { sourceSha: null, sourceShaReason: "unavailable" as const };
  const provenance: AuthorityProvenance = {
    indexPath: snap.indexPath, indexSha256: snap.indexSha256, sourceSha: source.sourceSha,
    ...(source.sourceShaReason ? { sourceShaReason: source.sourceShaReason } : {}), checkedAt: snap.checkedAt,
  };
  if (!root) return { state: snap.state, findings: [], provenance, domains: [] };
  const findings = [
    ...(WITH_INDEX.has(snap.state) ? rowFindings(root, snap) : []),
    ...(WITH_INDEX.has(snap.state) || snap.state === "absent" || snap.state === "present-elsewhere" ? unregisteredFindings(root, snap) : []),
  ];
  findings.sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    for (let i = 0; i < ka.length; i += 1) { const c = cmp(ka[i], kb[i]); if (c) return c; }
    return 0;
  });
  return { state: snap.state, findings, provenance, domains: domainsOf(snap.rows) };
}

// ---------------------------------------------------------------- registry links (B312, B253)

/** A related or supersedes id, with the target row's status (null when no row has the id). */
export interface RowLink {
  kind: "row";
  id: string;
  state: "registered" | "unregistered";
  status: string | null;
  docPath: string | null;
  domain: string | null;
}

export type PathLinkState = "present" | "not-on-disk" | "not-listed" | "outside-workspace" | "unsafe";
export type LedgerLinkState = "heading-found" | "heading-missing" | "no-ledger" | "too-large";

export type ValueLink =
  | { kind: "path"; path: string; state: PathLinkState; reason?: string }
  | { kind: "pattern"; value: string; state: "not-matched" }
  | { kind: "url"; label: string; url: string; state: "not-checked" }
  | { kind: "qor-ledger"; entry: number; state: LedgerLinkState };

export interface RegistryLinks {
  id: string;
  related: RowLink[];
  supersedes: RowLink[];
  /** "too-long": the cell is over 4 KiB and was not checked. */
  contract: ValueLink[] | "too-long";
  verification: ValueLink[] | "too-long";
  governanceRef: ValueLink[] | "too-long";
}

/** The Qor ledger whose `### Entry #N` headings a bare `#N` in governance_ref is checked against. */
export const QOR_LEDGER_PATH = "docs/META_LEDGER.md";
/** The Qor ledger is read once per report, and only when it is at most this size. */
export const QOR_LEDGER_LIMIT_BYTES = 8 * 1024 * 1024;
const BARE_REF = /(?<![\w#&/])#(\d{1,7})(?!\w)/g;

const ids = (cell: string): string[] =>
  cell.split(",").map((x) => x.trim()).filter((x) => x !== "" && x !== "-" && !/^unknown$/i.test(x));

/** Bare `#NNN` entries in a governance_ref cell, after markdown links are removed (a link label is never a ref). */
export function ledgerRefs(cell: string): number[] {
  return [...new Set([...blankLinks(cell).matchAll(BARE_REF)].map((m) => Number(m[1])))];
}

function bareRefsAt(cell: string): Array<{ at: number; entry: number }> {
  return [...blankLinks(cell).matchAll(BARE_REF)].map((m) => ({ at: m.index ?? 0, entry: Number(m[1]) }));
}

/**
 * Where a linked path is, from a stat only (never a read or a hash, unlike documentState) and the
 * cell's own listed flag. Memoised per path for one report.
 */
export function linkPathState(root: string, p: string, listed: boolean, memo: Map<string, PathLinkState>): PathLinkState {
  const key = `${listed ? "1" : "0"}:${p}`;
  const hit = memo.get(key);
  if (hit) return hit;
  let state: PathLinkState;
  const located = resolveInsideWorkspace(root, p);
  if (!located) state = "not-on-disk";
  else if (!located.inside) state = "outside-workspace";
  else {
    try { state = fs.statSync(located.abs).isFile() ? (listed ? "present" : "not-listed") : "not-on-disk"; } catch { state = "not-on-disk"; }
  }
  memo.set(key, state);
  return state;
}

/** The entry numbers of the Qor ledger's `### Entry #N` headings, read once, or why they cannot be. */
function qorHeadings(root: string): Set<number> | "no-ledger" | "too-large" {
  const located = resolveInsideWorkspace(root, QOR_LEDGER_PATH);
  if (!located || !located.inside) return "no-ledger";
  try {
    const st = fs.statSync(located.abs);
    if (!st.isFile()) return "no-ledger";
    if (st.size > QOR_LEDGER_LIMIT_BYTES) return "too-large";
    const text = fs.readFileSync(located.abs, "utf8");
    return new Set([...text.matchAll(/^### Entry #(\d+)(?!\d)/gm)].map((m) => Number(m[1])));
  } catch {
    return "no-ledger";
  }
}

/**
 * Each registry row's links: related and supersedes ids with the target's status; contract,
 * verification and governance_ref values with their state, in cell order. Paths are stat-only,
 * patterns are never resolved, URLs are never fetched, and a bare `#NNN` is checked against the Qor
 * ledger's headings only (its hash chain is not checked: #467). Read-only.
 */
export function registryLinks(snap: ArchitectureIndexSnapshot, ctx: AuthorityContext): RegistryLinks[] {
  const root = ctx.workspaceRoot;
  if (!root || !WITH_INDEX.has(snap.state)) return [];
  const byId = new Map<string, SnapshotRow>();
  for (const r of snap.rows) if (!byId.has(r.id)) byId.set(r.id, r);
  const memo = new Map<string, PathLinkState>();
  let headings: ReturnType<typeof qorHeadings> | undefined;
  const ledgerState = (entry: number): LedgerLinkState => {
    headings ??= qorHeadings(root);
    if (headings === "no-ledger" || headings === "too-large") return headings;
    return headings.has(entry) ? "heading-found" : "heading-missing";
  };
  const rowLink = (id: string): RowLink => {
    const r = byId.get(id);
    return r ? { kind: "row", id, state: "registered", status: r.status, docPath: r.docPath, domain: r.domain }
      : { kind: "row", id, state: "unregistered", status: null, docPath: null, domain: null };
  };
  const valueLink = (v: CellPath): ValueLink => {
    switch (v.kind) {
      case "path": return { kind: "path", path: v.path, state: linkPathState(root, v.path, v.listed, memo) };
      case "pattern": return { kind: "pattern", value: v.value, state: "not-matched" };
      case "unsafe": return { kind: "path", path: v.value, state: "unsafe", reason: v.reason };
      default: return { kind: "url", label: v.label, url: v.url, state: "not-checked" };
    }
  };
  const values = (cell: CellPaths, raw?: string): ValueLink[] | "too-long" => {
    if (cell === "too-long") return "too-long";
    const items: Array<{ at: number; link: () => ValueLink }> = cell.map((v) => ({ at: v.at, link: () => valueLink(v) }));
    if (raw !== undefined) {
      for (const ref of bareRefsAt(raw)) items.push({ at: ref.at, link: () => ({ kind: "qor-ledger", entry: ref.entry, state: ledgerState(ref.entry) }) });
    }
    return items.sort((a, b) => a.at - b.at).map((x) => x.link());
  };
  return snap.rows.map((r) => ({
    id: r.id,
    related: ids(r.related).map(rowLink),
    supersedes: ids(r.supersedes).map(rowLink),
    contract: values(r.cellPaths.contract),
    verification: values(r.cellPaths.verification),
    governanceRef: values(r.cellPaths.governanceRef, r.governanceRef),
  }));
}

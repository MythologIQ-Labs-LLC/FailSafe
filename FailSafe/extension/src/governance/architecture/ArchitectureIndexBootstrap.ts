/**
 * Managed architecture index bootstrap (#531 LD4/LD5): one function behind both the Console
 * route and the `failsafe.architecture.bootstrapIndex` command.
 *
 * Runs only from state `absent`. Builds the skeleton bytes, asks the operator through the
 * injected confirmer, checks the target folder stays inside the workspace (realpath of the
 * deepest existing ancestor before mkdir, and of the folder after), then writes exactly the
 * prepared bytes with exclusive create (`wx`): a file that appeared in between is never
 * overwritten. A `PROPOSAL` ledger entry is appended only when the ledger is available.
 */

import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { ConfirmOperatorAction } from "../../extension/operatorConfirmation";
import { architectureIndexBootstrapRequest } from "../../extension/operatorConfirmation";
import {
  discoverArchitectureIndex, defaultArchitectureGit, INDEX_PRESENT_STATES, isInside,
  type ArchitectureGit, type ArchitectureIndexState,
} from "./ArchitectureIndexDiscovery";
import { REGISTRY_COLUMNS, userRepoProfile } from "./architectureIndexCore";

export const ARCHITECTURE_AGENT_DID = "did:failsafe:agent:architecture-index";

/** The slice of LedgerManager this feature uses. */
export interface ArchitectureLedger {
  isAvailable(): boolean;
  appendEntry(request: {
    eventType: "PROPOSAL";
    agentDid: string;
    agentTrustAtAction: number;
    artifactPath?: string;
    artifactHash?: string;
    payload: Record<string, unknown>;
  }): Promise<{ id: number; entryHash?: string }>;
}

/** Entry id when recorded; 'unavailable' when there is no usable ledger; 'failed' when the append threw. */
export type LedgerRecord = { entryId: number } | "unavailable" | "failed";

export function usableLedger(ledger: unknown): ArchitectureLedger | null {
  const l = ledger as Partial<ArchitectureLedger> | null | undefined;
  if (!l || typeof l.isAvailable !== "function" || typeof l.appendEntry !== "function") return null;
  try { return l.isAvailable() ? (l as ArchitectureLedger) : null; } catch { return null; }
}

/** Append a PROPOSAL entry. A stub entry (id 0, disabled ledger) counts as unavailable. */
export async function appendArchitectureProposal(
  ledger: ArchitectureLedger, artifactPath: string, artifactHash: string | null, payload: Record<string, unknown>,
): Promise<LedgerRecord> {
  try {
    const entry = await ledger.appendEntry({
      eventType: "PROPOSAL", agentDid: ARCHITECTURE_AGENT_DID, agentTrustAtAction: 0, artifactPath,
      ...(artifactHash ? { artifactHash } : {}), payload,
    });
    if (!entry || !(entry.id > 0) || entry.entryHash === "STUB_DISABLED") return "unavailable";
    return { entryId: entry.id };
  } catch {
    return "failed";
  }
}

export interface SourceSha {
  sourceSha: string | null;
  sourceShaReason?: "unborn" | "unavailable";
}

/** `git rev-parse --verify --quiet HEAD`; exit 1 with no output is an unborn repository. */
export function sourceShaOf(root: string, git: ArchitectureGit = defaultArchitectureGit): SourceSha {
  const out = git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  if (out.kind === "ok" && /^[0-9a-f]{40,64}$/.test(out.stdout.trim())) return { sourceSha: out.stdout.trim() };
  if (out.kind === "exit" && out.status === 1) return { sourceSha: null, sourceShaReason: "unborn" };
  return { sourceSha: null, sourceShaReason: "unavailable" };
}

export const sha256 = (buf: Buffer | string): string => createHash("sha256").update(buf).digest("hex");

// ---------------------------------------------------------------- skeleton

const SELF_ID = "architecture-navigation";

/** Percent-encode a path for a markdown link target (the validator decodes it). */
function linkTarget(rel: string): string {
  return rel.split("/").map((seg) => (seg === ".." || seg === "." ? seg
    : encodeURIComponent(seg).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))).join("/");
}

const cellText = (s: string): string => s.replace(/[|[\]`\\\r\n]/g, " ").replace(/\s+/g, " ").trim();

function slug(p: string): string {
  return p.toLowerCase().replace(/\.md$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "document";
}

function domainOf(p: string): string {
  const words = path.posix.basename(p).replace(/\.md$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return words || slug(p).replace(/-/g, " ");
}

/** Skeleton text for a new index at `indexPath` listing `candidates` as proposed rows. */
export function buildSkeleton(indexPath: string, candidates: string[], createdOn: string): string {
  const profile = userRepoProfile(indexPath);
  const base = profile.linkBase === "." ? "" : profile.linkBase;
  const rel = (p: string): string => (base ? path.posix.relative(base, p) : p);
  const used = new Set([SELF_ID]);
  const rows: string[][] = [[SELF_ID, "architecture navigation", `[Architecture Index](${linkTarget(rel(indexPath))})`,
    "canonical", "manual", "-", "-", "-", "unknown", "unknown", "manual, when an architecture document is added, moved, superseded or retired"]];
  for (const c of candidates) {
    let id = slug(c);
    for (let n = 2; used.has(id); n += 1) id = `${slug(c)}-${n}`;
    used.add(id);
    const title = cellText(path.posix.basename(c)) || "document";
    rows.push([id, domainOf(c), `[${title}](${linkTarget(rel(c))})`, "proposed", "manual", "-", SELF_ID, "-", "unknown",
      "unknown", "manual, when this proposal is accepted, changed or dropped"]);
  }
  const line = (cells: string[]): string => `| ${cells.join(" | ")} |`;
  return [
    "# Architecture Index",
    "",
    `FailSafe created this index on ${createdOn} after your confirmation. It routes design questions to the document that owns them. Edit it by hand: FailSafe never rewrites it.`,
    "",
    "## Registry",
    "",
    line([...REGISTRY_COLUMNS]),
    line(REGISTRY_COLUMNS.map(() => "---")),
    ...rows.map(line),
    "",
    "Each existing architecture document starts as `proposed`. Mark one `canonical` per domain, `descriptive` for summaries, and `superseded` or `historical` for documents that are no longer authority.",
    "",
    "## Normative scope",
    "",
    "Documents matching these globs need a registry row.",
    "",
    "```architecture-normative",
    ...profile.normativeGlobs,
    "```",
    "",
    "## Legacy and historical documents",
    "",
    "```architecture-legacy",
    ...profile.legacyGlobs,
    "```",
    "",
    "## Scope",
    "",
    "FailSafe checks this index by comparing strings: registration, links and listed files. Similar names are a review item, not proof that two documents say the same thing. Documents in folders your .gitignore excludes are not seen. Nothing in this index is sent off this machine.",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------- bootstrap

export type BootstrapResult =
  | { status: "created"; path: string; docSha256: string; rows: number; ledger: LedgerRecord } & SourceSha
  | { status: "reuse"; path: string; state: ArchitectureIndexState }
  | { status: "refused"; state: ArchitectureIndexState; detail?: string }
  | { status: "confirmation"; confirmation: "declined" | "busy" | "unwired" }
  | { status: "appeared"; path: string }
  | { status: "outside-workspace"; path: string }
  | { status: "write-failed"; path: string; error: string };

export interface BootstrapDeps {
  workspaceRoot: string | null | undefined;
  indexPathSetting?: string;
  confirm: ConfirmOperatorAction | undefined;
  source: "console" | "command";
  ledger: unknown;
  git?: ArchitectureGit;
  now?: () => Date;
}

/** Create the target's folder only if its real path stays inside the real workspace root. */
function preparedFolder(rootReal: string, target: string): string | null {
  const folder = path.dirname(target);
  let probe = folder;
  for (;;) {
    try { fs.lstatSync(probe); break; } catch { /* keep climbing */ }
    const up = path.dirname(probe);
    if (up === probe) return null;
    probe = up;
  }
  try {
    if (!isInside(rootReal, fs.realpathSync.native(probe))) return null;
    fs.mkdirSync(folder, { recursive: true });
    const real = fs.realpathSync.native(folder);
    return isInside(rootReal, real) ? real : null;
  } catch {
    return null;
  }
}

export async function runArchitectureIndexBootstrap(deps: BootstrapDeps): Promise<BootstrapResult> {
  const git = deps.git ?? defaultArchitectureGit;
  const snap = discoverArchitectureIndex({ workspaceRoot: deps.workspaceRoot, indexPathSetting: deps.indexPathSetting, git, now: deps.now });
  if (INDEX_PRESENT_STATES.has(snap.state)) {
    return { status: "reuse", path: snap.state === "present-elsewhere" ? snap.elsewherePath ?? snap.indexPath : snap.indexPath, state: snap.state };
  }
  if (snap.state !== "absent" || !deps.workspaceRoot) return { status: "refused", state: snap.state, detail: snap.detail };

  const indexPath = snap.indexPath;
  const candidates = snap.candidates.map((c) => c.path);
  const bytes = Buffer.from(buildSkeleton(indexPath, candidates, snap.checkedAt.slice(0, 10)), "utf8");

  const answer = deps.confirm ? await deps.confirm(architectureIndexBootstrapRequest(indexPath, candidates, deps.source)) : "unwired";
  if (answer !== "approved") return { status: "confirmation", confirmation: answer };

  let rootReal: string;
  try { rootReal = fs.realpathSync.native(deps.workspaceRoot); } catch { return { status: "outside-workspace", path: indexPath }; }
  const folder = preparedFolder(rootReal, path.join(rootReal, ...indexPath.split("/")));
  if (!folder) return { status: "outside-workspace", path: indexPath };
  const target = path.join(folder, path.posix.basename(indexPath));
  try {
    fs.writeFileSync(target, bytes, { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return { status: "appeared", path: indexPath };
    return { status: "write-failed", path: indexPath, error: e instanceof Error ? e.message : String(e) };
  }

  const docSha256 = sha256(bytes);
  const source = sourceShaOf(deps.workspaceRoot, git);
  const ledger = usableLedger(deps.ledger);
  const record: LedgerRecord = ledger
    ? await appendArchitectureProposal(ledger, indexPath, docSha256, {
      kind: "architecture-index-bootstrap", path: indexPath, sourceSha: source.sourceSha,
      ...(source.sourceShaReason ? { sourceShaReason: source.sourceShaReason } : {}), docSha256,
    })
    : "unavailable";
  return { status: "created", path: indexPath, docSha256, rows: candidates.length + 1, ledger: record, ...source };
}

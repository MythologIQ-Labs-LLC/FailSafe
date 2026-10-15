import { BacklogReader } from "./BacklogReader";
import { RiskStore } from "../../shared/risk-store";

export type UpsertOutcome = "created" | "updated" | "unchanged";
export interface UpsertOptions {
  ignore?: string[];
  /** #517 LD8: keys whose stored value wins when one exists (operator triage). */
  keepStored?: string[];
}

/** Key-sorted JSON, so property order never makes equal records differ. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Copy of `record` without the dotted paths in `ignore`. */
function withoutPaths(record: Record<string, unknown>, ignore: string[]): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
  for (const dotted of ignore) {
    const keys = dotted.split(".");
    let node: Record<string, unknown> | undefined = copy;
    for (const k of keys.slice(0, -1)) {
      const child: unknown = node?.[k];
      node = child && typeof child === "object" ? (child as Record<string, unknown>) : undefined;
    }
    if (node) delete node[keys[keys.length - 1]];
  }
  return copy;
}

function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>, ignore: string[]): boolean {
  return canonical(withoutPaths(a, ignore)) === canonical(withoutPaths(b, ignore));
}

/** #517 LD8: the incoming record over the stored one; keepStored keys stay. */
function mergeOver(
  stored: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
  keepStored: string[],
): Record<string, unknown> {
  if (!stored) return incoming;
  const next: Record<string, unknown> = { ...stored, ...incoming };
  for (const key of keepStored) if (stored[key] !== undefined) next[key] = stored[key];
  return next;
}

/**
 * Reads and writes the risk register (JSON format).
 *
 * v5: when `risks.json` is absent or empty, the manager falls back to
 * `docs/BACKLOG.md` open items so the Risks tab reflects workspace truth
 * instead of showing "No risks recorded yet" while the backlog has 20+
 * open items. User-created risks (via the UI) are still persisted to
 * `risks.json` and take precedence.
 *
 * #517: every mutation goes through RiskStore.mutate (cross-process lock,
 * fresh read, atomic write, refusal of an unreadable register).
 */
export class RiskRegisterManager {
  private readonly workspaceRoot: string;
  private readonly store: RiskStore;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.store = new RiskStore(workspaceRoot);
  }

  getRisks(): Array<Record<string, unknown>> {
    const stored = this.readStoredRisks();
    if (stored.length > 0) return stored;
    return this.readBacklogFallback();
  }

  /**
   * #377: durable-store-only read for MUTATION paths (the Console CRUD routes).
   * Unlike getRisks(), never returns the BACKLOG.md display fallback — a
   * read-modify-write through the display view durably promoted the entire
   * projection on first write (#241 F-6 sibling).
   */
  getStoredRisks(): Array<Record<string, unknown>> {
    return this.readStoredRisks();
  }

  /**
   * #517: read-modify-write the durable list under the risk store lock. fn
   * runs once against the fresh list and must change it in place.
   */
  mutateStoredRisks<T>(fn: (risks: Array<Record<string, unknown>>) => T): T {
    return this.store.mutate((doc) => fn(doc.risks));
  }

  /** @deprecated Whole-list replacement; use mutateStoredRisks. */
  writeRisks(risks: Array<Record<string, unknown>>): void {
    this.store.mutate((doc) => { doc.risks = risks; });
  }

  /**
   * B-BIC-18 (Batch 4): keyed idempotent create. Finds an existing risk by
   * the `id` key and merges the incoming record over it, so fields the
   * importer does not send survive and `keepStored` keys keep their stored
   * value (#517 LD8); otherwise appends.
   *
   * #241 F-6: mutates the durable store only, never `getRisks()`. Reading
   * through `getRisks()` here previously meant that if `risks.json` was
   * absent/empty, this call would read the derived BACKLOG.md fallback array
   * and write the *entire* fallback back to risks.json alongside the one
   * intentional record, silently promoting dozens of derived items into
   * durable authoritative state while callers (SARIF/Sentry import, MCP
   * policy scan) reported only the count of records they explicitly upserted.
   */
  upsertRisk(risk: Record<string, unknown>, opts: UpsertOptions = {}): UpsertOutcome {
    return this.upsertRiskWith(String(risk.id), (stored) => mergeOver(stored, risk, opts.keepStored ?? []), opts);
  }

  /**
   * #478: read the stored record for `id`, build its replacement, and write it
   * only when it differs — all in one synchronous call, so an in-process writer
   * (the Console risk routes) can never be overwritten by a record built from
   * an older read. `ignore` lists dotted paths left out of the comparison; an
   * unchanged record keeps its stored values, including those paths.
   */
  upsertRiskWith(
    id: string,
    build: (stored: Record<string, unknown> | undefined) => Record<string, unknown>,
    opts: UpsertOptions = {},
  ): UpsertOutcome {
    return this.store.mutate((doc) => {
      const index = doc.risks.findIndex((r) => r.id === id);
      const stored = index >= 0 ? doc.risks[index] : undefined;
      const next = build(stored);
      if (stored && sameRecord(stored, next, opts.ignore ?? [])) return "unchanged";
      if (index >= 0) doc.risks[index] = next;
      else doc.risks.push(next);
      return stored ? "updated" : "created";
    });
  }

  /**
   * B-BIC-18 (Batch 4): close a risk by its `id` key — sets `status:'closed'`
   * and persists. A no-op (no throw, register unchanged) when the id is
   * absent; an unreadable register is refused (#517). #241 F-6: operates on
   * the durable store only, matching
   * `upsertRisk` — closing a BACKLOG-fallback-only id (never explicitly
   * upserted) remains a no-op rather than materializing the fallback.
   */
  closeRisk(id: string): void {
    this.store.mutate((doc) => {
      const index = doc.risks.findIndex((r) => r.id === id);
      if (index >= 0) doc.risks[index] = { ...doc.risks[index], status: "closed" };
    });
  }

  /** Display read: an absent or unreadable register is an empty list here. */
  private readStoredRisks(): Array<Record<string, unknown>> {
    const result = this.store.read();
    return result.state === "ok" ? result.doc.risks : [];
  }

  private readBacklogFallback(): Array<Record<string, unknown>> {
    const reader = new BacklogReader(this.workspaceRoot);
    const items = reader.parseOpenItems();
    return items as unknown as Array<Record<string, unknown>>;
  }
}

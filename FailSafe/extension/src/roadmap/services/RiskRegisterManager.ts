import * as fs from "fs";
import * as path from "path";
import { BacklogReader } from "./BacklogReader";

/**
 * Reads and writes the risk register (JSON format).
 *
 * v5: when `risks.json` is absent or empty, the manager falls back to
 * `docs/BACKLOG.md` open items so the Risks tab reflects workspace truth
 * instead of showing "No risks recorded yet" while the backlog has 20+
 * open items. User-created risks (via the UI) are still persisted to
 * `risks.json` and take precedence.
 */
export class RiskRegisterManager {
  private readonly risksPath: string;
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.risksPath = path.join(workspaceRoot, ".failsafe", "risks", "risks.json");
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

  writeRisks(risks: Array<Record<string, unknown>>): void {
    const dir = path.dirname(this.risksPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.preserveCorruptStore();
    fs.writeFileSync(this.risksPath, JSON.stringify({ risks }, null, 2), "utf-8");
  }

  /**
   * #368: an existing-but-unparseable (or wrong-shape) risks.json must be
   * preserved aside before ANY write overwrites it — readStoredRisks() swallows
   * parse errors into [], so without this a single upsert would destroy the
   * operator's prior durable risks. The check lives here so every mutation
   * path is covered (upsertRisk, closeRisk, the Console /api/v1/risks routes
   * via HubSnapshotService.writeRiskRegister, and future callers). Reads never
   * preserve/rename. Preservation reflects on-disk state at write time;
   * concurrent-writer lost-updates are the declared out-of-scope RMW hazard.
   * Posture is preserve+warn+proceed — failing closed would abort SARIF/Sentry
   * import loops mid-run; only a rename AND copy double-failure loses data
   * (disclosed residual).
   */
  private preserveCorruptStore(): void {
    let corrupt = false;
    try {
      if (!fs.existsSync(this.risksPath)) return;
      const data = JSON.parse(fs.readFileSync(this.risksPath, "utf-8"));
      corrupt = !Array.isArray(data.risks);
    } catch {
      corrupt = true;
    }
    if (!corrupt) return;
    const bak = `${this.risksPath}.corrupt-${Date.now()}.bak`;
    try {
      fs.renameSync(this.risksPath, bak);
      console.warn(`[FailSafe] risks.json was unparseable; preserved at ${bak}`);
    } catch {
      // Windows EBUSY/EPERM when another process holds the file open: a copy
      // still succeeds against open read handles.
      try {
        fs.copyFileSync(this.risksPath, bak);
        console.warn(`[FailSafe] risks.json was unparseable; copied to ${bak} (rename blocked)`);
      } catch {
        console.warn("[FailSafe] risks.json was unparseable and could not be preserved; overwriting");
      }
    }
  }

  /**
   * B-BIC-18 (Batch 4): keyed idempotent create. Finds an existing risk by
   * the `id` key and replaces it in place; otherwise appends. Built on
   * readStoredRisks/writeRisks — no storage-format change to risks.json.
   *
   * #241 F-6: mutates the durable store only, never `getRisks()`. Reading
   * through `getRisks()` here previously meant that if `risks.json` was
   * absent/empty, this call would read the derived BACKLOG.md fallback array
   * and write the *entire* fallback back to risks.json alongside the one
   * intentional record, silently promoting dozens of derived items into
   * durable authoritative state while callers (SARIF/Sentry import, MCP
   * policy scan) reported only the count of records they explicitly upserted.
   */
  upsertRisk(risk: Record<string, unknown>): void {
    const risks = this.readStoredRisks();
    const id = risk.id;
    const index = risks.findIndex((r) => r.id === id);
    if (index >= 0) {
      risks[index] = risk;
    } else {
      risks.push(risk);
    }
    this.writeRisks(risks);
  }

  /**
   * B-BIC-18 (Batch 4): close a risk by its `id` key — sets `status:'closed'`
   * and persists. A no-op (no throw, register unchanged) when the id is
   * absent. #241 F-6: operates on the durable store only, matching
   * `upsertRisk` — closing a BACKLOG-fallback-only id (never explicitly
   * upserted) remains a no-op rather than materializing the fallback.
   */
  closeRisk(id: string): void {
    const risks = this.readStoredRisks();
    const index = risks.findIndex((r) => r.id === id);
    if (index < 0) return;
    risks[index] = { ...risks[index], status: "closed" };
    this.writeRisks(risks);
  }

  private readStoredRisks(): Array<Record<string, unknown>> {
    try {
      if (fs.existsSync(this.risksPath)) {
        const data = JSON.parse(fs.readFileSync(this.risksPath, "utf-8"));
        return Array.isArray(data.risks) ? data.risks : [];
      }
    } catch { /* swallow; fall through to backlog */ }
    return [];
  }

  private readBacklogFallback(): Array<Record<string, unknown>> {
    const reader = new BacklogReader(this.workspaceRoot);
    const items = reader.parseOpenItems();
    return items as unknown as Array<Record<string, unknown>>;
  }
}

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

  writeRisks(risks: Array<Record<string, unknown>>): void {
    const dir = path.dirname(this.risksPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.risksPath, JSON.stringify({ risks }, null, 2), "utf-8");
  }

  /**
   * B-BIC-18 (Batch 4): keyed idempotent create. Finds an existing risk by
   * the `id` key and replaces it in place; otherwise appends. Built on the
   * existing getRisks/writeRisks — no storage-format change to risks.json.
   */
  upsertRisk(risk: Record<string, unknown>): void {
    const risks = this.getRisks();
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
   * absent.
   */
  closeRisk(id: string): void {
    const risks = this.getRisks();
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

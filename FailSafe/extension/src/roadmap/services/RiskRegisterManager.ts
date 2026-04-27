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

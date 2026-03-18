import * as fs from "fs";
import * as path from "path";

/**
 * Reads and writes the risk register (JSON format).
 * Framework-agnostic — portable to any runtime.
 */
export class RiskRegisterManager {
  private readonly risksPath: string;

  constructor(workspaceRoot: string) {
    this.risksPath = path.join(workspaceRoot, ".failsafe", "risks", "risks.json");
  }

  getRisks(): Array<Record<string, unknown>> {
    try {
      if (fs.existsSync(this.risksPath)) {
        const data = JSON.parse(fs.readFileSync(this.risksPath, "utf-8"));
        return Array.isArray(data.risks) ? data.risks : [];
      }
    } catch { /* return empty */ }
    return [];
  }

  writeRisks(risks: Array<Record<string, unknown>>): void {
    const dir = path.dirname(this.risksPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.risksPath, JSON.stringify({ risks }, null, 2), "utf-8");
  }
}

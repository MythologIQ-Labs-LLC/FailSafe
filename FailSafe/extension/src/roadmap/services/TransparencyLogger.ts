import * as fs from "fs";
import * as path from "path";

/**
 * Reads and writes transparency audit events (JSONL format).
 * Framework-agnostic — portable to any runtime.
 */
export class TransparencyLogger {
  private readonly logPath: string;

  constructor(workspaceRoot: string) {
    this.logPath = path.join(workspaceRoot, ".failsafe", "logs", "transparency.jsonl");
  }

  getEvents(limit: number): Array<Record<string, unknown>> {
    const events: Array<Record<string, unknown>> = [];
    try {
      if (fs.existsSync(this.logPath)) {
        const lines = fs.readFileSync(this.logPath, "utf-8").trim().split("\n").filter(Boolean);
        for (const line of lines.slice(-limit)) {
          try { events.push(JSON.parse(line)); } catch { /* skip malformed */ }
        }
      }
    } catch { /* return empty */ }
    return events;
  }

  log(event: Record<string, unknown>): void {
    try {
      const dir = path.dirname(this.logPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.logPath, JSON.stringify(event) + "\n", "utf-8");
    } catch { /* ignore write errors */ }
  }
}

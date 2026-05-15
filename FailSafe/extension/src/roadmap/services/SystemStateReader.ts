import * as fs from "fs";
import * as path from "path";

export interface SystemStateSnapshot {
  version: string | null;
  lastUpdated: string | null;
  chainStatus: string | null;
}

const VERSION_RE = /^\*\*Version:\*\*\s+(.+?)\s*$/m;
const UPDATED_RE = /^\*\*Last Updated:\*\*\s+(.+?)\s*$/m;
const CHAIN_STATUS_RE = /^##\s+Chain\s+Status:\s+(.+?)\s*$/m;

/**
 * Reads `docs/SYSTEM_STATE.md` for version + last-updated, and falls back
 * to `docs/META_LEDGER.md` for chain status. Both files are parsed with
 * tight regex; missing files yield null fields rather than errors.
 */
export class SystemStateReader {
  constructor(private readonly workspaceRoot: string) {}

  read(): SystemStateSnapshot {
    const sysState = this.readSystemState();
    const chainStatus = sysState.chainStatus ?? this.readChainStatusFromLedger();
    return { ...sysState, chainStatus };
  }

  private readSystemState(): SystemStateSnapshot {
    const filePath = path.join(this.workspaceRoot, "docs", "SYSTEM_STATE.md");
    if (!fs.existsSync(filePath)) {
      return { version: null, lastUpdated: null, chainStatus: null };
    }
    const content = readSafe(filePath);
    if (content === null) {
      return { version: null, lastUpdated: null, chainStatus: null };
    }
    return parseSystemStateFromText(content);
  }

  private readChainStatusFromLedger(): string | null {
    const filePath = path.join(this.workspaceRoot, "docs", "META_LEDGER.md");
    if (!fs.existsSync(filePath)) return null;
    const content = readSafe(filePath);
    if (content === null) return null;
    const match = CHAIN_STATUS_RE.exec(content);
    return match ? match[1] : null;
  }
}

export function parseSystemStateFromText(content: string): SystemStateSnapshot {
  const versionMatch = VERSION_RE.exec(content);
  const updatedMatch = UPDATED_RE.exec(content);
  const chainMatch = CHAIN_STATUS_RE.exec(content);
  return {
    version: versionMatch ? versionMatch[1] : null,
    lastUpdated: updatedMatch ? updatedMatch[1] : null,
    chainStatus: chainMatch ? chainMatch[1] : null,
  };
}

function readSafe(filePath: string): string | null {
  try { return fs.readFileSync(filePath, "utf8"); }
  catch { return null; }
}

// File-backed AcpLedgerSink for the ACP proxy process (GH #172 Part 2). Appends one
// JSON line per governance decision to `.failsafe/governance/acp-ledger.jsonl` so
// the proxy leaves a durable, operator-readable trail of what it governed (B7 /
// ACP-NIST-03 auditability) even though it runs outside the extension's
// LedgerManager.
//
// PRIVACY: the AcpGovernanceRecord carries verdict/mode/enforcing/blocked/target/
// rationale only — NEVER file content or terminal args (fs writes are digested
// upstream in acpMapper). This sink writes the record verbatim and adds nothing,
// so no payload can leak here.
//
// DEGRADE-SAFE: any fs failure is swallowed. A broken trail must never break the
// governance decision path (the governor also wraps emit() in try/catch).

import * as fs from 'fs';
import * as path from 'path';
import type { AcpLedgerSink, AcpGovernanceRecord } from '../AcpProxyGovernor';

export class FileLedgerSink implements AcpLedgerSink {
  private readonly file: string;

  constructor(workspaceRoot: string) {
    this.file = path.join(workspaceRoot, '.failsafe', 'governance', 'acp-ledger.jsonl');
  }

  record(entry: AcpGovernanceRecord): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
      fs.appendFileSync(this.file, `${line}\n`, 'utf8');
    } catch {
      /* a broken ledger file must not break governance */
    }
  }
}

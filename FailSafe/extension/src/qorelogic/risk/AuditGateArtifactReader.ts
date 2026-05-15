/**
 * AuditGateArtifactReader — reads .qor/gates/<session_id>/audit.json.
 *
 * Returns null when the artifact is missing OR the session id cannot be
 * inferred. Never throws. Per plan-qor-model-sourced-risks Phase 3 F3.
 */

import * as fs from "fs";
import * as path from "path";

export interface AuditGateArtifact {
  ts?: string;
  target?: string;
  verdict?: "PASS" | "VETO";
  report_path?: string;
  risk_grade?: "L1" | "L2" | "L3";
  findings_categories?: string[];
  [key: string]: unknown;
}

export class AuditGateArtifactReader {
  constructor(private readonly workspaceRoot: string) {}

  /** Read .qor/gates/<sessionId>/audit.json. Returns null on any missing
   *  artifact, parse error, or invalid sessionId. Never throws. */
  read(sessionId: string | undefined | null): AuditGateArtifact | null {
    if (!sessionId || typeof sessionId !== "string") return null;
    if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) return null;
    const filePath = path.join(
      this.workspaceRoot, ".qor", "gates", sessionId, "audit.json",
    );
    if (!fs.existsSync(filePath)) return null;
    try {
      const text = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as AuditGateArtifact;
    } catch {
      return null;
    }
  }
}

import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { WorkspaceArtifactBuilder } from "../../roadmap/services/WorkspaceArtifactBuilder";

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wab-"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, ".failsafe", "governance", "plans"), { recursive: true });
  return root;
}

function writeLedger(root: string, content: string): void {
  fs.writeFileSync(path.join(root, "docs", "META_LEDGER.md"), content, "utf8");
}

function writePlan(root: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(root, ".failsafe", "governance", "plans", filename), content, "utf8");
}

suite("WorkspaceArtifactBuilder", () => {
  test("missing META_LEDGER.md → shieldPhase IDLE, derivedShieldPhases all pending", () => {
    const root = makeWorkspace();
    try {
      const snapshot = new WorkspaceArtifactBuilder(root).build();
      assert.equal(snapshot.shieldPhase, "IDLE");
      assert.equal(snapshot.latestVerdict, undefined);
      assert.equal(snapshot.derivedShieldPhases.length, 4);
      snapshot.derivedShieldPhases.forEach(p =>
        assert.equal(p.status, "pending", `${p.id} status`));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("ledger with latest IMPLEMENT entry → derivedShieldPhases reflect IMPLEMENT", () => {
    const root = makeWorkspace();
    try {
      writeLedger(root, [
        "### Entry #1: PLAN — Initial",
        "**Phase**: PLAN",
        "**Verdict**: PASS",
        "",
        "### Entry #2: GATE TRIBUNAL — Audit",
        "**Phase**: GATE",
        "**Verdict**: PASS",
        "",
        "### Entry #3: IMPLEMENTATION — Building",
        "**Phase**: IMPLEMENT",
        "",
      ].join("\n"));
      const snapshot = new WorkspaceArtifactBuilder(root).build();
      assert.equal(snapshot.shieldPhase, "IMPLEMENT");
      assert.equal(snapshot.derivedShieldPhases[0].status, "completed");
      assert.equal(snapshot.derivedShieldPhases[1].status, "completed");
      assert.equal(snapshot.derivedShieldPhases[2].status, "active");
      assert.equal(snapshot.derivedShieldPhases[3].status, "pending");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("ledger with sealed SUBSTANTIATE entry → all phases completed", () => {
    const root = makeWorkspace();
    try {
      writeLedger(root, [
        "### Entry #5: SESSION SEAL — final",
        "**Phase**: SUBSTANTIATE",
        "**Verdict**: PASS — Reality matches Promise",
        "",
      ].join("\n"));
      const snapshot = new WorkspaceArtifactBuilder(root).build();
      assert.equal(snapshot.shieldPhase, "SEALED");
      snapshot.derivedShieldPhases.forEach(p =>
        assert.equal(p.status, "completed", `${p.id} status`));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("plan-file title flows through builder unchanged", () => {
    const root = makeWorkspace();
    try {
      writePlan(root, "plan-test.md", "# Test Plan Title\n\n## Phase 1: Setup\n");
      const snapshot = new WorkspaceArtifactBuilder(root).build();
      assert.ok(snapshot.activePlanFromFile, "activePlanFromFile should be populated");
      assert.equal(snapshot.activePlanFromFile?.title, "Test Plan Title");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

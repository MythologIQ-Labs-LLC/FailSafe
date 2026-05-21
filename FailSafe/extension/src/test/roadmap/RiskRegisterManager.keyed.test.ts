// FX582 — Batch 4 Phase 3 (B-BIC-18): RiskRegisterManager gains keyed
// idempotent create + close-by-id over the untyped risk store. `upsertRisk`
// finds by the `id` key and replaces in place or appends; `closeRisk` sets
// `status:'closed'` and is a no-op on an unknown id. Both build on the
// existing getRisks/writeRisks — no storage-format change to risks.json.
import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RiskRegisterManager } from "../../roadmap/services/RiskRegisterManager";

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fx582-risks-"));
  // Seed an empty risks.json so the manager reads the stored store, not the
  // BACKLOG.md fallback.
  const risksDir = path.join(dir, ".failsafe", "risks");
  fs.mkdirSync(risksDir, { recursive: true });
  fs.writeFileSync(path.join(risksDir, "risks.json"), JSON.stringify({ risks: [] }), "utf-8");
  return dir;
}

function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

suite("FX582 RiskRegisterManager keyed upsert/close (Batch 4 Phase 3)", () => {
  test("upsertRisk on a fresh register appends the record", () => {
    const dir = makeWorkspace();
    try {
      const mgr = new RiskRegisterManager(dir);
      mgr.upsertRisk({ id: "bicameral:d1", status: "open", title: "drift d1" });
      const risks = mgr.getRisks();
      assert.equal(risks.length, 1);
      assert.equal(risks[0].id, "bicameral:d1");
      assert.equal(risks[0].status, "open");
    } finally {
      cleanup(dir);
    }
  });

  test("upsertRisk with an existing id replaces in place (no duplicate id)", () => {
    const dir = makeWorkspace();
    try {
      const mgr = new RiskRegisterManager(dir);
      mgr.upsertRisk({ id: "bicameral:d1", status: "open", title: "first" });
      mgr.upsertRisk({ id: "bicameral:d1", status: "open", title: "second" });
      const risks = mgr.getRisks();
      assert.equal(risks.length, 1, "list length unchanged on re-upsert");
      assert.equal(risks[0].title, "second", "record replaced in place");
      assert.equal(
        risks.filter((r) => r.id === "bicameral:d1").length,
        1,
        "no duplicate id",
      );
    } finally {
      cleanup(dir);
    }
  });

  test("closeRisk(id) sets that record's status to 'closed'", () => {
    const dir = makeWorkspace();
    try {
      const mgr = new RiskRegisterManager(dir);
      mgr.upsertRisk({ id: "bicameral:d1", status: "open" });
      mgr.upsertRisk({ id: "bicameral:d2", status: "open" });
      mgr.closeRisk("bicameral:d1");
      const risks = mgr.getRisks();
      const d1 = risks.find((r) => r.id === "bicameral:d1");
      const d2 = risks.find((r) => r.id === "bicameral:d2");
      assert.equal(d1?.status, "closed");
      assert.equal(d2?.status, "open", "untargeted records are untouched");
    } finally {
      cleanup(dir);
    }
  });

  test("closeRisk on an unknown id is a no-op (no throw, register unchanged)", () => {
    const dir = makeWorkspace();
    try {
      const mgr = new RiskRegisterManager(dir);
      mgr.upsertRisk({ id: "bicameral:d1", status: "open" });
      assert.doesNotThrow(() => mgr.closeRisk("bicameral:absent"));
      const risks = mgr.getRisks();
      assert.equal(risks.length, 1);
      assert.equal(risks[0].id, "bicameral:d1");
      assert.equal(risks[0].status, "open");
    } finally {
      cleanup(dir);
    }
  });
});

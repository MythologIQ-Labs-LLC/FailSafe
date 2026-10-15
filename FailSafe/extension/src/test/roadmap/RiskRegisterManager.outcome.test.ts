// #478 LD3: `upsertRiskWith` reads the stored record, builds, compares and
// writes in one synchronous call, and reports created / updated / unchanged.
// Lives beside RiskRegisterManager.keyed.test.ts, which is already past the
// 250-line razor.
import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RiskRegisterManager } from "../../roadmap/services/RiskRegisterManager";

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fs478-risks-"));
  fs.mkdirSync(path.join(dir, ".failsafe", "risks"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".failsafe", "risks", "risks.json"), JSON.stringify({ risks: [] }), "utf-8");
  return dir;
}

const risksFile = (dir: string): string => path.join(dir, ".failsafe", "risks", "risks.json");

suite("#478 RiskRegisterManager upsert outcome (LD3)", () => {
  let dir = "";
  setup(() => { dir = makeWorkspace(); });
  teardown(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("created for a new id, updated when a field changes", () => {
    const m = new RiskRegisterManager(dir);
    assert.equal(m.upsertRiskWith("r1", () => ({ id: "r1", title: "a" })), "created");
    assert.equal(m.upsertRiskWith("r1", () => ({ id: "r1", title: "b" })), "updated");
    assert.deepEqual(m.getStoredRisks(), [{ id: "r1", title: "b" }]);
  });

  test("unchanged when only an ignored path differs, and the file bytes are not rewritten", () => {
    const m = new RiskRegisterManager(dir);
    m.upsertRiskWith("r1", () => ({ id: "r1", updatedAt: "t1", provenance: { release: { first: "1", verifiedAt: "t1" } } }));
    const before = fs.readFileSync(risksFile(dir));
    const outcome = m.upsertRiskWith(
      "r1",
      () => ({ id: "r1", updatedAt: "t2", provenance: { release: { first: "1", verifiedAt: "t2" } } }),
      { ignore: ["updatedAt", "provenance.release.verifiedAt"] },
    );
    assert.equal(outcome, "unchanged");
    assert.ok(fs.readFileSync(risksFile(dir)).equals(before), "risks.json untouched");
    assert.equal((m.getStoredRisks()[0] as { updatedAt: string }).updatedAt, "t1", "stored ignored values kept");
  });

  test("key order does not make an identical record look changed", () => {
    const m = new RiskRegisterManager(dir);
    m.upsertRiskWith("r1", () => ({ id: "r1", a: 1, b: { x: 1, y: 2 } }));
    assert.equal(m.upsertRiskWith("r1", () => ({ b: { y: 2, x: 1 }, a: 1, id: "r1" })), "unchanged");
  });

  test("build receives the record stored at call time (a close in between is visible)", () => {
    const m = new RiskRegisterManager(dir);
    m.upsertRiskWith("r1", () => ({ id: "r1", status: "open" }));
    m.closeRisk("r1");
    let seen: Record<string, unknown> | undefined;
    m.upsertRiskWith("r1", (stored) => { seen = stored; return { ...stored, id: "r1" }; });
    assert.equal(seen?.status, "closed");
  });

  test("upsertRisk without options compares every field and returns the outcome", () => {
    const m = new RiskRegisterManager(dir);
    assert.equal(m.upsertRisk({ id: "r1", updatedAt: "t1" }), "created");
    assert.equal(m.upsertRisk({ id: "r1", updatedAt: "t1" }), "unchanged");
    assert.equal(m.upsertRisk({ id: "r1", updatedAt: "t2" }), "updated");
  });
});

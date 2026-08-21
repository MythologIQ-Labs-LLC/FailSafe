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

function risksJsonPath(dir: string): string {
  return path.join(dir, ".failsafe", "risks", "risks.json");
}

function readRisksJson(dir: string): Array<Record<string, unknown>> {
  const raw = JSON.parse(fs.readFileSync(risksJsonPath(dir), "utf-8"));
  return Array.isArray(raw.risks) ? raw.risks : [];
}

// Workspace with docs/BACKLOG.md open items and NO risks.json — the exact
// pre-first-write state `upsertRisk`/`closeRisk` must not silently promote
// wholesale into durable storage (#241 F-6).
function makeWorkspaceWithBacklog(openCount: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fx582-risks-backlog-"));
  const docsDir = path.join(dir, "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  const lines: string[] = ["## Security Blockers", ""];
  for (let i = 0; i < openCount; i++) {
    lines.push(`- [ ] [S${i}] backlog item ${i}`);
  }
  fs.writeFileSync(path.join(docsDir, "BACKLOG.md"), lines.join("\n"), "utf-8");
  return dir;
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

// FailSafe#241 F-6: a single explicit upsertRisk/closeRisk call, made while
// risks.json is absent/empty and docs/BACKLOG.md has open items, must not
// silently materialize the entire BACKLOG fallback into durable storage.
// SARIF/Sentry/MCP-policy-scan importers call upsertRisk once per finding and
// report the count of findings they upserted — that reported count must
// equal what actually landed on disk.
suite("FX241-F6 RiskRegisterManager BACKLOG-fallback materialization boundary", () => {
  test("upsertRisk on a workspace with only a BACKLOG.md fallback persists exactly the explicit record, not the fallback", () => {
    const dir = makeWorkspaceWithBacklog(23);
    try {
      const mgr = new RiskRegisterManager(dir);
      const preRisks = mgr.getRisks();
      assert.equal(preRisks.length, 23, "fallback is visible before any explicit write");

      mgr.upsertRisk({ id: "sarif:finding-1", status: "open", title: "one real finding" });

      const onDisk = readRisksJson(dir);
      assert.equal(
        onDisk.length,
        1,
        "risks.json must contain only the explicitly upserted record, not the 23 backlog items",
      );
      assert.equal(onDisk[0].id, "sarif:finding-1");
    } finally {
      cleanup(dir);
    }
  });

  test("a simulated per-finding import loop (as SARIF/Sentry importers perform) persists exactly N records for N explicit upserts", () => {
    const dir = makeWorkspaceWithBacklog(10);
    try {
      const mgr = new RiskRegisterManager(dir);
      const findings = [
        { id: "sarif:f1", status: "open" },
        { id: "sarif:f2", status: "open" },
        { id: "sarif:f3", status: "open" },
      ];
      for (const risk of findings) mgr.upsertRisk(risk);

      const onDisk = readRisksJson(dir);
      assert.equal(
        onDisk.length,
        findings.length,
        "an operator-visible count of 3 upserted must match exactly 3 persisted records",
      );
      const ids = onDisk.map((r) => r.id).sort();
      assert.deepEqual(ids, ["sarif:f1", "sarif:f2", "sarif:f3"]);
    } finally {
      cleanup(dir);
    }
  });

  test("closeRisk against a BACKLOG-fallback-only id (never explicitly upserted) is a no-op and does not materialize the fallback", () => {
    const dir = makeWorkspaceWithBacklog(5);
    try {
      const mgr = new RiskRegisterManager(dir);
      assert.doesNotThrow(() => mgr.closeRisk("backlog:S0"));
      assert.equal(fs.existsSync(risksJsonPath(dir)), false, "no risks.json should be created by a no-op close");
      assert.equal(mgr.getRisks().length, 5, "fallback remains live-derived and untouched");
    } finally {
      cleanup(dir);
    }
  });

  test("materialization boundary is stable across a simulated restart: a fresh manager instance still sees only the durable record", () => {
    const dir = makeWorkspaceWithBacklog(15);
    try {
      new RiskRegisterManager(dir).upsertRisk({ id: "sarif:only", status: "open" });

      // Simulate restart: construct a brand-new manager instance over the
      // same workspace, as happens on extension reload.
      const restarted = new RiskRegisterManager(dir);
      const onDisk = readRisksJson(dir);
      assert.equal(onDisk.length, 1, "persistence transition must preserve provenance across restart");
      assert.equal(restarted.getRisks().length, 1, "post-restart read must not re-derive/re-persist the fallback");
    } finally {
      cleanup(dir);
    }
  });

  test("upsertRisk with a pre-existing durable risk and a live BACKLOG.md still persists only durable records", () => {
    const dir = makeWorkspaceWithBacklog(7);
    try {
      const mgr = new RiskRegisterManager(dir);
      mgr.upsertRisk({ id: "sarif:first", status: "open" });
      mgr.upsertRisk({ id: "sarif:second", status: "open" });

      const onDisk = readRisksJson(dir);
      assert.equal(onDisk.length, 2, "the live backlog must never leak into durable storage on a later upsert either");
    } finally {
      cleanup(dir);
    }
  });
});

// ── #368: corrupt risks.json preservation (plan-risks-corrupt-store-368) ──────
// A mutation against an existing-but-unparseable store must preserve the
// original bytes aside (.corrupt-<ts>.bak) before overwriting — the check
// lives in writeRisks() so EVERY mutation path is covered (upsert, close,
// the Console CRUD routes, future callers). Reads never preserve/rename.

function corruptBaks(dir: string): string[] {
  const risksDir = path.join(dir, ".failsafe", "risks");
  if (!fs.existsSync(risksDir)) return [];
  return fs.readdirSync(risksDir).filter((f) => /^risks\.json\.corrupt-\d+\.bak$/.test(f));
}

suite("#368 corrupt-store preservation", () => {
  const CORRUPT = '{"risks": [{"id": "old-1"}, TRUNCATED';

  function makeCorruptWorkspace(content: string = CORRUPT): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fx368-risks-"));
    const risksDir = path.join(dir, ".failsafe", "risks");
    fs.mkdirSync(risksDir, { recursive: true });
    fs.writeFileSync(path.join(risksDir, "risks.json"), content, "utf-8");
    return dir;
  }

  test("corrupt JSON + upsertRisk: original bytes preserved in exactly one .bak; store holds only the new record", () => {
    const dir = makeCorruptWorkspace();
    try {
      new RiskRegisterManager(dir).upsertRisk({ id: "new-1", status: "open" });
      const baks = corruptBaks(dir);
      assert.equal(baks.length, 1, "exactly one .corrupt-*.bak must exist");
      const preserved = fs.readFileSync(path.join(dir, ".failsafe", "risks", baks[0]), "utf-8");
      assert.equal(preserved, CORRUPT, "the .bak must hold the ORIGINAL corrupt bytes");
      assert.deepEqual(readRisksJson(dir).map((r) => r.id), ["new-1"]);
    } finally { cleanup(dir); }
  });

  test("wrong-shape JSON ({\"foo\":1}) gets the same preservation", () => {
    const dir = makeCorruptWorkspace('{"foo": 1}');
    try {
      new RiskRegisterManager(dir).upsertRisk({ id: "new-1", status: "open" });
      assert.equal(corruptBaks(dir).length, 1);
    } finally { cleanup(dir); }
  });

  test("healthy store: no false preservation", () => {
    const dir = makeWorkspace();
    try {
      new RiskRegisterManager(dir).upsertRisk({ id: "new-1", status: "open" });
      assert.equal(corruptBaks(dir).length, 0, "a parseable store must never be renamed aside");
    } finally { cleanup(dir); }
  });

  test("absent file: no .bak, store created (existing behavior pinned)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fx368-absent-"));
    try {
      new RiskRegisterManager(dir).upsertRisk({ id: "new-1", status: "open" });
      assert.equal(corruptBaks(dir).length, 0);
      assert.deepEqual(readRisksJson(dir).map((r) => r.id), ["new-1"]);
    } finally { cleanup(dir); }
  });

  test("corrupt store + closeRisk: early return, corrupt file left in place untouched", () => {
    const dir = makeCorruptWorkspace();
    try {
      new RiskRegisterManager(dir).closeRisk("any-id");
      assert.equal(corruptBaks(dir).length, 0, "a no-op close must not preserve/rename");
      assert.equal(fs.readFileSync(risksJsonPath(dir), "utf-8"), CORRUPT,
        "the corrupt file must be untouched");
    } finally { cleanup(dir); }
  });

  test("getRisks() with a corrupt store still degrades to the backlog fallback (reads never rename)", () => {
    const dir = makeWorkspaceWithBacklog(3);
    try {
      fs.mkdirSync(path.join(dir, ".failsafe", "risks"), { recursive: true });
      fs.writeFileSync(risksJsonPath(dir), CORRUPT, "utf-8");
      const risks = new RiskRegisterManager(dir).getRisks();
      assert.equal(risks.length, 3, "display path keeps the fallback contract");
      assert.equal(corruptBaks(dir).length, 0, "reads must never preserve/rename");
      assert.equal(fs.readFileSync(risksJsonPath(dir), "utf-8"), CORRUPT);
    } finally { cleanup(dir); }
  });

  test("writeRisks() called directly on a corrupt store (the Console route path) preserves too", () => {
    const dir = makeCorruptWorkspace();
    try {
      new RiskRegisterManager(dir).writeRisks([{ id: "route-1", status: "open" }]);
      const baks = corruptBaks(dir);
      assert.equal(baks.length, 1, "route-path writes must get the same preservation (audit F1)");
      assert.equal(
        fs.readFileSync(path.join(dir, ".failsafe", "risks", baks[0]), "utf-8"), CORRUPT);
      assert.deepEqual(readRisksJson(dir).map((r) => r.id), ["route-1"]);
    } finally { cleanup(dir); }
  });
});

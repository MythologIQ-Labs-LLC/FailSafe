import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { WorkspaceArtifactBuilder } from "../../roadmap/services/WorkspaceArtifactBuilder";
import * as consumerAdapter from "../../qorlogic/consumer/consumer-adapter";
import * as metaLedgerModel from "../../qorlogic/meta-ledger-model";
import type { QorLogicVersionStatus } from "../../qorlogic/qorLogicInstallRecord";

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

// #233 iteration-5 Phase 3 fixtures: the same qor-consumer/* materialization convention
// consumer-adapter.test.ts and consumer-diagnostics.test.ts use. This file lives at
// src/test/roadmap/<file> (3 dirs below the extension root); resolving from a COMPILED
// out/test/roadmap/<file>.js's __dirname must still land on src/test/fixtures, since fixtures
// are never copied into out/ -- so this climbs all the way to the extension root and back down
// through src/, exactly like consumer-adapter.test.ts's FIXTURE_ROOT does for its own depth.
const QOR_CONSUMER_FIXTURE_ROOT = path.resolve(
  __dirname, "..", "..", "..", "src", "test", "fixtures", "qor-consumer",
);

function materializeQorConsumer(fixture: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wab-qc-"));
  fs.cpSync(path.join(QOR_CONSUMER_FIXTURE_ROOT, fixture), root, { recursive: true });
  const wsDocs = path.join(root, "ws-docs");
  if (fs.existsSync(wsDocs)) fs.renameSync(wsDocs, path.join(root, "docs"));
  const gates = path.join(root, "qor-gates");
  if (fs.existsSync(gates)) {
    fs.mkdirSync(path.join(root, ".qor"), { recursive: true });
    fs.renameSync(gates, path.join(root, ".qor", "gates"));
  }
  return root;
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

// #233 iteration-5, plan-233-read-ledger-once.md Phase 3: build() collapses the three seams it
// owns (adapter gate, readGovernanceState's raw read, diagnostics' second adapter call) into one
// read and one parseMetaLedgerEntries call, with zero change to reported state. All expected
// values below were captured empirically from the CURRENT (pre-refactor) implementation running
// against these same fixtures, not re-derived from the new code, so the equivalence assertions are
// genuinely falsifiable rather than circular.
suite("WorkspaceArtifactBuilder read/parse collapse (#233 iteration-5 Phase 3, FX930)", () => {
  const BELOW_FLOOR: QorLogicVersionStatus = { installed: "0.50.0", minimum: "0.100.0", meetsFloor: false, testedAgainst: '0.169.0', matchesTested: false };

  test("supported fixture: reads META_LEDGER.md exactly 3 times (was 5) and calls parseMetaLedgerEntries exactly 1 time (was 2), 0 from inside applyVersionFloor", () => {
    const root = materializeQorConsumer("supported");
    const ledgerPath = path.join(root, "docs", "META_LEDGER.md");

    // Patch the actual require(...) module objects, not the TS namespace-import wrappers
    // (`import * as x`) -- under this repo's esModuleInterop/commonjs config those wrappers'
    // members can be getter-only at runtime, but the getters dereference the real module
    // object live, so a direct patch on the require()-returned object is observed by every
    // other file's `import * as x` of the same module (verified empirically).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const trueFs = require("fs") as typeof fs;
    const originalRead = trueFs.readFileSync;
    let readCalls = 0;
    trueFs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
      if (args[0] === ledgerPath) readCalls++;
      return originalRead(...(args as Parameters<typeof originalRead>));
    }) as typeof fs.readFileSync;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const trueMeta = require("../../qorlogic/meta-ledger-model") as typeof metaLedgerModel;
    const originalParse = trueMeta.parseMetaLedgerEntries;
    let parseCalls = 0;
    trueMeta.parseMetaLedgerEntries = ((text: string) => {
      parseCalls++;
      return originalParse(text);
    }) as typeof metaLedgerModel.parseMetaLedgerEntries;

    // Scoped spy around applyVersionFloor specifically: it must derive its output from the
    // already-classified envelope without re-parsing (the #595-demonstrated regression).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const trueConsumerAdapter = require("../../qorlogic/consumer/consumer-adapter") as typeof consumerAdapter;
    const originalApplyVersionFloor = trueConsumerAdapter.applyVersionFloor;
    let parseCallsInsideApplyVersionFloor = 0;
    trueConsumerAdapter.applyVersionFloor = ((env, vs) => {
      const before = parseCalls;
      const result = originalApplyVersionFloor(env, vs);
      parseCallsInsideApplyVersionFloor += parseCalls - before;
      return result;
    }) as typeof consumerAdapter.applyVersionFloor;

    try {
      new WorkspaceArtifactBuilder(root).build();
      assert.equal(readCalls, 3, "supported: exactly 3 reads of META_LEDGER.md (was 5)");
      assert.equal(parseCalls, 1, "supported: exactly 1 parseMetaLedgerEntries call (was 2)");
      assert.equal(parseCallsInsideApplyVersionFloor, 0, "applyVersionFloor must never re-parse");
    } finally {
      trueFs.readFileSync = originalRead;
      trueMeta.parseMetaLedgerEntries = originalParse;
      trueConsumerAdapter.applyVersionFloor = originalApplyVersionFloor;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("malformed fixture: reads META_LEDGER.md exactly 2 times (was 4), MetaLedgerReader skipped when ledgerReadable is false", () => {
    const root = materializeQorConsumer("malformed");
    const ledgerPath = path.join(root, "docs", "META_LEDGER.md");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const trueFs = require("fs") as typeof fs;
    const original = trueFs.readFileSync;
    let calls = 0;
    trueFs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
      if (args[0] === ledgerPath) calls++;
      return original(...(args as Parameters<typeof original>));
    }) as typeof fs.readFileSync;
    try {
      new WorkspaceArtifactBuilder(root).build();
      assert.equal(calls, 2, "malformed: exactly 2 reads of META_LEDGER.md (was 4)");
    } finally {
      trueFs.readFileSync = original;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("supported fixture: snapshot fields deep-equal the empirically-captured pre-change output (zero behavior change)", () => {
    const root = materializeQorConsumer("supported");
    try {
      const snap = new WorkspaceArtifactBuilder(root).build();
      assert.deepEqual(snap.ledgerSummary, {
        totalEntries: 2,
        byKind: {
          GENESIS: 0, "GATE TRIBUNAL": 1, IMPLEMENTATION: 1, SUBSTANTIATION: 0,
          "SESSION SEAL": 0, PLAN: 0, "RESEARCH BRIEF": 0, REMEDIATION: 0,
          DELIVER: 0, WORKSPACE_ORGANIZATION: 0, OTHER: 0,
        },
        sessionsCompleted: 0, plansStarted: 1, sessionsInFlight: 1,
        latestEntry: { number: 2, kind: "IMPLEMENTATION", title: "Consumer Adapter", rawHeading: "### Entry #2: IMPLEMENTATION - Consumer Adapter" },
      });
      assert.deepEqual(snap.ledgerVerdicts, [{ id: "ledger-1", number: 1, kind: "GATE TRIBUNAL", title: "Consumer Adapter Plan" }]);
      assert.deepEqual(snap.ledgerCompletions, []);
      assert.equal(snap.shieldPhase, "IMPLEMENT");
      assert.equal(snap.latestVerdict, undefined);
      assert.equal(snap.qorConsumer.compatible, true);
      assert.equal(snap.qorConsumer.qorVersion, null);
      const states = Object.fromEntries(snap.qorConsumer.artifacts.map(a => [a.artifact, { state: a.state, reason: a.reason }]));
      assert.deepEqual(states, {
        META_LEDGER: { state: "ok", reason: null },
        FEATURE_INDEX: { state: "ok", reason: null },
        TRACKER_MANIFEST: { state: "ok", reason: null },
        AUDIT_GATE: { state: "unavailable", reason: "no valid audit session id (expected [A-Za-z0-9_-]+)" },
      });
      // mtimeIso is a real wall-clock timestamp and is deliberately excluded from the
      // equality check above -- it varies per test run/materialize() copy and is not part of
      // the behavior this refactor claims to preserve. sourcePath IS checked for shape.
      for (const a of snap.qorConsumer.artifacts) {
        assert.ok(a.provenance.sourcePath.startsWith(root), `${a.artifact} sourcePath rooted at workspace`);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("below-floor versionStatus: ledgerSummary still reports real entries (rendering not suppressed) AND qorConsumer reports META_LEDGER unsupported + compatible false", () => {
    const root = materializeQorConsumer("supported");
    try {
      const snap = new WorkspaceArtifactBuilder(root, BELOW_FLOOR).build();
      assert.equal(snap.ledgerSummary.totalEntries, 2, "B197: below-floor installs keep rendering the ledger");
      assert.equal(snap.qorConsumer.compatible, false);
      assert.equal(snap.qorConsumer.qorVersion, "0.50.0");
      const ledger = snap.qorConsumer.artifacts.find(a => a.artifact === "META_LEDGER");
      assert.equal(ledger?.state, "unsupported");
      assert.equal(ledger?.reason, "qor-logic 0.50.0 is below the required minimum 0.100.0");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("malformed fixture: ledgerSummary is the empty summary AND qorConsumer reports META_LEDGER malformed + compatible false", () => {
    const root = materializeQorConsumer("malformed");
    try {
      const snap = new WorkspaceArtifactBuilder(root).build();
      assert.equal(snap.ledgerSummary.totalEntries, 0, "explicit empty, no fabricated entries");
      assert.equal(snap.ledgerSummary.latestEntry, null);
      assert.deepEqual(snap.ledgerVerdicts, []);
      assert.deepEqual(snap.ledgerCompletions, []);
      assert.equal(snap.qorConsumer.compatible, false);
      const ledger = snap.qorConsumer.artifacts.find(a => a.artifact === "META_LEDGER");
      assert.equal(ledger?.state, "malformed");
      assert.ok(ledger?.reason?.includes("META_LEDGER.md"), `reason names source: ${ledger?.reason}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

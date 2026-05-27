import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { AgentRunRecorder } from "../../sentinel/AgentRunRecorder";

type EventCallback = (event: { type: string; timestamp: string; payload: unknown }) => void;

class StubEventBus {
  private allHandlers: EventCallback[] = [];
  private emitted: { type: string; payload: unknown }[] = [];

  on(_type: string, _cb: (...args: unknown[]) => void) { return () => {}; }
  onAll(cb: EventCallback) {
    this.allHandlers.push(cb);
    return () => { this.allHandlers = this.allHandlers.filter((h) => h !== cb); };
  }

  emit(type: string, payload: unknown) {
    this.emitted.push({ type, payload });
    const event = { type, timestamp: new Date().toISOString(), payload };
    for (const h of this.allHandlers) { h(event); }
  }

  getEmitted(type: string) {
    return this.emitted.filter((e) => e.type === type);
  }
}

describe("AgentRunRecorder", () => {
  let bus: StubEventBus;
  let recorder: AgentRunRecorder;
  let tmpDir: string;

  beforeEach(() => {
    bus = new StubEventBus();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-test-"));
    recorder = new AgentRunRecorder(bus as any, tmpDir);
  });

  afterEach(() => {
    recorder.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("startRun creates a run with correct fields", () => {
    const run = recorder.startRun("did:test:1", "claude");
    assert.ok(run.id);
    assert.equal(run.agentDid, "did:test:1");
    assert.equal(run.agentType, "claude");
    assert.equal(run.agentSource, "manual");
    assert.equal(run.status, "running");
    assert.deepEqual(run.steps, []);
  });

  it("endRun sets status and endedAt", () => {
    const run = recorder.startRun("did:test:1", "claude");
    const ended = recorder.endRun(run.id, "completed");
    assert.ok(ended);
    assert.equal(ended!.status, "completed");
    assert.ok(ended!.endedAt);
  });

  it("endRun returns undefined for unknown runId", () => {
    assert.equal(recorder.endRun("nonexistent"), undefined);
  });

  it("maps sentinel.verdict PASS to verdictPass step", () => {
    recorder.startRun("did:test:1", "claude");
    bus.emit("sentinel.verdict", {
      decision: "PASS", artifactPath: "src/index.ts", summary: "ok",
    });
    const steps = recorder.getActiveRuns()[0].steps;
    assert.equal(steps.length, 1);
    assert.equal(steps[0].kind, "verdictPass");
    assert.ok(steps[0].title.includes("PASS"));
  });

  it("maps sentinel.verdict BLOCK to verdictBlock step", () => {
    recorder.startRun("did:test:1", "claude");
    bus.emit("sentinel.verdict", {
      decision: "BLOCK", artifactPath: "bad.ts", summary: "blocked",
    });
    const steps = recorder.getActiveRuns()[0].steps;
    assert.equal(steps[0].kind, "verdictBlock");
  });

  it("maps qorelogic.trustUpdate to trustUpdate step", () => {
    recorder.startRun("did:test:1", "claude");
    bus.emit("qorelogic.trustUpdate", { did: "did:test:1", newScore: 0.75, reason: "good" });
    const steps = recorder.getActiveRuns()[0].steps;
    assert.equal(steps[0].kind, "trustUpdate");
  });

  it("ignores events when no active run", () => {
    bus.emit("sentinel.verdict", { decision: "PASS" });
    assert.equal(recorder.getActiveRuns().length, 0);
    assert.equal(recorder.getCompletedRuns().length, 0);
  });

  it("getActiveRuns returns only running runs", () => {
    const run1 = recorder.startRun("did:1", "claude");
    recorder.startRun("did:2", "copilot");
    recorder.endRun(run1.id);
    assert.equal(recorder.getActiveRuns().length, 1);
  });

  it("getCompletedRuns respects max buffer", () => {
    for (let i = 0; i < 55; i++) {
      const run = recorder.startRun(`did:${i}`, "claude");
      recorder.endRun(run.id);
    }
    assert.ok(recorder.getCompletedRuns().length <= 50);
  });

  it("dispose marks active runs as failed", () => {
    recorder.startRun("did:test:1", "claude");
    recorder.dispose();
    // After dispose, check persisted file
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".json"));
    assert.equal(files.length, 1);
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), "utf-8"));
    assert.equal(data.status, "failed");
  });

  it("steps are sequentially numbered", () => {
    recorder.startRun("did:test:1", "claude");
    bus.emit("sentinel.verdict", { decision: "PASS", summary: "a" });
    bus.emit("qorelogic.trustUpdate", { did: "x", newScore: 0.5, reason: "b" });
    bus.emit("sentinel.verdict", { decision: "BLOCK", summary: "c" });
    const steps = recorder.getActiveRuns()[0].steps;
    assert.equal(steps[0].seq, 1);
    assert.equal(steps[1].seq, 2);
    assert.equal(steps[2].seq, 3);
  });

  it("returns null for unmapped event types", () => {
    recorder.startRun("did:test:1", "claude");
    bus.emit("genesis.streamEvent", { data: "test" });
    assert.equal(recorder.getActiveRuns()[0].steps.length, 0);
  });

  it("emits agentRun.started on startRun", () => {
    recorder.startRun("did:test:1", "claude");
    assert.ok(bus.getEmitted("agentRun.started").length > 0);
  });

  it("emits agentRun.completed on endRun", () => {
    const run = recorder.startRun("did:test:1", "claude");
    recorder.endRun(run.id);
    assert.ok(bus.getEmitted("agentRun.completed").length > 0);
  });

  it("persists completed runs to disk", () => {
    const run = recorder.startRun("did:test:1", "claude");
    recorder.endRun(run.id);
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".json"));
    assert.equal(files.length, 1);
  });

  it("loadRun reads persisted run from disk", () => {
    const run = recorder.startRun("did:test:1", "claude");
    const id = run.id;
    recorder.endRun(id);
    const loaded = recorder.loadRun(id);
    assert.ok(loaded);
    assert.equal(loaded!.id, id);
    assert.equal(loaded!.status, "completed");
  });

  it("loadRun returns null for unknown runId", () => {
    assert.equal(recorder.loadRun("nonexistent"), null);
  });

  it("handles ide.taskStarted by starting a run", () => {
    bus.emit("ide.taskStarted", { agentDid: "did:ide:1", agentType: "copilot" });
    assert.equal(recorder.getActiveRuns().length, 1);
    assert.equal(recorder.getActiveRuns()[0].agentSource, "ide-task");
  });

  it("handles ide.taskEnded by ending the run", () => {
    bus.emit("ide.taskStarted", { agentDid: "did:ide:1", agentType: "copilot" });
    assert.equal(recorder.getActiveRuns().length, 1);
    bus.emit("ide.taskEnded", {});
    assert.equal(recorder.getActiveRuns().length, 0);
    assert.equal(recorder.getCompletedRuns().length, 1);
  });

  // FX702 — attachProvenance method
  describe("FX702 — attachProvenance", () => {
    it("sets provenance on an active run and returns true", () => {
      const run = recorder.startRun("did:test:1", "claude");
      const ok = recorder.attachProvenance(run.id, {
        source: "open-design",
        projectId: "proj-fx702",
      });
      assert.equal(ok, true);
      const fetched = recorder.getRun(run.id);
      assert.ok(fetched);
      assert.deepEqual(fetched!.provenance, {
        source: "open-design",
        projectId: "proj-fx702",
      });
    });

    it("returns false for an unknown runId", () => {
      const ok = recorder.attachProvenance("nonexistent-run-id", {
        source: "open-design",
        projectId: "p",
      });
      assert.equal(ok, false);
    });

    it("is idempotent on repeat call with same provenance", () => {
      const run = recorder.startRun("did:test:1", "claude");
      recorder.attachProvenance(run.id, {
        source: "open-design",
        projectId: "proj-idem",
      });
      const ok = recorder.attachProvenance(run.id, {
        source: "open-design",
        projectId: "proj-idem",
      });
      assert.equal(ok, true);
      const fetched = recorder.getRun(run.id);
      assert.deepEqual(fetched!.provenance, {
        source: "open-design",
        projectId: "proj-idem",
      });
    });

    it("clears the provenance field when null is passed", () => {
      const run = recorder.startRun("did:test:1", "claude");
      recorder.attachProvenance(run.id, {
        source: "open-design",
        projectId: "p",
      });
      const ok = recorder.attachProvenance(run.id, null);
      assert.equal(ok, true);
      const fetched = recorder.getRun(run.id);
      assert.equal(fetched!.provenance, undefined);
    });
  });
});

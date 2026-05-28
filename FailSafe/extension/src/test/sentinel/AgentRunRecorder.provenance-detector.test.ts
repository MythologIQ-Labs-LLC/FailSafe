/**
 * FX703 — AgentRunRecorder x IAgentProvenanceDetector wiring tests.
 *
 * Verifies that handleFileEdit consults registered detectors and attaches
 * the first non-null provenance to every active run that does not already
 * carry one. Regression-guards the original (no-detector) handleFileEdit
 * behaviour and exercises detector-isolation invariants (throw, null).
 */

import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { AgentRunRecorder } from "../../sentinel/AgentRunRecorder";
import type { IAgentProvenanceDetector } from "../../sentinel/IAgentProvenanceDetector";
import { OpenDesignProvenanceDetector } from "../../integrations/open-design/OpenDesignProvenanceDetector";
import type { AgentProvenance } from "../../shared/types/agentRun";

type EventCallback = (event: { type: string; timestamp: string; payload: unknown }) => void;

class StubEventBus {
  private allHandlers: EventCallback[] = [];
  on(_type: string, _cb: (...args: unknown[]) => void) { return () => {}; }
  onAll(cb: EventCallback) {
    this.allHandlers.push(cb);
    return () => { this.allHandlers = this.allHandlers.filter((h) => h !== cb); };
  }
  emit(type: string, payload: unknown) {
    const event = { type, timestamp: new Date().toISOString(), payload };
    for (const h of this.allHandlers) { h(event); }
  }
}

describe("FX703 — AgentRunRecorder provenance-detector wiring", () => {
  let bus: StubEventBus;
  let tmpDir: string;

  beforeEach(() => {
    bus = new StubEventBus();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-test-prov-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("auto-attaches Open Design provenance when filePath matches .od/artifacts/", () => {
    const recorder = new AgentRunRecorder(bus as any, tmpDir, {
      provenanceDetectors: [new OpenDesignProvenanceDetector()],
    });
    const run = recorder.startRun("did:test:1", "claude");
    recorder.handleFileEdit(
      "/workspace/.od/artifacts/proj-fx703/foo.html",
      "did:test:1",
    );
    const fetched = recorder.getRun(run.id);
    assert.ok(fetched);
    assert.deepEqual(fetched!.provenance, {
      source: "open-design",
      projectId: "proj-fx703",
    });
    recorder.dispose();
  });

  it("does NOT attach provenance when no detector is registered (regression guard)", () => {
    const recorder = new AgentRunRecorder(bus as any, tmpDir);
    const run = recorder.startRun("did:test:1", "claude");
    recorder.handleFileEdit(
      "/workspace/.od/artifacts/proj-x/foo.html",
      "did:test:1",
    );
    const fetched = recorder.getRun(run.id);
    assert.ok(fetched);
    assert.equal(fetched!.provenance, undefined);
    // Step still recorded (existing behaviour).
    assert.equal(fetched!.steps.length, 1);
    recorder.dispose();
  });

  it("multiple detectors fire in registration order; first non-null wins", () => {
    const calls: string[] = [];
    const detA: IAgentProvenanceDetector = {
      detectFromFilePath(_fp) { calls.push("A"); return null; },
    };
    const detB: IAgentProvenanceDetector = {
      detectFromFilePath(_fp): AgentProvenance {
        calls.push("B");
        return { source: "open-design", projectId: "from-B" };
      },
    };
    const detC: IAgentProvenanceDetector = {
      detectFromFilePath(_fp): AgentProvenance {
        calls.push("C");
        return { source: "open-design", projectId: "from-C" };
      },
    };
    const recorder = new AgentRunRecorder(bus as any, tmpDir, {
      provenanceDetectors: [detA, detB, detC],
    });
    const run = recorder.startRun("did:test:1", "claude");
    recorder.handleFileEdit("/any/path/file.ts", "did:test:1");
    const fetched = recorder.getRun(run.id);
    assert.deepEqual(fetched!.provenance, {
      source: "open-design",
      projectId: "from-B",
    });
    // A + B ran; C MUST NOT have been called (first non-null wins).
    assert.deepEqual(calls, ["A", "B"]);
    recorder.dispose();
  });

  it("detector returning null is skipped without altering provenance", () => {
    const det: IAgentProvenanceDetector = {
      detectFromFilePath(_fp) { return null; },
    };
    const recorder = new AgentRunRecorder(bus as any, tmpDir, {
      provenanceDetectors: [det],
    });
    const run = recorder.startRun("did:test:1", "claude");
    recorder.handleFileEdit("/workspace/src/foo.ts", "did:test:1");
    const fetched = recorder.getRun(run.id);
    assert.equal(fetched!.provenance, undefined);
    recorder.dispose();
  });

  it("detector throwing is isolated; recorder remains functional", () => {
    const badDet: IAgentProvenanceDetector = {
      detectFromFilePath(_fp) { throw new Error("detector boom"); },
    };
    const recorder = new AgentRunRecorder(bus as any, tmpDir, {
      provenanceDetectors: [badDet],
    });
    const run = recorder.startRun("did:test:1", "claude");
    assert.doesNotThrow(() => {
      recorder.handleFileEdit("/workspace/.od/artifacts/p/x.html", "did:test:1");
    });
    // The fileEdit step is still recorded — recorder did not crash mid-loop.
    const fetched = recorder.getRun(run.id);
    assert.equal(fetched!.steps.length, 1);
    assert.equal(fetched!.provenance, undefined);
    recorder.dispose();
  });
});

// FX895 — route-level placeholder rejection (#238). POST /transcript carrying
// the STT failure literal must return a typed 422, broadcast nothing, and
// leave the graph byte-identical. Lives in a sibling file because
// brainstorm-route.test.ts is already 354 lines (>250 razor cap) — adding a
// suite there would deepen a pre-existing overage.
// Uses the REAL BrainstormService so the guard is exercised end-to-end
// through the route (defense-in-depth evidence, not stub theater).

import { strict as assert } from "assert";
import { setupBrainstormRoutes } from "../../roadmap/routes/BrainstormRoute";
import { BrainstormService } from "../../roadmap/services/BrainstormService";
import type { ApiRouteDeps } from "../../roadmap/routes/types";
import { RouteHarness, makeApp } from "./helpers/routeTestHarness";

function makeDeps(service: BrainstormService): {
  deps: ApiRouteDeps;
  broadcasts: Array<Record<string, unknown>>;
} {
  const broadcasts: Array<Record<string, unknown>> = [];
  const deps = {
    rejectIfRemote: () => false,
    broadcast: (data: Record<string, unknown>) => { broadcasts.push(data); },
    brainstormService: service,
    audioVaultService: { storeAudio: async () => "hash", getAudio: async () => null },
  } as unknown as ApiRouteDeps;
  return { deps, broadcasts };
}

suite("BrainstormRoute placeholder rejection (FX895 / FX084)", () => {
  let harness: RouteHarness;
  teardown(async () => { if (harness) await harness.stop(); });

  test("POST /transcript with failure literal -> 422 rejected, no broadcast, no LLM call, graph identical", async () => {
    let llmCalls = 0;
    const service = new BrainstormService(async () => { llmCalls++; return "{}"; });
    service.addNode("Existing idea", "Feature", "n-keep");
    const app = makeApp();
    const { deps, broadcasts } = makeDeps(service);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();

    const before = await harness.request({ path: "/api/v1/brainstorm/graph" });
    assert.equal(before.status, 200);
    assert.equal(before.body.nodes.length, 1, "seeded graph baseline");

    const res = await harness.request({
      method: "POST", path: "/api/v1/brainstorm/transcript",
      body: { transcript: "[transcription failed]" },
    });
    assert.equal(res.status, 422, "typed refusal must be a 422");
    assert.equal(res.body.status, "rejected");
    assert.equal(res.body.reason, "placeholder_rejected");
    assert.equal(llmCalls, 0, "llmEvaluate must never run for placeholder text");
    assert.deepEqual(broadcasts, [], "no brainstorm.update (or any) broadcast on rejection");

    const after = await harness.request({ path: "/api/v1/brainstorm/graph" });
    assert.deepEqual(after.body, before.body, "GET /graph must be identical before/after");
  });

  test("POST /transcript with bracket-wrapped diagnostic -> 422, graph untouched", async () => {
    const service = new BrainstormService(async () => "{}");
    const app = makeApp();
    const { deps, broadcasts } = makeDeps(service);
    setupBrainstormRoutes(app, deps);
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({
      method: "POST", path: "/api/v1/brainstorm/transcript",
      body: { transcript: "[decode error]" },
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.status, "rejected");
    assert.deepEqual(broadcasts, []);
    assert.deepEqual(service.getGraph(), { nodes: [], edges: [] });
  });
});

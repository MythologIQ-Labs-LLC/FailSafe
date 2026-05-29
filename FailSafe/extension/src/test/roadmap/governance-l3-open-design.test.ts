/**
 * FX811 (unit) — GovernanceRenderer.renderL3Queue Open Design create_artifact row.
 *
 * Plan: plan-b-od-8-create-artifact-l3.md Phase 4.
 *
 * Asserts:
 *  - an L3 entry with kind 'open-design-create-artifact' renders a
 *    .cc-l3-opendesign block showing the tool + an args summary
 *  - the row carries Approve + Reject buttons with data-id/data-decision
 *  - clicking Approve POSTs /api/actions/decide-l3 with {id, decision:'APPROVED'}
 *  - a non-OD kind renders no .cc-l3-opendesign block
 *  - args containing <script> is HTML-escaped
 */

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GovernanceRenderer } = require("../../roadmap/ui/modules/governance.js");

interface PostCall { path: string; body: unknown; }

function makeContainer(): { dom: JSDOM; renderer: any; posts: PostCall[] } {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="gov"></div></body></html>`, { url: "http://localhost/" });
  (global as any).document = dom.window.document;
  (global as any).window = dom.window;
  (global as any).CSS = dom.window.CSS;
  const posts: PostCall[] = [];
  const client = {
    on: () => {},
    postAction: async (path: string, body: unknown) => { posts.push({ path, body }); },
  };
  const renderer = new GovernanceRenderer("gov", { client });
  return { dom, renderer, posts };
}

function hub(l3Queue: any[]) {
  return {
    sentinelStatus: {}, l3Queue, chainValid: null, metricIntegrity: [],
    unattributedFileActivity: { count: 0, recent: [] }, recentModeTransitions: [],
  };
}

function odItem(args: Record<string, unknown>) {
  return {
    id: "od-1", filePath: "open-design:create_artifact", riskGrade: "L3",
    queuedAt: "2026-05-28T00:00:00Z",
    kind: "open-design-create-artifact", meta: { tool: "create_artifact", args },
  };
}

suite("FX811 GovernanceRenderer L3 Open Design create_artifact row", () => {
  test("renders .cc-l3-opendesign with tool + args summary + Approve/Reject", () => {
    const { dom, renderer } = makeContainer();
    renderer.render(hub([odItem({ name: "hero.svg" })]));
    const block = dom.window.document.querySelector(".cc-l3-opendesign");
    assert.ok(block, "OD L3 block rendered");
    assert.ok(block!.textContent!.includes("create_artifact"), "tool shown");
    assert.ok(block!.textContent!.includes("hero.svg"), "args summary shown");
    const approve = dom.window.document.querySelector('.cc-l3-decide[data-decision="APPROVED"]') as HTMLButtonElement;
    const reject = dom.window.document.querySelector('.cc-l3-decide[data-decision="REJECTED"]') as HTMLButtonElement;
    assert.ok(approve && reject, "Approve + Reject buttons present");
    assert.equal(approve.dataset.id, "od-1");
  });

  test("clicking Approve POSTs /api/actions/decide-l3 with the id + APPROVED", async () => {
    const { dom, renderer, posts } = makeContainer();
    renderer.render(hub([odItem({ name: "x" })]));
    const approve = dom.window.document.querySelector('.cc-l3-decide[data-decision="APPROVED"]') as HTMLButtonElement;
    approve.click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(posts.length, 1);
    assert.equal(posts[0].path, "/api/actions/decide-l3");
    assert.deepEqual(posts[0].body, { id: "od-1", decision: "APPROVED" });
  });

  test("clicking Reject POSTs decide-l3 with REJECTED", async () => {
    const { dom, renderer, posts } = makeContainer();
    renderer.render(hub([odItem({ name: "x" })]));
    const reject = dom.window.document.querySelector('.cc-l3-decide[data-decision="REJECTED"]') as HTMLButtonElement;
    reject.click();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(posts[0].body, { id: "od-1", decision: "REJECTED" });
  });

  test("non-OD kind renders no .cc-l3-opendesign block", () => {
    const { dom, renderer } = makeContainer();
    renderer.render(hub([{ id: "x", filePath: "f", riskGrade: "L2", kind: "bicameral-drift-resolution" }]));
    assert.equal(dom.window.document.querySelectorAll(".cc-l3-opendesign").length, 0);
  });

  test("args containing <script> is HTML-escaped", () => {
    const { dom, renderer } = makeContainer();
    renderer.render(hub([odItem({ evil: "<script>alert(1)</script>" })]));
    const block = dom.window.document.querySelector(".cc-l3-opendesign")!;
    assert.ok(!block.innerHTML.includes("<script>"), `raw <script> present: ${block.innerHTML}`);
    assert.ok(block.innerHTML.includes("&lt;script&gt;"), "escaped marker present");
  });
});

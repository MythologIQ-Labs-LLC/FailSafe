/**
 * FX556: GovernanceRenderer.renderL3Queue preflight-conflict line.
 *
 * Plan: docs/plan-qor-b-int-2-preflight-l3.md Phase 3 (B-INT-2).
 *
 * Asserts:
 *  - an L3 entry with one drifted decision renders a .l3-preflight-conflict
 *    line whose text includes the decision title
 *  - two drifted decisions render two conflict lines
 *  - an entry with no meta.preflight renders no .l3-preflight-conflict element
 *  - a decision title containing <script> is HTML-escaped
 */

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GovernanceRenderer } = require("../../roadmap/ui/modules/governance.js");

function makeContainer(): { dom: JSDOM; renderer: any } {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="gov"></div></body></html>`, { url: "http://localhost/" });
  (global as any).document = dom.window.document;
  (global as any).window = dom.window;
  (global as any).CSS = dom.window.CSS;
  const renderer = new GovernanceRenderer("gov");
  return { dom, renderer };
}

function hub(l3Queue: any[]) {
  return {
    sentinelStatus: {},
    l3Queue,
    chainValid: null,
    metricIntegrity: [],
    unattributedFileActivity: { count: 0, recent: [] },
    recentModeTransitions: [],
  };
}

function l3Item(driftedDecisions?: any[]) {
  const item: any = {
    id: "l3-1",
    filePath: "src/foo.ts",
    riskGrade: "L3",
    queuedAt: "2026-05-20T00:00:00Z",
  };
  if (driftedDecisions) {
    item.meta = { preflight: { driftedDecisions, checkedAt: "2026-05-20T00:00:00Z" } };
  }
  return item;
}

suite("FX556 GovernanceRenderer.renderL3Queue preflight conflict", () => {
  test("one drifted decision → .l3-preflight-conflict line with the title", () => {
    const { dom, renderer } = makeContainer();
    renderer.render(hub([l3Item([{ decisionId: "d1", title: "Adopt 15-min TTL" }])]));
    const lines = dom.window.document.querySelectorAll(".l3-preflight-conflict");
    assert.equal(lines.length, 1);
    assert.ok(lines[0].textContent!.includes("Adopt 15-min TTL"), lines[0].textContent || "");
  });

  test("two drifted decisions → two conflict lines", () => {
    const { dom, renderer } = makeContainer();
    renderer.render(hub([l3Item([
      { decisionId: "d1", title: "First decision" },
      { decisionId: "d2", title: "Second decision" },
    ])]));
    const lines = dom.window.document.querySelectorAll(".l3-preflight-conflict");
    assert.equal(lines.length, 2);
  });

  test("no meta.preflight → no .l3-preflight-conflict element", () => {
    const { dom, renderer } = makeContainer();
    renderer.render(hub([l3Item()]));
    const lines = dom.window.document.querySelectorAll(".l3-preflight-conflict");
    assert.equal(lines.length, 0);
  });

  test("decision title containing <script> is HTML-escaped", () => {
    const { dom, renderer } = makeContainer();
    renderer.render(hub([l3Item([{ decisionId: "d1", title: "<script>alert('x')</script>" }])]));
    const line = dom.window.document.querySelector(".l3-preflight-conflict")!;
    assert.ok(!line.innerHTML.includes("<script>"), `raw <script> present: ${line.innerHTML}`);
    assert.ok(line.innerHTML.includes("&lt;script&gt;"), `expected escaped marker missing: ${line.innerHTML}`);
  });
});

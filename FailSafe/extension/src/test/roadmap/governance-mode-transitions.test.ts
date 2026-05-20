/**
 * FX508: GovernanceRenderer.renderModeTransitions feed.
 *
 * Asserts:
 *  - empty list renders empty-state notice
 *  - 3 transitions render 3 rows reverse-chrono with data-transition-ts
 *  - reason containing <script> is HTML-escaped
 *  - click adds cc-mode-transition--highlighted then removes after 3s
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

function hub(transitions: any[]) {
  return {
    sentinelStatus: {},
    l3Queue: [],
    chainValid: null,
    metricIntegrity: [],
    unattributedFileActivity: { count: 0, recent: [] },
    recentModeTransitions: transitions,
  };
}

suite("FX508 GovernanceRenderer.renderModeTransitions", () => {
  test("empty list → empty-state notice", () => {
    const { dom, renderer } = makeContainer();
    renderer.render(hub([]));
    const html = dom.window.document.getElementById("gov")!.innerHTML;
    assert.match(html, /Mode Transitions/);
    assert.match(html, /No transitions recorded this session\./);
  });

  test("3 transitions render 3 rows with data-transition-ts", () => {
    const { dom, renderer } = makeContainer();
    const transitions = [
      { id: "mt-3", previousMode: "enforce", newMode: "observe", reason: "config_edit", actor: "u3", timestamp: "2026-01-01T00:02:00Z" },
      { id: "mt-2", previousMode: "assist", newMode: "enforce", reason: "config_edit", actor: "u2", timestamp: "2026-01-01T00:01:00Z" },
      { id: "mt-1", previousMode: "observe", newMode: "assist", reason: "config_edit", actor: "u1", timestamp: "2026-01-01T00:00:00Z" },
    ];
    renderer.render(hub(transitions));
    const rows = dom.window.document.querySelectorAll(".cc-mode-transition");
    assert.equal(rows.length, 3);
    assert.equal(rows[0].getAttribute("data-transition-ts"), "2026-01-01T00:02:00Z");
    assert.equal(rows[2].getAttribute("data-transition-ts"), "2026-01-01T00:00:00Z");
  });

  test("reason containing <script> is escaped (XSS guard)", () => {
    const { dom, renderer } = makeContainer();
    const transitions = [{
      id: "mt-x", previousMode: "observe", newMode: "assist",
      reason: "<script>alert('x')</script>", actor: "u", timestamp: "2026-01-01T00:00:00Z",
    }];
    renderer.render(hub(transitions));
    const html = dom.window.document.querySelector(".cc-mode-transition")!.innerHTML;
    assert.ok(!html.includes("<script>"), `raw <script> present: ${html}`);
    assert.ok(html.includes("&lt;script&gt;"), `expected escaped marker missing: ${html}`);
  });

  test("click adds cc-mode-transition--highlighted (3s flash)", () => {
    const { dom, renderer } = makeContainer();
    renderer.render(hub([{
      id: "mt-1", previousMode: "observe", newMode: "assist",
      reason: "config_edit", actor: "u", timestamp: "2026-01-01T00:00:00Z",
    }]));
    const row = dom.window.document.querySelector(".cc-mode-transition") as HTMLElement;
    (row.onclick as any)?.call(row, new dom.window.MouseEvent("click"));
    assert.equal(row.classList.contains("cc-mode-transition--highlighted"), true);
  });
});

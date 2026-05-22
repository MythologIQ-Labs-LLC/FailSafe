// FX588 — B-INT-1: bicameral-advanced-tools.js renderAdvancedTools.
// Verifies the leaf section's render contract:
//   - all 11 tool invoke rows render;
//   - a tool absent from `capabilities` renders its Run button disabled
//     (B-BIC-13 capability-gating pattern), a present tool renders it enabled;
//   - the <details> "Advanced tools" section is collapsed by default.
// SG-035: each test invokes renderAdvancedTools and asserts on the output DOM.

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import in TS test context
import { renderAdvancedTools } from "../../../src/roadmap/ui/modules/bicameral-advanced-tools.js";

function parse(html: string): Document {
  return new JSDOM(`<!DOCTYPE html><div id="root">${html}</div>`).window.document;
}

const ALL_TOOLS = [
  "search", "brief", "judgeGaps", "dashboard", "validateSymbols", "getNeighbors",
  "ingest", "update", "reset", "resolveCompliance", "linkCommit",
];

suite("FX588 bicameral-advanced-tools renderAdvancedTools (B-INT-1)", () => {
  test("renders all 11 tool invoke rows", () => {
    const doc = parse(renderAdvancedTools({ capabilities: ALL_TOOLS }));
    const rows = doc.querySelectorAll(".cc-bicameral-tool-row");
    assert.equal(rows.length, 11, "one row per tool");
    for (const tool of ALL_TOOLS) {
      assert.ok(
        doc.querySelector(`.cc-bicameral-tool-row[data-tool="${tool}"]`),
        `row for ${tool} present`,
      );
    }
  });

  test("a tool absent from capabilities renders its Run button disabled", () => {
    // `dashboard` present, `ingest` absent.
    const doc = parse(renderAdvancedTools({ capabilities: ["dashboard"] }));
    const ingestBtn = doc.querySelector(
      '.cc-bicameral-tool-row[data-tool="ingest"] [data-action="bicameral-tool-invoke"]',
    ) as HTMLButtonElement;
    const dashboardBtn = doc.querySelector(
      '.cc-bicameral-tool-row[data-tool="dashboard"] [data-action="bicameral-tool-invoke"]',
    ) as HTMLButtonElement;
    assert.equal(ingestBtn.hasAttribute("disabled"), true, "absent tool → disabled Run");
    assert.equal(dashboardBtn.hasAttribute("disabled"), false, "present tool → enabled Run");
  });

  test("with no capabilities, every Run button is disabled (safe default)", () => {
    const doc = parse(renderAdvancedTools({}));
    const buttons = doc.querySelectorAll('[data-action="bicameral-tool-invoke"]');
    assert.equal(buttons.length, 11);
    for (const btn of Array.from(buttons)) {
      assert.equal(
        (btn as HTMLButtonElement).hasAttribute("disabled"), true,
        "absent capabilities gate all tools off",
      );
    }
  });

  test("the Advanced tools <details> is collapsed by default", () => {
    const doc = parse(renderAdvancedTools({ capabilities: ALL_TOOLS }));
    const details = doc.querySelector("details.cc-bicameral-advanced") as HTMLDetailsElement;
    assert.ok(details, "<details> section present");
    assert.equal(details.hasAttribute("open"), false, "section is collapsed (no open attr)");
    const summary = details.querySelector("summary");
    assert.match(summary?.textContent || "", /Advanced tools/i);
  });
});

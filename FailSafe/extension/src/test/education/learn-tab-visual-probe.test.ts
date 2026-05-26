// Phase 4 visual verification probe (plan-learn-tab-visual-rebuild).
// NOT a true test — emits the rendered HTML for each Learn sub-view to
// stdout via console.log so the operator can inspect the visual structure.
// Skipped by default; toggle via PROBE_LEARN_VISUAL=1 env var.

import { strict as assert } from "assert";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { LearnRenderer } from "../../roadmap/ui/modules/learn.js";
import { setupDom, type LearnTabTestEnv } from "./learn-tab-helpers";

const PROBE_ENABLED = process.env.PROBE_LEARN_VISUAL === "1";

(PROBE_ENABLED ? suite : suite.skip)("Phase 4 visual probe: Learn tab rendered HTML dump", () => {
  let env: LearnTabTestEnv;
  setup(() => { env = setupDom(); });
  teardown(() => env.restore());

  test("dump Read sub-view (default active)", () => {
    const renderer = new LearnRenderer("learn");
    renderer.render({
      activePlan: { phases: [] },
      recentCheckpoints: [],
      unattributedFileActivity: [],
      education: { enabled: true, proficiency: "beginner" },
    });
    const html = env.dom.window.document.getElementById("learn")!.innerHTML;
    console.log("\n===PROBE READ SUBVIEW START===");
    console.log(html);
    console.log("===PROBE READ SUBVIEW END===\n");
    assert.ok(html.length > 0);
  });

  test("dump Read sub-view with relevant-now trigger fired", () => {
    const renderer = new LearnRenderer("learn");
    renderer.render({
      activePlan: null,
      recentCheckpoints: [],
      unattributedFileActivity: [
        { eventId: "e1", timestamp: "2026-05-24T10:00:00Z", type: "change", artifactPath: "src/x.ts" },
      ],
      education: { enabled: true, proficiency: "beginner" },
    });
    const html = env.dom.window.document.getElementById("learn")!.innerHTML;
    console.log("\n===PROBE READ TRIGGER START===");
    console.log(html);
    console.log("===PROBE READ TRIGGER END===\n");
    assert.ok(html.length > 0);
  });

  test("dump Glossary sub-view (after pill click)", () => {
    const doc = env.dom.window.document;
    const renderer = new LearnRenderer("learn");
    renderer.render({
      education: { enabled: true, proficiency: "beginner" },
    });
    const glossaryPill = doc.querySelector('.cc-pill[data-key="glossary"]') as HTMLButtonElement;
    glossaryPill.click();
    const html = doc.getElementById("learn")!.innerHTML;
    console.log("\n===PROBE GLOSSARY SUBVIEW START===");
    console.log(html);
    console.log("===PROBE GLOSSARY SUBVIEW END===\n");
    assert.ok(html.length > 0);
  });

  test("dump Glossary sub-view with search active (single-token match)", () => {
    const doc = env.dom.window.document;
    const renderer = new LearnRenderer("learn");
    renderer.render({ education: { enabled: true, proficiency: "beginner" } });
    const glossaryPill = doc.querySelector('.cc-pill[data-key="glossary"]') as HTMLButtonElement;
    glossaryPill.click();
    const input = doc.querySelector('[data-learn-glossary-search]') as HTMLInputElement;
    input.value = "scope";
    input.dispatchEvent(new (doc.defaultView as any).Event("input"));
    const html = doc.getElementById("learn")!.innerHTML;
    console.log("\n===PROBE GLOSSARY SEARCH START===");
    console.log(html);
    console.log("===PROBE GLOSSARY SEARCH END===\n");
    assert.ok(html.length > 0);
  });
});

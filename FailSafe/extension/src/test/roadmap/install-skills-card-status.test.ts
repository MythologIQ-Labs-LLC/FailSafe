import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import in TS test context
import { renderInstallSkillsCard, bindInstallSkillsCard } from "../../../src/roadmap/ui/modules/install-skills-card.js";

suite("install-skills-card status and output", () => {
  test("#463: frozen mismatch is visible even when an installed version exceeds the old floor", () => {
    const dom = new JSDOM("<!DOCTYPE html><div></div>");
    (globalThis as any).document = dom.window.document;
    try {
      const snapshot = (installedVersion: string | null, matchesFrozen: boolean) =>
        ({ bootstrapState: { qorLogicInstall: {
          hosts: [], anyInstalled: false, installedVersion, frozenTarget: "0.176.1",
          matchesFrozen, minimumVersion: "0.31.1", meetsFloor: true,
        } } });
      const below = renderInstallSkillsCard({ running: false }, snapshot("0.30.0", false));
      assert.match(below, /cc-qorlogic-floor-warning/);
      assert.match(below, /installed v0\\.30\\.0/);
      const above = renderInstallSkillsCard({ running: false }, snapshot("0.177.0", false));
      assert.match(above, /cc-qorlogic-floor-warning/, "future version also diverges");
      assert.match(above, /No automatic|never silently/);
      const exact = renderInstallSkillsCard({ running: false }, snapshot("0.176.1", true));
      assert.equal(exact.includes("cc-qorlogic-floor-warning"), false);
      const missing = renderInstallSkillsCard({ running: false }, snapshot(null, false));
      assert.match(missing, /unknown or missing/);
      const absentMetadata = renderInstallSkillsCard(
        { running: false }, { bootstrapState: { qorLogicInstall: { hosts: [], anyInstalled: false } } },
      );
      assert.equal(absentMetadata.includes("cc-qorlogic-floor-warning"), false);
    } finally {
      delete (globalThis as any).document;
    }
  });
});

suite("install-skills-card status and output", () => {
  test("Show Output posts the output action", async () => {
    const dom = new JSDOM("<!DOCTYPE html><div id='root'></div>");
    (globalThis as any).document = dom.window.document;
    (globalThis as any).window = dom.window;
    (dom.window as any).__failsafeWebSocket = {
      readyState: 1, addEventListener() {}, removeEventListener() {},
    };
    const calls: Array<{ url: string; method?: string }> = [];
    (globalThis as any).fetch = async (url: string, init?: { method?: string }) => {
      calls.push({ url, method: init?.method });
      return { ok: true, status: 200, json: async () => ({}) };
    };
    try {
      const root = dom.window.document.getElementById("root")!;
      root.innerHTML = renderInstallSkillsCard({
        running: false,
        invocations: [{ phase: "python-probe", status: "success" }],
        lastReport: null,
      });
      bindInstallSkillsCard(root, {});
      (root.querySelector('[data-action="show-output"]') as HTMLElement).click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.deepStrictEqual(calls[0], { url: "/api/actions/show-output", method: "POST" });
    } finally {
      delete (globalThis as any).fetch;
      delete (globalThis as any).document;
      delete (globalThis as any).window;
    }
  });
});

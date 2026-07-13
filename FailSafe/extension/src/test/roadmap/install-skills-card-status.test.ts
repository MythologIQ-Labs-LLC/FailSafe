import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import in TS test context
import { renderInstallSkillsCard, bindInstallSkillsCard } from "../../../src/roadmap/ui/modules/install-skills-card.js";

suite("install-skills-card status and output", () => {
  test("version-floor warning renders only for a verified floor violation", () => {
    const dom = new JSDOM("<!DOCTYPE html><div></div>");
    (globalThis as any).document = dom.window.document;
    try {
      const violation = renderInstallSkillsCard(
        { running: false, invocations: [], lastReport: null },
        { bootstrapState: { qorLogicInstall: {
          hosts: [], anyInstalled: false, installedVersion: "0.30.0",
          minimumVersion: "0.31.1", meetsFloor: false,
        } } },
      );
      assert.match(violation, /cc-qorlogic-floor-warning/);
      assert.match(violation, /qor-logic v0\.30\.0/);
      const healthy = renderInstallSkillsCard(
        { running: false, invocations: [], lastReport: null },
        { bootstrapState: { qorLogicInstall: {
          hosts: [], anyInstalled: false, installedVersion: "0.31.5",
          minimumVersion: "0.31.1", meetsFloor: true,
        } } },
      );
      assert.equal(healthy.includes("cc-qorlogic-floor-warning"), false);
      const unknown = renderInstallSkillsCard(
        { running: false, invocations: [], lastReport: null },
        { bootstrapState: { qorLogicInstall: { hosts: [], anyInstalled: false } } },
      );
      assert.equal(unknown.includes("cc-qorlogic-floor-warning"), false);
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

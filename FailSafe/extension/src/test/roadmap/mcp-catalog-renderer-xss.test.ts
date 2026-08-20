// #241 F-5 — MCP catalog display-path XSS boundary.
//
// F-5 recorded `sanitizeField` (mcp-registry) as a dead stored-XSS control. It
// is dead, but it was never the control protecting this path: the console
// catalog renderer escapes at its own sink. These tests hold THAT sink — the
// one actually reachable by an operator — to adversarial payloads, so the
// README's security claim is verified rather than asserted.
//
// jsdom functional test. SG-035: render real HTML, assert on real DOM.
// Imports the COMPILED leaf from out/ (copy-ui-js.cjs mirrors raw .js modules).

import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
// @ts-expect-error JS module import resolved from compiled out/ at runtime
import { McpCatalogRenderer } from "../../roadmap/ui/modules/mcp-catalog-renderer.js";

const PAYLOAD = '<img src=x onerror="alert(1)">';

function hostileEntries(): unknown[] {
  return [
    {
      id: `evil" onmouseover="alert(1)`,
      name: `<script>alert('name')</script>`,
      description: PAYLOAD,
      risk: { level: `low" onload="alert(1)`, score: `<b>9</b>` },
      install: { command: "npx", args: [`-y'; alert(1); '`] },
    },
  ];
}

function setupDom(entries: unknown[]): { dom: JSDOM; restore: () => void } {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><head></head><body><div id="mcp-root"></div></body></html>',
    { url: "http://localhost:9999" },
  );
  const prev = {
    window: (global as any).window,
    document: (global as any).document,
    fetch: (global as any).fetch,
  };
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  (global as any).fetch = async () => ({ ok: true, json: async () => ({ entries }) });
  return {
    dom,
    restore: () => {
      (global as any).window = prev.window;
      (global as any).document = prev.document;
      (global as any).fetch = prev.fetch;
    },
  };
}

suite("mcp-catalog-renderer XSS boundary (#241 F-5)", () => {
  test("catalog-controlled fields render as inert text, not markup", async () => {
    const { dom, restore } = setupDom(hostileEntries());
    try {
      await new McpCatalogRenderer("mcp-root").render();
      const root = dom.window.document.getElementById("mcp-root")!;

      assert.equal(root.querySelectorAll("script").length, 0, "payload created a <script> element");
      assert.equal(root.querySelectorAll("img").length, 0, "payload created an <img> element");
      assert.equal(root.querySelectorAll("b").length, 0, "payload created a <b> element");

      // The payload must survive as visible text — escaping, not stripping.
      assert.ok(root.textContent!.includes(PAYLOAD), "description payload was not rendered as text");
    } finally {
      restore();
    }
  });

  test("no attacker-controlled event handler or attribute escapes its quoting", async () => {
    const { dom, restore } = setupDom(hostileEntries());
    try {
      await new McpCatalogRenderer("mcp-root").render();
      const root = dom.window.document.getElementById("mcp-root")!;

      for (const el of Array.from(root.querySelectorAll("*"))) {
        for (const attr of Array.from(el.attributes)) {
          assert.ok(
            !attr.name.startsWith("on"),
            `payload injected an event-handler attribute: ${el.tagName}[${attr.name}]`,
          );
        }
      }

      // The hostile id must land intact inside data-id rather than breaking out
      // of the attribute and spawning new ones.
      const card = root.querySelector(".cc-mcp-card")!;
      assert.equal(card.getAttribute("data-id"), `evil" onmouseover="alert(1)`);
    } finally {
      restore();
    }
  });

  test("no URL sink exists on the catalog surface", async () => {
    const { dom, restore } = setupDom([
      {
        id: "url-sink",
        name: "javascript:alert(1)",
        description: "javascript:alert(1)",
        risk: { level: "low", score: 0 },
        install: { command: "javascript:alert(1)", args: [] },
      },
    ]);
    try {
      await new McpCatalogRenderer("mcp-root").render();
      const root = dom.window.document.getElementById("mcp-root")!;

      // Scheme neutralization (sanitizeField's extra job) is only required where
      // a value becomes a URL. This asserts the precondition that makes the
      // plain HTML escaper sufficient here; it fails if a future change renders
      // catalog data into an href/src, which would need a different control.
      assert.equal(root.querySelectorAll("[href], [src]").length, 0, "catalog surface gained a URL sink");
    } finally {
      restore();
    }
  });
});

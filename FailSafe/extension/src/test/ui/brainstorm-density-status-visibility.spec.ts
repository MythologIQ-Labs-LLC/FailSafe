/**
 * FX244 webview-density audit (Myth-Tech-Forge Relay Cycle 071, FailSafe#391/
 * #392 review follow-up) — rendered layout gate for the density-status label.
 *
 * jsdom coverage (brainstorm-density-status.test.ts,
 * brainstorm-renderer-density-wiring.test.ts) proves the label's text and
 * update wiring are correct, but neither can answer a real layout question:
 * does the always-visible `.cc-bs-density-status` badge visually collide
 * with the other absolutely-positioned HUD surfaces sharing the same
 * `.cc-subview-content` stacking context? `.cc-bs-toolbar` (top, centered,
 * up to ~95% width at narrow viewports) and `.cc-bs-chat` (bottom, centered,
 * width:90%/max-width:800px) both claim wide horizontal bands, so this
 * asserts real Chromium geometry at a narrow and a wide viewport rather than
 * reasoning about clamp()/vw arithmetic by hand.
 *
 * `.cc-bs-chat` currently has no producing markup anywhere in
 * src/roadmap/ui/ (grep confirms only the descendant `.cc-bs-chat-status`/
 * `-input` are ever emitted, inside renderRightPanel(), not this floating
 * overlay) — so the collision the density-status placement defends against
 * cannot happen on unmodified `main` today. To make this assertion actually
 * revert-sensitive rather than vacuously true, a synthetic `.cc-bs-chat` div
 * carrying the real (dormant) CSS rule is injected into the live DOM before
 * measuring, unconditionally on every run — this exercises the real cascade
 * (real fonts, real clamp() arithmetic) against the exact collision shape
 * the rule describes, whether or not that markup exists in production yet.
 *
 * Boot/nav helpers duplicated from brainstorm-viewport.spec.ts per that
 * file's own note (brainstorm-reseed.spec.ts must not grow — #234 LD6); this
 * file follows the same self-contained convention instead of adding a third
 * dependency on either.
 */

import { test, expect } from "@playwright/test";
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController;

test.afterEach(async () => {
  await controller?.close();
});

type Pg = import("@playwright/test").Page;
type Seed = { nodes: unknown[]; edges: unknown[] };

const SEED: Seed = {
  nodes: [
    { id: "cb-a", label: "Density A", type: "Architecture", confidence: 100, source: "codebase" },
    { id: "cb-b", label: "Density B", type: "Risk", confidence: 100, source: "codebase" },
  ],
  edges: [{ source: "cb-a", target: "cb-b", label: "links" }],
};

async function gotoMindmap(page: Pg, url: string): Promise<void> {
  await page.goto(`${url}/command-center.html`);
  await page.locator('.tab-btn[data-target="workspace"]').click();
  await expect(page.locator("#workspace")).toBeVisible({ timeout: 10000 });
  await page.locator('#workspace .cc-pill[data-key="brainstorm"]').click();
  await expect(page.locator("#workspace .cc-bs-export")).toBeVisible({ timeout: 10000 });
  await expect.poll(() => page.evaluate(() => {
    return !!(globalThis as any).__bs?.()?.graph?.canvas;
  }), { timeout: 15000 }).toBe(true);
}

async function boot(page: Pg, seed: Seed): Promise<void> {
  controller = await serveConsoleServerUI({});
  await page.route("**/api/v1/brainstorm/graph", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nodes: [], edges: [] }) }));
  await page.route("**/api/v1/brainstorm/seed", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(seed) }));
  await page.addInitScript(() => {
    (globalThis as any).__bs = () => (globalThis as any).__failsafeRenderers?.workspace?.subViews
      ?.find((s: any) => s.key === "brainstorm")?.renderer;
  });
  await gotoMindmap(page, controller.url);
  await expect.poll(() => page.evaluate(() => {
    const c = (globalThis as any).__bs?.()?.graph?.canvas;
    return !!(c && c.graph && c.nodes.length);
  }), { timeout: 10000 }).toBe(true);
}

function rectsOverlap(a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number } | null): boolean {
  if (!b) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

for (const [label, size] of Object.entries({
  "narrow (400px)": { width: 400, height: 800 },
  "wide (1440px)": { width: 1440, height: 900 },
})) {
  test(`FX244 — density-status is visible and unoccluded at ${label}`, async ({ page }) => {
    await page.setViewportSize(size);
    await boot(page, SEED);

    // Inject the real (currently dormant) chat-HUD shape so the collision
    // this placement defends against is actually exercised, not merely
    // possible. Real class, real CSS cascade -- only the markup is synthetic.
    await page.evaluate(() => {
      // Same parent renderShell() already places .cc-bs-toolbar in -- the
      // exact stacking context .cc-bs-chat's CSS rule is written for.
      const host = document.querySelector("#workspace .cc-bs-toolbar")!.parentElement!;
      const chat = document.createElement("div");
      chat.className = "cc-bs-chat";
      chat.innerHTML = '<div class="cc-bs-chat-input-row"><input class="cc-bs-chat-input" /></div>';
      host.appendChild(chat);
    });

    const density = page.locator("#workspace .cc-bs-density-status");
    await expect(density).toBeVisible();
    await expect(density).not.toBeEmpty(); // real getStats() text landed, not the blank pre-measurement placeholder
    await expect(density).toHaveText(/\d+ nodes? · \d+ edges?/);

    const densityBox = await density.boundingBox();
    expect(densityBox, "density-status must have a real layout box").not.toBeNull();

    const toolbarBox = await page.locator("#workspace .cc-bs-toolbar").boundingBox();
    const chatBox = await page.locator("#workspace .cc-bs-chat").boundingBox();
    // eslint-disable-next-line no-console -- deliberate: makes the exact
    // measured geometry visible in CI logs rather than only a pass/fail.
    console.log(`[FX244 ${label}] density=${JSON.stringify(densityBox)} toolbar=${JSON.stringify(toolbarBox)} chat=${JSON.stringify(chatBox)}`);

    expect(rectsOverlap(densityBox!, toolbarBox), "density-status must not overlap .cc-bs-toolbar").toBe(false);
    expect(rectsOverlap(densityBox!, chatBox), "density-status must not overlap .cc-bs-chat").toBe(false);
  });
}

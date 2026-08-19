// FX904 (FailSafe#242 Tranche A): the primary Command Center tab-nav
// (Overview/Learn/Agents/Governance/Workspace/Integrations/Config) visually
// communicates the active section via a CSS `.active` class only (color +
// left border) with no ARIA tab semantics — role, aria-selected, and
// aria-controls were entirely absent, so assistive-technology users could
// not determine which section is current. Verified at runtime via
// `Playwright` against the real `ConsoleServer` (see FailSafe#242 evidence);
// role=tab resolved 0 elements anywhere on the page before this fix.
//
// This spec locks in: static ARIA wiring in the markup, and that the tab
// click handler keeps `aria-selected` in sync with the visual `.active`
// state on every navigation (not just the initial render).

import { test, expect } from "@playwright/test";
import {
  serveConsoleServerUI,
  ConsoleServerController,
} from "./helpers/serveConsoleServerUI";

let controller: ConsoleServerController;

test.afterEach(async () => {
  await controller?.close();
});

test("primary tab-nav exposes role=tablist/tab and keeps aria-selected in sync", async ({ page }) => {
  controller = await serveConsoleServerUI({
    initialHub: { version: "test", bootstrapState: {}, agentHealth: null } as any,
  });
  await page.goto(`${controller.url}/command-center.html`);
  await page.waitForSelector(".tab-btn.active");

  const nav = page.locator(".tab-nav");
  await expect(nav).toHaveAttribute("role", "tablist");

  const overviewTab = page.locator('.tab-btn[data-target="overview"]');
  const agentsTab = page.locator('.tab-btn[data-target="agents"]');

  // Initial state: Overview is the active tab per command-center.html.
  await expect(overviewTab).toHaveAttribute("role", "tab");
  await expect(overviewTab).toHaveAttribute("aria-selected", "true");
  await expect(agentsTab).toHaveAttribute("role", "tab");
  await expect(agentsTab).toHaveAttribute("aria-selected", "false");

  // Each tab announces the panel it controls, and the panel is a real
  // tabpanel labelled by that tab (WCAG 4.1.2 Name, Role, Value).
  const overviewControls = await overviewTab.getAttribute("aria-controls");
  expect(overviewControls).toBeTruthy();
  const overviewPanel = page.locator(`#${overviewControls}`);
  await expect(overviewPanel).toHaveAttribute("role", "tabpanel");
  const overviewTabId = await overviewTab.getAttribute("id");
  expect(overviewTabId).toBeTruthy();
  await expect(overviewPanel).toHaveAttribute("aria-labelledby", overviewTabId!);

  // Switching tabs (mouse or keyboard activation both route through the
  // same click handler) must flip aria-selected, not just the CSS class.
  await agentsTab.click();
  await expect(agentsTab).toHaveAttribute("aria-selected", "true");
  await expect(overviewTab).toHaveAttribute("aria-selected", "false");

  // Playwright's role engine must now actually resolve these as tabs.
  await expect(page.getByRole("tab")).toHaveCount(7);
});

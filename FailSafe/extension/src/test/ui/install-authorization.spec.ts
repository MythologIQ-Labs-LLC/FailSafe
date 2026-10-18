/**
 * #538 lane B (Playwright, plan-538b LD11): the MCP Catalog install goes through the real
 * ConsoleServer route, which writes `.mcp.json` only after the (fixture) VS Code confirmer
 * approves. Cross-site shapes are refused before the confirmer is asked.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { test, expect } from "@playwright/test";
import { serveConsoleServerUI, ConsoleServerController } from "./helpers/serveConsoleServerUI";
import type { OperatorActionRequest, OperatorConfirmation } from "../../extension/operatorConfirmation";

let controller: ConsoleServerController | undefined;
let workspace: string | undefined;

test.afterEach(async () => {
  await controller?.close();
  controller = undefined;
  if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
  workspace = undefined;
});

const PENDING = "Confirm in the VS Code dialog…";

test("#538 MCP Catalog install: declined writes nothing, approved writes .mcp.json once", async ({ page }) => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-538b-pw-"));
  const shown: OperatorActionRequest[] = [];
  let answer: OperatorConfirmation = "declined";
  let release: () => void = () => undefined;
  let gate = Promise.resolve();
  controller = await serveConsoleServerUI({
    workspaceRoot: workspace,
    operatorConfirmer: async (r) => { shown.push(r); await gate; return answer; },
  });
  const mcpFile = path.join(workspace, ".mcp.json");

  await page.goto(`${controller.url}/command-center.html`);
  await page.locator('.tab-btn[data-target="integrations"]').click();
  await page.locator('#integrations .cc-pill[data-key="mcp"]').click();
  const install = page.locator('.cc-mcp-install[data-id="context7"]');
  await expect(install).toBeVisible({ timeout: 10000 });
  const status = install.locator("xpath=ancestor::*[contains(@class,'cc-mcp-card')]").locator(".cc-mcp-status");

  gate = new Promise<void>((r) => { release = r; });
  await install.click();
  await install.click();
  await expect(status).toHaveText(PENDING);
  await expect.poll(() => shown.length).toBe(1);
  expect(shown[0].detail).toContain("@upstash/context7-mcp");
  release();
  await expect(status).toHaveText("Not confirmed in VS Code; nothing was installed.");
  expect(fs.existsSync(mcpFile)).toBe(false);

  answer = "approved";
  gate = Promise.resolve();
  await install.click();
  await install.click();
  await expect(status).toContainText("in .mcp.json");
  expect(shown.length).toBe(2);
  const written = JSON.parse(fs.readFileSync(mcpFile, "utf8"));
  expect(written.mcpServers.context7.args).toContain("@upstash/context7-mcp");
});

test("#538 cross-site shapes are refused before the confirmer is asked", async ({ request }) => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-538b-pw-"));
  let asked = 0;
  controller = await serveConsoleServerUI({
    workspaceRoot: workspace,
    operatorConfirmer: async () => { asked += 1; return "approved"; },
  });
  const url = `${controller.url}/api/actions/mcp-install`;
  const plain = await request.post(url, { headers: { "content-type": "text/plain" }, data: JSON.stringify({ id: "context7" }) });
  expect(plain.status()).toBe(415);
  const foreign = await request.post(url, { headers: { origin: "http://evil.example" }, data: { id: "context7" } });
  expect(foreign.status()).toBe(403);
  // The adapter routes are not posted here: this harness's ConsoleServer holds a real
  // AdapterService, and on the unfixed source that request would run pip. The route
  // suite covers them with a service double.
  expect(asked).toBe(0);
  expect(fs.existsSync(path.join(workspace, ".mcp.json"))).toBe(false);
});

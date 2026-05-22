// FX589 — B-INT-1 release-class gate: Bicameral Advanced-tools section.
// Integrations panel → connect → expand the collapsed "Advanced tools"
// <details> → invoke `dashboard` → the result area populates.
//
// ===========================================================================
// STUB-ONLY — see docs/TEST_COVERAGE_TRADEOFFS.md (B-B199-6).
// This spec exercises the Advanced-tools UI wiring against a pre-wired stub
// BicameralMcpClient. It does NOT spawn a real bicameral-mcp server and would
// NOT pass against a real install. The stub-vs-real boundary is a deliberate,
// documented coverage trade-off; no live `pip` runs here.
// ===========================================================================

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';

// Every advanced tool, so the /status capability array enables the Run buttons.
const ALL_CAPABILITIES = [
  'history', 'drift', 'ratify', 'preflight',
  'ingest', 'search', 'brief', 'judgeGaps', 'resolveCompliance', 'linkCommit',
  'update', 'reset', 'dashboard', 'validateSymbols', 'getNeighbors',
];

function makeStubClient(): any {
  let connected = false;
  return {
    isConnected: () => connected,
    connect: async () => { connected = true; },
    disconnect: async () => { connected = false; },
    getCapabilities: () => new Set(ALL_CAPABILITIES),
    history: async () => [],
    drift: async () => [],
    ratify: async () => undefined,
    preflight: async () => ({ priorDecisions: [], drifted: [], openQuestions: [] }),
    // Advanced tools — dashboard returns a canned snapshot the spec asserts on.
    dashboard: async () => ({ features: 3, decisions: 12, driftCount: 1, unratified: 2 }),
    search: async () => ({ results: [] }),
    brief: async () => ({ brief: '' }),
    judgeGaps: async () => ({ gaps: [] }),
    ingest: async () => ({ ingested: 0 }),
    update: async () => ({ updated: true }),
    reset: async () => ({ reset: true }),
    resolveCompliance: async () => ({ resolved: true }),
    linkCommit: async () => ({ linked: true }),
    validateSymbols: async () => ({ invalid: [] }),
    getNeighbors: async () => ({ neighbors: [] }),
  };
}

test.describe('FX589 — Bicameral Advanced-tools section (B-INT-1)', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('expand Advanced tools → invoke dashboard → result area populates', async ({ page }) => {
    controller = await serveConsoleServerUI({
      bicameralClient: makeStubClient(),
      bicameralConfigured: true,
    });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="integrations"]').click();

    // Connect to reach the running state, where the Advanced-tools section mounts.
    const connectBtn = page.locator('[data-action="bicameral-connect"]');
    await expect(connectBtn).toBeVisible({ timeout: 5000 });
    await connectBtn.click();

    // The collapsed <details> section appears in the running-state card.
    const details = page.locator('details.cc-bicameral-advanced');
    await expect(details).toBeVisible({ timeout: 5000 });
    // Collapsed by default — the tool list is not yet visible.
    await expect(details).not.toHaveAttribute('open', /.*/);

    // Expand it and invoke the dashboard tool.
    await details.locator('summary').click();
    const runBtn = page.locator(
      '.cc-bicameral-tool-row[data-tool="dashboard"] [data-action="bicameral-tool-invoke"]',
    );
    await expect(runBtn).toBeEnabled({ timeout: 5000 });
    await runBtn.click();

    // The result <pre> populates with the dashboard snapshot.
    const result = page.locator('.cc-bicameral-tool-result');
    await expect(result).toContainText('"features": 3', { timeout: 5000 });
    await expect(result).toContainText('"decisions": 12');
  });
});

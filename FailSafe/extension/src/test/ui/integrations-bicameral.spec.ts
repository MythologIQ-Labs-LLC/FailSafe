// Phase 5 of plan-qor-bicameral-mcp-integration.md. Closes the B199
// release-class coverage gate for the Bicameral MCP integration surface
// (FX487/488/489/490). Avoids any real `pip install` or `bicameral-mcp` spawn
// by:
//   - pre-wiring a stub BicameralMcpClient via the serveConsoleServerUI fixture,
//   - pointing the install-state probe command at `node` (always present),
//   - writing a `.bicameral/config.yaml` fixture so the probe reports
//     `configured-not-running` without contacting PyPI or running setup.
// The install picker (not-installed state) is covered as a separate test that
// does NOT trigger the install action; the real install path is covered by
// the existing install-handler unit tests under src/test/integrations/bicameral.

import { test, expect } from '@playwright/test';

import { serveConsoleServerUI, ConsoleServerController } from './helpers/serveConsoleServerUI';
import type {
  BicameralFeatureBrief,
  BicameralDriftStatus,
  BicameralRatifyVerdict,
} from '../../integrations/bicameral';

interface StubInvocations {
  connect: number;
  disconnect: number;
  history: number;
  drift: string[];
  ratify: Array<{ id: string; verdict: BicameralRatifyVerdict }>;
}

function makeStubClient(features: BicameralFeatureBrief[]): {
  client: any;
  invocations: StubInvocations;
} {
  const invocations: StubInvocations = {
    connect: 0, disconnect: 0, history: 0, drift: [], ratify: [],
  };
  let connected = false;
  const drifts: BicameralDriftStatus[] = [];
  const client = {
    isConnected: () => connected,
    connect: async () => { invocations.connect += 1; connected = true; },
    disconnect: async () => { invocations.disconnect += 1; connected = false; },
    history: async () => { invocations.history += 1; return features; },
    drift: async (filePath: string) => { invocations.drift.push(filePath); return drifts; },
    ratify: async (decisionId: string, verdict: BicameralRatifyVerdict) => {
      invocations.ratify.push({ id: decisionId, verdict });
    },
    preflight: async () => ({ priorDecisions: [], drifted: [], openQuestions: [] }),
  };
  return { client, invocations };
}

const SAMPLE_FEATURES: BicameralFeatureBrief[] = [
  {
    feature: 'auth-rewrite',
    decisions: [
      {
        id: 'd-001',
        title: 'Drop legacy session-cookie path',
        source: 'rfc-003',
        status: 'unratified',
        bindings: [
          { filePath: 'src/auth/session.ts', symbol: 'createSession', startLine: 14, endLine: 47 },
        ],
      },
      {
        id: 'd-002',
        title: 'Use httpOnly + SameSite=strict everywhere',
        source: 'rfc-003',
        status: 'in-sync',
        bindings: [{ filePath: 'src/auth/cookie.ts' }],
      },
    ],
  },
];

test.describe('FX487/488/489/490 — Bicameral Integrations tab (Phase 5)', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) {
      await controller.close();
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('configured-not-running state — Connect button visible, no install picker', async ({ page }) => {
    const { client } = makeStubClient(SAMPLE_FEATURES);
    controller = await serveConsoleServerUI({ bicameralClient: client, bicameralConfigured: true });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="integrations"]').click();

    // The integrations.js renderer runs the status probe on first render;
    // wait for the configured-not-running state to surface the Connect button.
    const connectBtn = page.locator('[data-action="bicameral-connect"]');
    await expect(connectBtn).toBeVisible({ timeout: 5000 });
    // Install picker (which only renders in `not-installed`) must NOT appear.
    await expect(page.locator('[data-action="bicameral-install"]')).toHaveCount(0);
  });

  test('connect → running → feature feed renders the canned decisions', async ({ page }) => {
    const { client, invocations } = makeStubClient(SAMPLE_FEATURES);
    controller = await serveConsoleServerUI({ bicameralClient: client, bicameralConfigured: true });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="integrations"]').click();

    const connectBtn = page.locator('[data-action="bicameral-connect"]');
    await expect(connectBtn).toBeVisible({ timeout: 5000 });
    await connectBtn.click();

    // running state: the feature section header carries data-feature.
    const featureSection = page.locator('[data-feature="auth-rewrite"]');
    await expect(featureSection).toBeVisible({ timeout: 5000 });
    // Both canned decisions render. Disambiguate against the inner Ratify
    // button which also carries data-decision-id — match on the row class.
    await expect(page.locator('.cc-bicameral-decision[data-decision-id="d-001"]')).toBeVisible();
    await expect(page.locator('.cc-bicameral-decision[data-decision-id="d-002"]')).toBeVisible();
    // The history fetch fired at least once after connect (initial + refresh paths
    // both call it; assert at least one for tolerance to async sequencing).
    await expect.poll(() => invocations.history).toBeGreaterThanOrEqual(1);
    expect(invocations.connect).toBe(1);
  });

  test('ratify decision → POST hits the route with the right decisionId + verdict', async ({ page }) => {
    const { client, invocations } = makeStubClient(SAMPLE_FEATURES);
    controller = await serveConsoleServerUI({ bicameralClient: client, bicameralConfigured: true });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="integrations"]').click();
    await page.locator('[data-action="bicameral-connect"]').click();

    // Wait for the feed to render, then click the Ratify button on d-001.
    const ratifyBtn = page.locator('[data-decision-id="d-001"] [data-action="bicameral-ratify"]');
    await expect(ratifyBtn).toBeVisible({ timeout: 5000 });
    await ratifyBtn.click();

    await expect.poll(() => invocations.ratify.length).toBeGreaterThanOrEqual(1);
    expect(invocations.ratify[0]).toEqual({ id: 'd-001', verdict: 'ratify' });
  });

  test('not-installed state — install picker renders Solo + Team buttons', async ({ page }) => {
    // No bicameralConfigured fixture → no .bicameral/config.yaml.
    // bicameralCommand defaults to "node" so `--version` succeeds, but config
    // absence drives state to `installed-not-configured`. To force `not-installed`,
    // point command at a non-existent binary instead.
    controller = await serveConsoleServerUI({ bicameralCommand: '__failsafe_test_no_such_command__' });
    await page.goto(`${controller.url}/command-center.html`);
    await page.locator('.tab-btn[data-target="integrations"]').click();

    // Both install buttons render in not-installed state per bicameral-card.js.
    const installSolo = page.locator('[data-action="bicameral-install"][data-mode="solo"]');
    const installTeam = page.locator('[data-action="bicameral-install"][data-mode="team"]');
    await expect(installSolo).toBeVisible({ timeout: 5000 });
    await expect(installTeam).toBeVisible();
    // The "Connect" button must NOT be in this state — that's configured-not-running.
    await expect(page.locator('[data-action="bicameral-connect"]')).toHaveCount(0);
  });
});

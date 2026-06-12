// FX847 / FX857-FX859 — Playwright coverage for the Development Tracker dashboard
// render (#174). The jsdom/unit layer (tracker-route.test.ts, manifest-*.test.ts)
// covers the api()/model logic; THIS is the real-browser gate the operator's rules
// require for a user-facing visual surface (feedback_e2e_before_claim_closed +
// design_reference_required). It drives the REAL ConsoleServer via
// serveConsoleServerUI and mocks ONLY /api/v1/tracker delivery — the render under
// test is the shipped tracker-dashboard.html, exercised against payloads built by
// the REAL production model builder (shape-accurate, not hand-faked).
//
// The regression this guards: on PR-incremental (non-semver) repos the dashboard
// previously rendered only the shell with no data ("blank shell"). These tests
// prove it now populates — programs, verticals, and a populated timeline — and
// that semver repos are unaffected and an empty repo degrades gracefully.

import { test, expect } from '@playwright/test';
import { serveConsoleServerUI, type ConsoleServerController } from './helpers/serveConsoleServerUI';
import { buildTrackerModel } from '../../roadmap/tracker/tracker-model';
import type { TrackerManifest, TrackerRc } from '../../roadmap/tracker/tracker-model';
import { discoverMergedPrs } from '../../roadmap/tracker/tracker-pr-discovery';

// Categorized programs + verticals (operator-confirmed taxonomy, FX859).
const PROGRAMS = [
  { key: 'ci', name: 'CI/CD & Security', accent: '#38d6c8' },
  { key: 'connectors', name: 'Source Connectors', accent: '#e7b04b' },
  { key: 'runtime', name: 'Runtime', accent: '#f0728f' },
];
const VERTICALS = [
  { key: 'adapter', name: 'Universal adapter core', accent: '#38d6c8', summary: 'provider-neutral normalization seam' },
  { key: 'connectors-v', name: 'Source connector parse surfaces', accent: '#e7b04b', summary: 'read-only evidence adapters' },
  { key: 'ci-v', name: 'CI governance gate ecosystem', accent: '#7aa2f7', summary: 'gates + SBOM + scorecard' },
];
const PHASES = [
  { prog: 'ci', key: 'PR6', rc: 'pr-6', w: 20, title: 'governance-integrity gate ecosystem' },
  { prog: 'connectors', key: 'PR11', rc: 'pr-11', w: 20, title: 'source connectors + webhook verify' },
  { prog: 'runtime', key: 'PR29', rc: 'pr-29', w: 50, title: 'operator-runtime boundary layer' },
];

function manifest(extra: Partial<TrackerManifest> = {}): TrackerManifest {
  return {
    repo: 'BicameralAI/bicameral-integrations',
    meta: {
      eyebrow: 'Bicameral · development tracker', title: 'Generated tracker', titleEm: 'for Bicameral',
      sub: 'render fixture', metaRow: [{ label: 'Programs', value: '3' }], footer: 'fixture',
    },
    programs: PROGRAMS, phases: PHASES, verticals: VERTICALS, ...extra,
  };
}

// --- PR-incremental: built from a synthetic merged-PR git log via the REAL discovery.
const PR_GITLOG = [
  ['2026-01-02', 'feat(ci): governance-integrity gate ecosystem (#6)'],
  ['2026-01-04', 'feat(connectors): source connectors + webhook verify/dedup (#11)'],
  ['2026-01-06', 'feat: add SARIF, Slack, Notion, and MCP Registry connectors (#15)'],
  ['2026-01-09', 'feat: add OSV, Sentry, and PagerDuty connectors (Phase 2) (#23)'],
  ['2026-01-12', 'feat(runtime): operator-runtime boundary layer (#29)'],
  ['2026-01-15', 'feat(connectors): promote connectors to Beta via runtime harness (#30)'],
  ['2026-01-18', 'feat(runtime): make GatewaySink real — Live emission seam (#39)'],
].map(([d, s]) => `${d}\t${s}`).join('\n');

const PR_ANCHORS: TrackerRc[] = discoverMergedPrs(PR_GITLOG);
const PR_PAYLOAD = {
  ...buildTrackerModel(manifest(), {
    discoveredReleases: PR_ANCHORS, shippedReleaseIds: [], now: new Date('2026-02-01T00:00:00Z'),
    minorDays: 60, patchDays: 30,
  }),
  cadence: 'pr-incremental', manifestPresent: true, lint: [], ok: true,
};

// --- Semver: discovered release axis (regression guard — must be unaffected).
const SEMVER_AXIS: TrackerRc[] = [
  { id: 'v1.0.0', state: 'prod' }, { id: 'v1.1.0', state: 'prod' }, { id: 'v2.0.0', state: 'prod' },
];
const SEMVER_PAYLOAD = {
  ...buildTrackerModel(manifest(), {
    discoveredReleases: SEMVER_AXIS, shippedReleaseIds: ['v1.0.0', 'v1.1.0', 'v2.0.0'],
    now: new Date('2026-02-01T00:00:00Z'), minorDays: 60, patchDays: 30,
  }),
  cadence: 'semver', manifestPresent: true, lint: [], ok: true,
};

// --- Empty: no releases, no taxonomy (honest-empty, must not crash to a blank shell).
const EMPTY_PAYLOAD = {
  ...buildTrackerModel({ repo: 'x/y', meta: { title: 'Empty' }, programs: [], phases: [], verticals: [] }, {
    discoveredReleases: [], shippedReleaseIds: [], now: new Date('2026-02-01T00:00:00Z'),
  }),
  cadence: 'empty', manifestPresent: false,
  lint: [{ severity: 'warn', code: 'manifest-absent', detail: 'no manifest' }], ok: true,
};

test.describe('Development Tracker dashboard render (#174)', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) { await controller.close(); await new Promise((r) => setTimeout(r, 50)); }
  });

  const VERTICAL_TABS = '[role="tablist"][aria-label="Verticals"] [role="tab"]';

  test('PR-incremental repo populates (no blank shell): timeline + program bars + verticals', async ({ page }) => {
    controller = await serveConsoleServerUI();
    await page.route('**/api/v1/tracker', (r) => r.fulfill({ json: PR_PAYLOAD }));
    await page.goto(`${controller.url}/console/tracker`);

    // Timeline is populated — the exact regression (blank shell) this guards.
    await expect(page.locator('#timeline .tl-node').first()).toBeVisible({ timeout: 5000 });
    expect(await page.locator('#timeline .tl-node').count()).toBeGreaterThan(0);
    // Cadence-aware copy: PR-incremental repos show the merged-PR axis.
    await expect(page.getByText('Merged-PR timeline').first()).toBeVisible();
    // Program bars: one per program (deterministic).
    await expect(page.locator('.bar-row')).toHaveCount(3);
    // Vertical deep-dive: one tab per vertical (deterministic).
    await expect(page.locator(VERTICAL_TABS)).toHaveCount(3);
    // The operator-categorized program name actually renders (data binding, not presence-only).
    await expect(page.getByText('Source Connectors').first()).toBeVisible();
    await expect(page.getByText('Universal adapter core').first()).toBeVisible();
  });

  test('semver repo is unaffected — timeline + taxonomy still render', async ({ page }) => {
    controller = await serveConsoleServerUI();
    await page.route('**/api/v1/tracker', (r) => r.fulfill({ json: SEMVER_PAYLOAD }));
    await page.goto(`${controller.url}/console/tracker`);

    await expect(page.locator('#timeline .tl-node').first()).toBeVisible({ timeout: 5000 });
    expect(await page.locator('#timeline .tl-node').count()).toBeGreaterThan(0);
    // Semver repos keep the release-axis copy (not the PR-incremental variant).
    await expect(page.getByText('Release timeline').first()).toBeVisible();
    await expect(page.locator('.bar-row')).toHaveCount(3);
    await expect(page.locator(VERTICAL_TABS)).toHaveCount(3);
  });

  test('empty repo degrades gracefully — honest empty cards, no nodes, no crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    controller = await serveConsoleServerUI();
    await page.route('**/api/v1/tracker', (r) => r.fulfill({ json: EMPTY_PAYLOAD }));
    await page.goto(`${controller.url}/console/tracker`);

    // No #timeline rail is built when empty — instead an honest empty card renders.
    // (The program/vertical sections aren't appended at all when their arrays are
    // empty, so the timeline empty card is the graceful-degradation signal.)
    await expect(page.getByText('No releases defined yet.').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#timeline .tl-node')).toHaveCount(0);
    await expect(page.locator('.bar-row')).toHaveCount(0);
    expect(errors, `no uncaught page errors: ${errors.join('; ')}`).toHaveLength(0);
  });
});

// #163 — loading/progress + freshness indicators. The first slice is a pure
// client-side change in tracker-dashboard.html: a loading state (no more blank
// while /api/v1/tracker is in flight), a "last refreshed" timestamp, and a
// manual Refresh affordance. Real chromium (jsdom-insufficient per the rules).
test.describe('Development Tracker loading + freshness (#163)', () => {
  let controller: ConsoleServerController;

  test.afterEach(async () => {
    if (controller) { await controller.close(); await new Promise((r) => setTimeout(r, 50)); }
  });

  test('shows a loading state while the fetch is in flight, then renders (no blank)', async ({ page }) => {
    controller = await serveConsoleServerUI();
    // Hold the response so the loading state is observable.
    await page.route('**/api/v1/tracker', async (r) => {
      await new Promise((res) => setTimeout(res, 1200));
      await r.fulfill({ json: PR_PAYLOAD });
    });
    await page.goto(`${controller.url}/console/tracker`); // page loaded; fetch still pending
    // Loading affordance is visible during the delay (not a blank #main).
    await expect(page.getByText('Building the tracker').first()).toBeVisible({ timeout: 1000 });
    // Once the fetch resolves, the timeline replaces the loading state.
    await expect(page.locator('#timeline .tl-node').first()).toBeVisible({ timeout: 6000 });
    await expect(page.getByText('Building the tracker')).toHaveCount(0);
  });

  test('surfaces a "last refreshed" timestamp after load', async ({ page }) => {
    controller = await serveConsoleServerUI();
    await page.route('**/api/v1/tracker', (r) => r.fulfill({ json: PR_PAYLOAD }));
    await page.goto(`${controller.url}/console/tracker`);
    await expect(page.locator('#timeline .tl-node').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#tracker-freshness')).toContainText('Updated');
  });

  test('manual Refresh re-fetches and re-renders', async ({ page }) => {
    controller = await serveConsoleServerUI();
    let calls = 0;
    await page.route('**/api/v1/tracker', (r) => { calls += 1; return r.fulfill({ json: PR_PAYLOAD }); });
    await page.goto(`${controller.url}/console/tracker`);
    await expect(page.locator('#timeline .tl-node').first()).toBeVisible({ timeout: 5000 });
    expect(calls).toBe(1);
    await page.locator('#tracker-refresh').click();
    await expect.poll(() => calls, { timeout: 5000 }).toBe(2);
    await expect(page.locator('#timeline .tl-node').first()).toBeVisible();
  });
});

// #202 (FX872/873/874) — surface the governance projection in the RENDER: the
// per-vertical featureStats coverage bar, unanchored-phase counting in the program
// bars, and the manifestSource-aware advisory. Real chromium (visual surface — the
// jsdom layer cannot exercise the inline render script).
test.describe('Development Tracker projection render (#202)', () => {
  let controller: ConsoleServerController;
  test.afterEach(async () => {
    if (controller) { await controller.close(); await new Promise((r) => setTimeout(r, 50)); }
  });

  // FX872 — coverage bar from featureStats; pct = verified/(total - na); degrade-safe.
  test('FX872: vertical panel renders a coverage bar from featureStats; absent → no block', async ({ page }) => {
    const withStats = {
      ...buildTrackerModel(manifest({
        verticals: [{ key: 'cov', name: 'Covered surface', accent: '#38d6c8', summary: 's',
          featureStats: { total: 10, verified: 6, na: 2 } }],
      }), { discoveredReleases: SEMVER_AXIS, shippedReleaseIds: ['v2.0.0'], now: new Date('2026-02-01T00:00:00Z') }),
      verticals: [{ key: 'cov', name: 'Covered surface', accent: '#38d6c8', summary: 's',
        featureStats: { total: 10, verified: 6, na: 2 } }],
      cadence: 'semver', manifestPresent: true, lint: [], ok: true,
    };
    const noStats = { ...withStats, verticals: [{ key: 'bare', name: 'Bare surface', accent: '#e7b04b', summary: 's' }] };
    controller = await serveConsoleServerUI();
    let payload: unknown = withStats;
    await page.route('**/api/v1/tracker', (r) => r.fulfill({ json: payload }));
    await page.goto(`${controller.url}/console/tracker`);
    // 6/(10-2) = 75% — the computed coverage, caption, and fill width.
    await expect(page.locator('.cov-pct')).toHaveText('75%', { timeout: 5000 });
    await expect(page.locator('.cov-caption')).toHaveText('6 verified / 10 features · 2 n/a');
    await expect(page.locator('.cov-row .fill')).toHaveAttribute('style', /width:\s*75%/);
    // Degrade-safe: a vertical with no featureStats renders NO coverage block.
    payload = noStats;
    await page.goto(`${controller.url}/console/tracker`);
    await expect(page.locator('[role="tablist"][aria-label="Verticals"] [role="tab"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.cov-pct')).toHaveCount(0);
  });

  // FX873 — program bar counts unanchored phases (the under-reporting bug fix).
  test('FX873: cumulative() counts unanchored phases (60%, not 40%)', async ({ page }) => {
    const payload = {
      ...buildTrackerModel({
        repo: 'x/y', meta: { title: 'Unanchored' },
        programs: [{ key: 'p1', name: 'Prog One', accent: '#38d6c8' }],
        phases: [
          { prog: 'p1', key: 'A', rc: 'v1.0.0', w: 40, title: 'anchored' },
          { prog: 'p1', key: 'U', rc: '', w: 20, title: 'unanchored (projected)' },
        ],
        verticals: [],
      }, { discoveredReleases: [{ id: 'v1.0.0', state: 'prod' }], shippedReleaseIds: ['v1.0.0'], now: new Date('2026-02-01T00:00:00Z') }),
      cadence: 'semver', manifestPresent: true, lint: [], ok: true,
    };
    controller = await serveConsoleServerUI();
    await page.route('**/api/v1/tracker', (r) => r.fulfill({ json: payload }));
    await page.goto(`${controller.url}/console/tracker`);
    await expect(page.locator('.bar-row')).toHaveCount(1);
    // At the latest release: anchored(40) + unanchored(20) = 60% (the fix; was 40%).
    await expect(page.locator('.bar-row .pct')).toHaveText('60%', { timeout: 5000 });
  });

  // FX874 — advisory note branches on manifestSource.
  test('FX874: advisory branches on manifestSource (projection vs none)', async ({ page }) => {
    controller = await serveConsoleServerUI();
    let payload: unknown = { ...SEMVER_PAYLOAD, manifestPresent: false, manifestSource: 'projection' };
    await page.route('**/api/v1/tracker', (r) => r.fulfill({ json: payload }));
    await page.goto(`${controller.url}/console/tracker`);
    await expect(page.getByText('Projected from the governance ledger').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('discovered releases only')).toHaveCount(0);
    // manifestSource 'none' keeps the discovered-only copy.
    payload = { ...SEMVER_PAYLOAD, manifestPresent: false, manifestSource: 'none' };
    await page.goto(`${controller.url}/console/tracker`);
    await expect(page.getByText('discovered releases only').first()).toBeVisible({ timeout: 5000 });
  });
});

// FX888 — PDF export (research-brief Phase 3). Print-CSS-first slice: an Export
// control triggers native print ("Save as PDF"); the @media print stylesheet
// hides interactive chrome while keeping the generated timestamp + evidence
// source. Real Chromium (the design-reference visual gate) — print LAYOUT via
// emulateMedia, not a binary PDF snapshot (per the brief).
test.describe('Development Tracker PDF export (FX888 / Phase 3)', () => {
  let controller: ConsoleServerController;
  test.afterEach(async () => {
    if (controller) { await controller.close(); await new Promise((r) => setTimeout(r, 50)); }
  });

  test('FX888: Export PDF control is present and clicking it invokes window.print()', async ({ page }) => {
    controller = await serveConsoleServerUI();
    // Stub print BEFORE any document script runs so the click counts, not a dialog.
    await page.addInitScript(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => { (window as unknown as { __printed: number }).__printed += 1; };
    });
    await page.route('**/api/v1/tracker', (r) => r.fulfill({ json: PR_PAYLOAD }));
    await page.goto(`${controller.url}/console/tracker`);
    const exportBtn = page.locator('#tracker-export');
    await expect(exportBtn).toBeVisible({ timeout: 5000 });
    await exportBtn.click();
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  });

  test('FX888: print media hides live controls but keeps the timestamp + evidence source', async ({ page }) => {
    controller = await serveConsoleServerUI();
    await page.route('**/api/v1/tracker', (r) => r.fulfill({ json: PR_PAYLOAD }));
    await page.goto(`${controller.url}/console/tracker`);
    await expect(page.locator('#timeline .tl-node').first()).toBeVisible({ timeout: 5000 });
    // Provenance is present on screen (timestamp + evidence-source footer).
    await expect(page.locator('#tracker-freshness')).toContainText('Updated');
    await expect(page.locator('#foot')).not.toHaveText('');
    // Under print media, interactive chrome is hidden; provenance is kept.
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#tracker-refresh')).toBeHidden();
    await expect(page.locator('#tracker-export')).toBeHidden();
    await expect(page.locator('#tracker-freshness')).toBeVisible();
    await expect(page.locator('#foot')).toBeVisible();
  });
});

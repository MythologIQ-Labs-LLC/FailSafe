import fs from 'fs';
import http from 'http';
import path from 'path';
import { test, expect } from '@playwright/test';

type HubPayload = {
  runState?: { currentPhase?: string };
  activePlan: {
    id: string;
    currentPhaseId: string;
    phases: Array<{ id: string; title: string; status: string; progress: number; artifacts?: Array<{ touched?: boolean }> }>;
    blockers: Array<{ title: string; severity?: string; resolvedAt?: string | null; reason?: string }>;
    milestones: Array<{ title: string; completedAt?: string | null; targetDate?: string | null }>;
    risks: Array<{ level?: string }>;
  };
  sentinelStatus: { running: boolean; mode: string; filesWatched: number; queueDepth: number; lastVerdict?: { decision?: string } };
  l3Queue: unknown[];
  recentVerdicts: Array<{ decision?: string; riskGrade?: string; summary?: string }>;
  trustSummary: { totalAgents: number; avgTrust: number; quarantined: number; stageCounts: { CBT: number; KBT: number; IBT: number } };
  currentSprint: { name: string; status: string; startedAt: string } | null;
  checkpointSummary: { total: number; chainValid: boolean; latestType: string; latestAt: string; latestVerdict: string };
  recentCheckpoints: Array<{ checkpointType: string; policyVerdict: string; timestamp: string }>;
  generatedAt: string;
  sprints: unknown[];
};

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function baseHub(overrides?: Partial<HubPayload>): HubPayload {
  return {
    sprints: [],
    currentSprint: { name: 'S-001', status: 'active', startedAt: '2026-02-11T08:00:00.000Z' },
    activePlan: {
      id: 'plan-001',
      currentPhaseId: 'phase-plan',
      phases: [
        { id: 'phase-plan', title: 'Plan', status: 'active', progress: 35, artifacts: [{ touched: true }, { touched: false }] },
        { id: 'phase-audit', title: 'Audit', status: 'pending', progress: 0, artifacts: [] },
        { id: 'phase-implement', title: 'Implement', status: 'pending', progress: 0, artifacts: [] },
      ],
      blockers: [],
      milestones: [{ title: 'Intent ratified', completedAt: '2026-02-11T09:00:00.000Z' }, { title: 'Policy pack loaded' }],
      risks: [],
    },
    sentinelStatus: { running: true, mode: 'heuristic', filesWatched: 12, queueDepth: 0 },
    l3Queue: [],
    recentVerdicts: [],
    trustSummary: { totalAgents: 3, avgTrust: 0.92, quarantined: 0, stageCounts: { CBT: 1, KBT: 1, IBT: 1 } },
    checkpointSummary: {
      total: 4,
      chainValid: true,
      latestType: 'policy.checked',
      latestAt: '2026-02-11T10:00:00.000Z',
      latestVerdict: 'PASS',
    },
    recentCheckpoints: [
      { checkpointType: 'policy.checked', policyVerdict: 'PASS', timestamp: '2026-02-11T10:00:00.000Z' },
    ],
    generatedAt: '2026-02-11T10:01:00.000Z',
    runState: { currentPhase: 'Plan' },
    ...overrides,
  };
}

function defaultSkills() {
  return [
    {
      id: 'elevenlabs-audio-generate-music',
      displayName: 'Generate Music',
      desc: 'Generate music via ElevenLabs.',
      creator: 'ElevenLabs',
      sourceRepo: 'elevenlabs/skills',
      sourcePath: 'FailSafe/VSCode/skills/music/SKILL.md',
      versionPin: 'local-main',
      trustTier: 'verified',
      sourceType: 'project-canonical',
      sourcePriority: 1,
      admissionState: 'admitted',
      requiredPermissions: ['network'],
    },
    {
      id: 'qor-governance-enforce-compliance',
      displayName: 'Governance Compliance',
      desc: 'Enforce governance constraints.',
      creator: 'MythologIQ',
      sourceRepo: 'MythologIQ/FailSafe',
      sourcePath: 'FailSafe/VSCode/skills/qor-governance-compliance/SKILL.md',
      versionPin: 'local-main',
      trustTier: 'verified',
      sourceType: 'project-canonical',
      sourcePriority: 1,
      admissionState: 'admitted',
      requiredPermissions: [],
    },
  ];
}

async function withUiServer(
  handler: (baseUrl: string) => Promise<void>,
  options?: { hub?: HubPayload; skills?: unknown[]; relevance?: Record<string, unknown>; onAction?: (path: string) => void },
): Promise<void> {
  const root = path.resolve(__dirname, '../../roadmap/ui');
  const educationRoot = path.resolve(__dirname, '../../../out/education-browser');
  const hubPayload = options?.hub || baseHub();
  const skills = options?.skills || defaultSkills();
  const relevance = options?.relevance || {};
  const onAction = options?.onAction || (() => {});

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/hub' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(hubPayload));
      return;
    }
    if (url.pathname === '/api/skills' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ skills }));
      return;
    }
    if (url.pathname === '/api/skills/relevance' && req.method === 'GET') {
      const phase = String(url.searchParams.get('phase') || 'plan');
      const phasePayload = (relevance[phase] as Record<string, unknown> | undefined) || {};
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        phase,
        recommended: phasePayload.recommended || skills,
        allRelevant: phasePayload.allRelevant || skills,
        otherAvailable: phasePayload.otherAvailable || [],
      }));
      return;
    }
    if (url.pathname === '/api/roadmap' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        phases: hubPayload.activePlan.phases.map((phase) => ({
          id: phase.id,
          name: phase.title,
          status: phase.status,
        })),
      }));
      return;
    }
    if (url.pathname === '/api/actions/resume-monitoring' && req.method === 'POST') {
      onAction(url.pathname);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, status: { running: true } }));
      return;
    }
    if (url.pathname === '/api/actions/panic-stop' && req.method === 'POST') {
      onAction(url.pathname);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, status: { running: false } }));
      return;
    }
    if (url.pathname === '/api/actions/verify-integrity' && req.method === 'POST') {
      onAction(url.pathname);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, chainValid: true }));
      return;
    }
    if (url.pathname === '/api/skills/ingest/auto' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, admitted: 1, skipped: 0, failed: 0, skills }));
      return;
    }
    if (url.pathname === '/api/skills/ingest/manual' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, admitted: 1, failed: 0, skills }));
      return;
    }

    const requestPath = decodeURIComponent(url.pathname);
    if (requestPath.startsWith('/education/')) {
      const eduRelative = requestPath.replace(/^\/education\/+/, '');
      const eduPath = path.join(educationRoot, eduRelative);
      if (eduPath.startsWith(educationRoot) && fs.existsSync(eduPath) && !fs.statSync(eduPath).isDirectory()) {
        res.setHeader('Content-Type', contentType(eduPath));
        res.end(fs.readFileSync(eduPath));
        return;
      }
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    const relative = requestPath === '/'
      ? 'command-center.html'
      : (requestPath === '/legacy-index.html' ? 'command-center.html' : requestPath.replace(/^\/+/, ''));
    const filePath = path.join(root, relative);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', contentType(filePath));
    res.end(fs.readFileSync(filePath));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to bind test server');
  }

  try {
    await handler(`http://127.0.0.1:${address.port}`);
  } finally {
    if (typeof (server as { closeAllConnections?: () => void }).closeAllConnections === 'function') {
      (server as { closeAllConnections: () => void }).closeAllConnections();
    }
    if (typeof (server as { closeIdleConnections?: () => void }).closeIdleConnections === 'function') {
      (server as { closeIdleConnections: () => void }).closeIdleConnections();
    }
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('US: Console branding and consolidated tabs', async ({ page }) => {
  await withUiServer(async (baseUrl) => {
    await page.goto(`${baseUrl}/command-center.html`);
    await expect(page).toHaveTitle(/FAILSAFE Console/);
    await expect(page.locator('.app-name')).toHaveText('FAILSAFE');

    await expect(page.locator('.tab-btn[data-target="overview"]')).toBeVisible();
    await expect(page.locator('.tab-btn[data-target="agents"]')).toBeVisible();
    await expect(page.locator('.tab-btn[data-target="governance"]')).toBeVisible();
    await expect(page.locator('.tab-btn[data-target="workspace"]')).toBeVisible();
    await expect(page.locator('.tab-btn[data-target="settings"]')).toBeVisible();

    await page.locator('.tab-btn[data-target="workspace"]').click();
    await expect(page.locator('#workspace')).toHaveClass(/active/);
  });
});

test('US: sentinel halted state is reflected in the ticker strip', async ({ page }) => {
  await withUiServer(async (baseUrl) => {
    await page.goto(`${baseUrl}/command-center.html`);
    await expect(page.locator('#ticker-sentinel')).toContainText('Halted');
  }, {
    hub: baseHub({
      sentinelStatus: { running: false, mode: 'heuristic', filesWatched: 10, queueDepth: 0 },
    }),
  });
});

test('US: protocol ticker reflects active sentinel mode', async ({ page }) => {
  await withUiServer(async (baseUrl) => {
    await page.goto(`${baseUrl}/command-center.html`);
    await expect(page.locator('#ticker-protocol')).toContainText('hybrid');
  }, {
    hub: baseHub({
      sentinelStatus: {
        running: true,
        mode: 'hybrid',
        filesWatched: 10,
        queueDepth: 2,
      },
    }),
  });
});

test('US: agents tab activates and shows panel', async ({ page }) => {
  await withUiServer(async (baseUrl) => {
    await page.goto(`${baseUrl}/command-center.html`);
    await page.locator('.tab-btn[data-target="agents"]').click();
    await expect(page.locator('#agents')).toHaveClass(/active/);
  });
});

test.skip('US: agents actions post to API endpoints — requires WebSocket for TabGroup pill rendering', async ({ page }) => {
  const called: string[] = [];
  await withUiServer(async (baseUrl) => {
    await page.goto(`${baseUrl}/command-center.html`);
    await page.locator('.tab-btn[data-target="agents"]').click();

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/actions/resume-monitoring')),
      page.locator('[data-action="/api/actions/resume-monitoring"]').click(),
    ]);
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/actions/panic-stop')),
      page.locator('[data-action="/api/actions/panic-stop"]').click(),
    ]);
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/actions/verify-integrity')),
      page.locator('[data-action="/api/actions/verify-integrity"]').click(),
    ]);
  }, { onAction: (route) => called.push(route) });

  expect(called).toContain('/api/actions/resume-monitoring');
  expect(called).toContain('/api/actions/panic-stop');
  expect(called).toContain('/api/actions/verify-integrity');
});

test('US: Monitor compact layout keeps workspace tiles in grid at sidebar width', async ({ page }) => {
  const root = path.resolve(__dirname, '../../roadmap/ui');
  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const filePath = path.join(root, relative);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', contentType(filePath));
    res.end(fs.readFileSync(filePath));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to bind test server');
  }

  try {
    await page.setViewportSize({ width: 320, height: 832 });
    await page.goto(`http://127.0.0.1:${address.port}/index.html?theme=dark`);
    const tiles = page.locator('.health-grid .health-item');
    // 5 tiles: trust, gates, intents, checkpoints, compliance
    await expect(tiles).toHaveCount(5);

    const boxes = await tiles.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = (node as { getBoundingClientRect: () => { left: number; top: number } }).getBoundingClientRect();
        return { x: rect.left, y: rect.top };
      }),
    );
    const rowKeys = Array.from(new Set(boxes.map((box) => Math.round(box.y / 10) * 10)));
    // 5 tiles at 2-column layout = 3 rows (2+2+1)
    expect(rowKeys.length).toBe(3);

    await expect.poll(async () => page.evaluate(() => {
      const shell = document.querySelector('.shell')?.getBoundingClientRect();
      const footer = document.querySelector('.legal')?.getBoundingClientRect();
      const lastTile = document.querySelector('.health-grid .health-item:last-child')?.getBoundingClientRect();
      return {
        footerVisible: !!shell && !!footer && footer.bottom <= shell.bottom - 1,
        lastTileVisible: !!shell && !!lastTile && lastTile.bottom <= shell.bottom - 1,
      };
    })).toEqual({ footerVisible: true, lastTileVisible: true });
  } finally {
    if (typeof (server as { closeAllConnections?: () => void }).closeAllConnections === 'function') {
      (server as { closeAllConnections: () => void }).closeAllConnections();
    }
    if (typeof (server as { closeIdleConnections?: () => void }).closeIdleConnections === 'function') {
      (server as { closeIdleConnections: () => void }).closeIdleConnections();
    }
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

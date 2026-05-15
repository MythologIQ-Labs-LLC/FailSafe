import { strict as assert } from 'assert';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { registerSkillsApiRoute } from '../../roadmap/routes/SkillsApiRoute';
import type { ApiRouteDeps } from '../../roadmap/routes/types';
import { RouteHarness, makeApp } from './helpers/routeTestHarness';

function makeDeps(workspaceRoot: string, dirname: string): ApiRouteDeps {
  return {
    rejectIfRemote: () => false,
    broadcast: () => undefined,
    qorRuntimeService: {} as any,
    buildHubSnapshot: async () => ({}),
    workspaceRoot,
    workspaceDirname: dirname,
    brainstormService: {} as any,
    audioVaultService: {} as any,
    getRecentCheckpoints: () => [],
    getCheckpointById: () => null,
    verifyCheckpointChain: () => true,
    revertService: null,
    sentinelDaemon: {} as any,
    planManager: {} as any,
    qorelogicManager: {} as any,
    recordCheckpoint: () => undefined,
    inferPhaseKeyFromPlan: () => 'plan',
    chainValidAt: null,
    cachedChainValid: true,
    setCachedChainValid: () => undefined,
    getTransparencyEvents: () => [],
    getRiskRegister: () => [],
    writeRiskRegister: () => undefined,
    getTimelineEntries: () => [],
    getHealthMetrics: () => null,
    getGenomePatterns: async () => [],
    getGenomeAllPatterns: async () => [],
    getGenomeUnresolved: async () => [],
    getActiveRuns: () => [],
    getCompletedRuns: () => [],
    getRun: () => undefined,
    loadRun: () => null,
    getRunSteps: () => [],
  } as ApiRouteDeps;
}

suite('registerSkillsApiRoute', () => {
  let harness: RouteHarness;
  let tmpRoot: string;

  setup(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-skills-route-'));
  });

  teardown(async () => {
    if (harness) await harness.stop();
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  test('GET /api/skills returns {skills: [...]} array shape', async () => {
    const app = makeApp();
    registerSkillsApiRoute(app, makeDeps(tmpRoot, tmpRoot));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/skills' });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.skills), 'skills must be an array');
  });

  test('POST /api/skills/ingest/auto returns auto-ingest result object', async () => {
    const app = makeApp();
    registerSkillsApiRoute(app, makeDeps(tmpRoot, tmpRoot));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({
      method: 'POST',
      path: '/api/skills/ingest/auto',
      body: {},
    });

    assert.equal(res.status, 200);
    assert.equal(typeof res.body, 'object', 'auto-ingest returns an object');
    assert.notEqual(res.body, null);
  });

  test('POST /api/skills/ingest/manual with empty items returns 400 + error payload', async () => {
    const app = makeApp();
    registerSkillsApiRoute(app, makeDeps(tmpRoot, tmpRoot));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({
      method: 'POST',
      path: '/api/skills/ingest/manual',
      body: { mode: 'folder', items: [] },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
    assert.ok(typeof res.body.error === 'string' && res.body.error.length > 0);
  });

  test('POST /api/skills/ingest/manual with a SKILL.md item returns 200 + ingest result', async () => {
    const app = makeApp();
    registerSkillsApiRoute(app, makeDeps(tmpRoot, tmpRoot));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({
      method: 'POST',
      path: '/api/skills/ingest/manual',
      body: {
        mode: 'folder',
        items: [{
          path: 'qor-test/SKILL.md',
          content: '---\nname: qor-test\ndescription: smoke\n---\n\n# qor-test\n',
        }],
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.mode, 'manual');
    assert.equal(typeof res.body.importedTo, 'string');
    assert.ok(Array.isArray(res.body.skills));
  });

  test('GET /api/skills/relevance?phase=plan returns relevance projection', async () => {
    const app = makeApp();
    registerSkillsApiRoute(app, makeDeps(tmpRoot, tmpRoot));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/skills/relevance?phase=plan' });

    assert.equal(res.status, 200);
    assert.equal(res.body.phase, 'plan');
    assert.ok(Array.isArray(res.body.recommended));
    assert.ok(Array.isArray(res.body.allRelevant));
    assert.ok(Array.isArray(res.body.otherAvailable));
  });

  test('GET /api/skills/relevance without phase returns 400 + {error: "phase is required"}', async () => {
    const app = makeApp();
    registerSkillsApiRoute(app, makeDeps(tmpRoot, tmpRoot));
    harness = new RouteHarness(app);
    await harness.start();

    const res = await harness.request({ path: '/api/skills/relevance' });

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'phase is required' });
  });
});

import { afterEach, describe, it } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IntentStore } from '../../governance/IntentStore';

const tempDirs: string[] = [];

function makeTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-store-'));
  tempDirs.push(dir);
  return dir;
}

function createV1Intent(): Record<string, unknown> {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    type: 'feature',
    createdAt: '2026-01-01T00:00:00Z',
    purpose: 'Legacy intent',
    scope: { files: [], modules: [], riskGrade: 'L1' },
    status: 'PULSE',
    metadata: { author: 'legacy-user', tags: ['old'] },
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('IntentStore (Phase 1 - Schema Migration)', () => {
  afterEach(function () {
    this.timeout(10000);
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir && fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // Windows may hold brief locks on temp dirs; swallow cleanup errors
        }
      }
    }
  });

  it('migrates v1 intent to v2 on read (adds schemaVersion and agentIdentity)', async () => {
    const workspace = makeTempWorkspace();
    const store = new IntentStore(workspace);
    const manifestDir = path.join(workspace, '.failsafe', 'manifest');
    const activeFile = path.join(manifestDir, 'active_intent.json');

    fs.writeFileSync(activeFile, JSON.stringify(createV1Intent()), 'utf-8');

    const intent = await store.readActiveIntent();
    assert.ok(intent);
    assert.equal(intent.schemaVersion, 2);
    assert.ok(intent.metadata.agentIdentity);
    assert.equal(intent.metadata.agentIdentity!.agentDid, 'legacy-user');
    assert.equal(intent.metadata.agentIdentity!.workflow, 'manual');
  });

  it('preserves existing v2 intent fields on read', async () => {
    const workspace = makeTempWorkspace();
    const store = new IntentStore(workspace);
    const manifestDir = path.join(workspace, '.failsafe', 'manifest');
    const activeFile = path.join(manifestDir, 'active_intent.json');

    const v2Intent = {
      ...createV1Intent(),
      schemaVersion: 2,
      planId: 'plan-v4.2.0',
      metadata: {
        author: 'test',
        tags: [],
        agentIdentity: { agentDid: 'agent:123', workflow: 'qor-plan' },
      },
    };
    fs.writeFileSync(activeFile, JSON.stringify(v2Intent), 'utf-8');

    const intent = await store.readActiveIntent();
    assert.ok(intent);
    assert.equal(intent.schemaVersion, 2);
    assert.equal(intent.planId, 'plan-v4.2.0');
    assert.equal(intent.metadata.agentIdentity!.agentDid, 'agent:123');
    assert.equal(intent.metadata.agentIdentity!.workflow, 'qor-plan');
  });
});

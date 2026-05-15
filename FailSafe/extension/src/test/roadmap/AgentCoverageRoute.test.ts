import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { AgentCoverageRoute } from '../../roadmap/routes/AgentCoverageRoute';
import { AgentLandscape } from '../../qorelogic/SystemRegistry';
import { QorLogicSystem } from '../../qorelogic/types/QorLogicSystem';

function createMockResponse() {
  let sentContent = '';
  return {
    send: (content: string) => { sentContent = content; },
    getSentContent: () => sentContent,
  };
}

function createMockRequest() {
  return {} as any;
}

function makeLandscape(overrides: Partial<AgentLandscape> = {}): AgentLandscape {
  return {
    registeredSystems: [],
    activeTerminals: [],
    agentTeams: { enabled: false, settingsPath: '/home/user/.claude/settings.json' },
    ...overrides,
  };
}

function createMockRegistry(landscape: AgentLandscape) {
  return {
    detectAll: async () => landscape,
    detect: async () => ({ detected: true }),
    hasGovernance: () => true,
  };
}

describe('AgentCoverageRoute', () => {
  describe('render()', () => {
    it('returns HTML containing landscape system data', async () => {
      const landscape = makeLandscape({
        registeredSystems: [
          {
            getManifest: () => ({
              id: 'claude',
              name: 'Claude Code',
              description: 'Claude governance',
              sourceDir: undefined,
              targetDir: null,
            }),
          } as QorLogicSystem,
        ],
        activeTerminals: [
          { name: 'Claude Code', agentType: 'claude', terminalIndex: 0 },
        ],
        agentTeams: { enabled: true, settingsPath: '/home/user/.claude/settings.json' },
      });

      const registry = createMockRegistry(landscape);
      const req = createMockRequest();
      const res = createMockResponse();

      await AgentCoverageRoute.render(req, res as any, { systemRegistry: registry as any });

      const html = res.getSentContent();
      assert.ok(html.includes('Agent Coverage'), 'should contain page title');
      assert.ok(html.includes('Claude Code'), 'should include system name');
      assert.ok(html.includes('Enabled'), 'should show agent teams status as enabled');
    });

    it('renders valid HTML structure with table headers', async () => {
      const landscape = makeLandscape({
        activeTerminals: [
          { name: 'Windsurf Terminal', agentType: 'windsurf', terminalIndex: 1 },
        ],
      });

      const registry = createMockRegistry(landscape);
      const req = createMockRequest();
      const res = createMockResponse();

      await AgentCoverageRoute.render(req, res as any, { systemRegistry: registry as any });

      const html = res.getSentContent();
      assert.ok(html.includes('<table>'), 'should contain table element');
      assert.ok(html.includes('Registered Systems'), 'should contain systems section heading');
      assert.ok(html.includes('Active Terminals'), 'should contain terminals section heading');
      assert.ok(html.includes('Agent Teams'), 'should contain agent teams section heading');
      assert.ok(html.includes('Windsurf Terminal'), 'should include terminal name');
    });

    it('handles empty landscape gracefully', async () => {
      const landscape = makeLandscape();
      const registry = createMockRegistry(landscape);
      const req = createMockRequest();
      const res = createMockResponse();

      await AgentCoverageRoute.render(req, res as any, { systemRegistry: registry as any });

      const html = res.getSentContent();
      assert.ok(html.length > 0, 'should return non-empty HTML');
      assert.ok(html.includes('<!DOCTYPE html>'), 'should return valid HTML document');
      assert.ok(html.includes('Disabled'), 'should show agent teams as disabled');
    });

    it('includes a navigation link back to home', async () => {
      const landscape = makeLandscape();
      const registry = createMockRegistry(landscape);
      const req = createMockRequest();
      const res = createMockResponse();

      await AgentCoverageRoute.render(req, res as any, { systemRegistry: registry as any });

      const html = res.getSentContent();
      assert.ok(html.includes('/console/home'), 'should contain link to home');
    });
  });
});

import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { AgentConfigInjector } from '../../qorelogic/AgentConfigInjector';
import { SystemRegistry } from '../../qorelogic/SystemRegistry';
import { QorLogicSystem, SystemManifest } from '../../qorelogic/types/QorLogicSystem';

const GOVERNANCE_MARKER_START = '<!-- FailSafe Governance Start -->';
const GOVERNANCE_MARKER_END = '<!-- FailSafe Governance End -->';

function createMockSystem(id: string, name: string): QorLogicSystem {
  const manifest: SystemManifest = {
    id,
    name,
    description: `Mock ${name} system`,
    sourceDir: undefined,
    targetDir: null,
  };
  return { getManifest: () => manifest };
}

suite('AgentConfigInjector Test Suite', () => {
  let tempDir: string;
  let registry: SystemRegistry;

  suiteSetup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-injector-test-'));
    registry = new SystemRegistry(tempDir);
  });

  suiteTeardown(function () {
    this.timeout(10000);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows may hold brief locks on temp dirs; swallow cleanup errors
    }
  });

  test('inject() creates governance block in config file', async () => {
    const injector = new AgentConfigInjector(registry, tempDir);
    const system = createMockSystem('claude', 'Claude Code');

    await injector.inject(system);

    const configPath = path.join(tempDir, '.claude', 'CLAUDE.md');
    assert.ok(fs.existsSync(configPath), 'Config file should be created');

    const content = fs.readFileSync(configPath, 'utf-8');
    assert.ok(content.includes(GOVERNANCE_MARKER_START), 'Should contain start marker');
    assert.ok(content.includes(GOVERNANCE_MARKER_END), 'Should contain end marker');
    assert.ok(content.includes('FailSafe Governance (Claude Code)'), 'Should contain system name');
    assert.ok(content.includes('EnforcementEngine'), 'Should contain governance rules');
  });

  test('inject() is idempotent (inject twice produces same result)', async () => {
    const injector = new AgentConfigInjector(registry, tempDir);
    const system = createMockSystem('claude', 'Claude Code');

    await injector.inject(system);
    const configPath = path.join(tempDir, '.claude', 'CLAUDE.md');
    const firstContent = fs.readFileSync(configPath, 'utf-8');

    await injector.inject(system);
    const secondContent = fs.readFileSync(configPath, 'utf-8');

    assert.strictEqual(firstContent, secondContent, 'Content should be identical after second inject');
  });

  test('remove() strips governance block from file', async () => {
    const injector = new AgentConfigInjector(registry, tempDir);
    const system = createMockSystem('claude', 'Claude Code');

    await injector.inject(system);
    const configPath = path.join(tempDir, '.claude', 'CLAUDE.md');
    assert.ok(fs.existsSync(configPath));

    await injector.remove(system);
    const content = fs.readFileSync(configPath, 'utf-8');
    assert.ok(!content.includes(GOVERNANCE_MARKER_START), 'Start marker should be removed');
    assert.ok(!content.includes(GOVERNANCE_MARKER_END), 'End marker should be removed');
  });

  test('inject() skips unknown system IDs', async () => {
    const injector = new AgentConfigInjector(registry, tempDir);
    const system = createMockSystem('unknown-agent', 'Unknown Agent');

    await injector.inject(system);
    // Should not throw, just silently skip
  });
});

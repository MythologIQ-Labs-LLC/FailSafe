import { strict as assert } from 'assert';
import { AGT_MODULES, detectEnvironment, agtPreviewNotice } from '../../../integrations/agt/agt-catalog';

suite('agt-catalog (B-INT-16)', () => {
  test('catalog covers the 9 verified AGT environment modules', () => {
    const ids = AGT_MODULES.map((m) => m.id).sort();
    assert.deepEqual(ids, [
      'antigravity-cli', 'claude-code', 'copilot-cli', 'dotnet', 'golang',
      'opencode', 'python', 'rust', 'typescript',
    ]);
  });

  test('install commands match the verified registries (corrected Rust crate + source-only Go + copy-only Claude Code)', () => {
    const by = Object.fromEntries(AGT_MODULES.map((m) => [m.id, m]));
    assert.equal(by['typescript'].command, 'npm install @microsoft/agent-governance-sdk');
    assert.equal(by['python'].command, 'pip install agent-governance-toolkit[full]');
    assert.equal(by['dotnet'].command, 'dotnet add package Microsoft.AgentGovernance');
    // Rust crate is `agentmesh` (4.0.0) — NOT `agent-governance` (the upstream
    // README is stale at 3.2.2 there). Guard against a regression to the wrong name.
    assert.equal(by['rust'].command, 'cargo add agentmesh');
    assert.equal(by['rust'].command.includes('agent-governance'), false);
    // Go has no tagged release upstream → flagged source-only.
    assert.equal(by['golang'].status, 'source-only');
    // Claude Code installs via slash commands inside the agent → copy-only.
    assert.equal(by['claude-code'].runnable, false);
    assert.equal(by['copilot-cli'].runnable, true);
    assert.equal(by['antigravity-cli'].runnable, true);
  });

  test('detectEnvironment maps workspace manifests to language modules (exact name + extension suffix)', () => {
    assert.deepEqual(detectEnvironment(['package.json']), ['typescript']);
    assert.deepEqual(detectEnvironment(['pyproject.toml']), ['python']);
    assert.deepEqual(detectEnvironment(['go.mod']), ['golang']);
    assert.deepEqual(detectEnvironment(['Cargo.toml']), ['rust']);
    assert.deepEqual(detectEnvironment(['MyApp.csproj']), ['dotnet']); // suffix match
    // No manifest → no recommendation; agent-host modules are never language-detected.
    assert.deepEqual(detectEnvironment(['README.md', 'LICENSE']), []);
    assert.deepEqual(detectEnvironment(['go.mod', 'Cargo.toml']).sort(), ['golang', 'rust']);
  });

  test('preview notice surfaces the AGT public-preview caveat', () => {
    assert.match(agtPreviewNotice(), /Public Preview/i);
  });
});

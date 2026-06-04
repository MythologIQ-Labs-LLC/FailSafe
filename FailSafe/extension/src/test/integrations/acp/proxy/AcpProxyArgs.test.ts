// Functional tests for parseProxyArgs (GH #172 Part 2): the `-- <agentCmd>` tail
// contract that tells the proxy which real agent to wrap. SDK-free → headless.

import { strict as assert } from 'assert';
import { parseProxyArgs, parseWorkspaceArg } from '../../../../integrations/acp/proxy/AcpProxyArgs';

suite('integrations/acp/proxy parseProxyArgs', () => {
  test('splits the real-agent command tail after the bare `--`', () => {
    assert.deepEqual(
      parseProxyArgs(['--workspace', '/w', '--', 'gemini', 'acp', '--flag']),
      { agentCommand: 'gemini', agentArgs: ['acp', '--flag'] },
    );
  });

  test('a bare command with no args parses to empty agentArgs', () => {
    assert.deepEqual(parseProxyArgs(['--', 'my-agent']), { agentCommand: 'my-agent', agentArgs: [] });
  });

  test('fail-closed: missing `--` throws (never start without a real agent)', () => {
    assert.throws(() => parseProxyArgs(['--workspace', '/w']), /missing real-agent command/);
  });

  test('fail-closed: a trailing `--` with no command throws', () => {
    assert.throws(() => parseProxyArgs(['--workspace', '/w', '--']), /missing real-agent command/);
  });
});

suite('integrations/acp/proxy parseWorkspaceArg', () => {
  test('reads --workspace from the proxy flags', () => {
    assert.equal(parseWorkspaceArg(['--workspace', '/repo', '--', 'agent'], '/cwd'), '/repo');
  });

  test('falls back when --workspace is absent', () => {
    assert.equal(parseWorkspaceArg(['--', 'agent'], '/cwd'), '/cwd');
  });

  test('a --workspace in the AGENT tail is NOT consumed (scanned only before `--`)', () => {
    assert.equal(parseWorkspaceArg(['--', 'agent', '--workspace', '/evil'], '/cwd'), '/cwd');
  });
});

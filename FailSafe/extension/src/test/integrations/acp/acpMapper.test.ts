// Functional tests for the ACP→action mappers (GH #172). Pure functions — each
// test asserts the mapped action's kind/target/payload, including the schema/docs
// toolName-vs-toolCall defensive handling.

import { strict as assert } from 'assert';
import {
  acpToolCallToAction,
  acpFsWriteToAction,
  acpTerminalCreateToAction,
  acpPermissionToAction,
  acpIntentToAction,
} from '../../../integrations/acp/acpMapper';

suite('integrations/acp acpMapper', () => {
  test('tool_call → acp_tool_call with title target + rawInput payload', () => {
    const a = acpToolCallToAction({ toolCallId: 'tc1', title: 'Edit file', kind: 'edit', rawInput: { path: '/a.ts' } });
    assert.equal(a.kind, 'acp_tool_call');
    assert.equal(a.target, 'Edit file');
    assert.equal(a.payload?.path, '/a.ts');
    assert.equal(a.payload?.toolCallId, 'tc1');
    assert.equal(a.payload?.toolKind, 'edit');
  });

  test('tool_call without a title falls back to the toolCallId as target', () => {
    const a = acpToolCallToAction({ toolCallId: 'tc2' });
    assert.equal(a.target, 'tc2');
    assert.equal(a.payload?.toolKind, 'other');
  });

  test('fs_write → acp_fs_write with the ABSOLUTE path as target (for Axiom2 scoping)', () => {
    const a = acpFsWriteToAction({ sessionId: 's', path: '/abs/secret.env', content: 'TOKEN=x' });
    assert.equal(a.kind, 'acp_fs_write');
    assert.equal(a.target, '/abs/secret.env');
    assert.equal(a.payload?.path, '/abs/secret.env');
    assert.equal(a.payload?.content, 'TOKEN=x');
  });

  test('terminal_create → acp_terminal_create with command target + full argv payload', () => {
    const a = acpTerminalCreateToAction({ sessionId: 's', command: 'rm', args: ['-rf', '/'], cwd: '/tmp' });
    assert.equal(a.kind, 'acp_terminal_create');
    assert.equal(a.target, 'rm');
    assert.deepEqual(a.payload?.args, ['-rf', '/']);
    assert.equal(a.payload?.cwd, '/tmp');
  });

  test('permission PREFERS toolCall.rawInput (richer argv signal) over toolName', () => {
    const a = acpPermissionToAction({
      sessionId: 's',
      toolName: 'shell',
      toolCall: { toolCallId: 'tc3', title: 'Run shell', rawInput: { command: ['/bin/zsh', '-lc', 'printf x > f'] } },
      options: [
        { optionId: 'a', name: 'Allow', kind: 'allow_once' },
        { optionId: 'r', name: 'Reject', kind: 'reject_once' },
      ],
    });
    assert.equal(a.kind, 'acp_permission');
    assert.equal(a.target, 'Run shell');
    assert.deepEqual(a.payload?.command, ['/bin/zsh', '-lc', 'printf x > f']);
    assert.equal(a.payload?.toolName, 'shell');
    assert.deepEqual(a.payload?.optionKinds, ['allow_once', 'reject_once']);
  });

  test('permission falls back to toolName when no toolCall is present', () => {
    const a = acpPermissionToAction({ sessionId: 's', toolName: 'write_file', options: [] });
    assert.equal(a.target, 'write_file');
    assert.equal(a.payload?.toolName, 'write_file');
  });

  test('acpIntentToAction dispatches each intent type', () => {
    assert.equal(acpIntentToAction({ type: 'fs_write', params: { sessionId: 's', path: '/x', content: '' } }).kind, 'acp_fs_write');
    assert.equal(acpIntentToAction({ type: 'tool_call', toolCall: { toolCallId: 't' } }).kind, 'acp_tool_call');
    assert.equal(acpIntentToAction({ type: 'terminal_create', params: { sessionId: 's', command: 'ls' } }).kind, 'acp_terminal_create');
    assert.equal(acpIntentToAction({ type: 'permission', request: { sessionId: 's', options: [] } }).kind, 'acp_permission');
  });
});

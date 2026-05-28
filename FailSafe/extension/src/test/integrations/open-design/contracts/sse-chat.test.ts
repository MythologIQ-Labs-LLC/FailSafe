// FX720 — vendored ChatSseEvent contract tests.
// Verifies isChatSseEvent runtime guard discrimination + TS narrowing
// surface for each kind. Pure-data tests; no IO.

import { strict as assert } from 'assert';
import {
  ChatSseEvent,
  isChatSseEvent,
} from '../../../../integrations/open-design/contracts/sse-chat';

function narrow<K extends ChatSseEvent['kind']>(
  e: ChatSseEvent,
  kind: K,
): Extract<ChatSseEvent, { kind: K }> {
  if (e.kind !== kind) throw new Error(`expected ${kind}, got ${e.kind}`);
  return e as Extract<ChatSseEvent, { kind: K }>;
}

suite('integrations/open-design/contracts sse-chat', () => {
  test('parses start variant', () => {
    const raw = { kind: 'start', runId: 'r1', agent: { agent: 'claude' } };
    assert.equal(isChatSseEvent(raw), true);
    if (isChatSseEvent(raw)) {
      const e = narrow(raw, 'start');
      assert.equal(e.runId, 'r1');
      assert.equal(e.agent?.agent, 'claude');
    }
  });

  test('parses agent.text_delta variant', () => {
    const raw = { kind: 'agent.text_delta', delta: 'hello' };
    assert.equal(isChatSseEvent(raw), true);
    if (isChatSseEvent(raw)) {
      const e = narrow(raw, 'agent.text_delta');
      assert.equal(e.delta, 'hello');
    }
  });

  test('parses agent.tool_use variant', () => {
    const raw = { kind: 'agent.tool_use', toolName: 'list_files', arguments: { dir: '/' } };
    assert.equal(isChatSseEvent(raw), true);
    if (isChatSseEvent(raw)) {
      const e = narrow(raw, 'agent.tool_use');
      assert.equal(e.toolName, 'list_files');
      assert.deepEqual(e.arguments, { dir: '/' });
    }
  });

  test('parses agent.tool_result variant', () => {
    const raw = { kind: 'agent.tool_result', toolName: 'list_files', result: [], isError: false };
    assert.equal(isChatSseEvent(raw), true);
    if (isChatSseEvent(raw)) {
      const e = narrow(raw, 'agent.tool_result');
      assert.equal(e.toolName, 'list_files');
      assert.equal(e.isError, false);
    }
  });

  test('parses stdout variant', () => {
    const raw = { kind: 'stdout', data: 'log line\n' };
    assert.equal(isChatSseEvent(raw), true);
    if (isChatSseEvent(raw)) {
      const e = narrow(raw, 'stdout');
      assert.equal(e.data, 'log line\n');
    }
  });

  test('parses stderr variant', () => {
    const raw = { kind: 'stderr', data: 'oops\n' };
    assert.equal(isChatSseEvent(raw), true);
    if (isChatSseEvent(raw)) {
      const e = narrow(raw, 'stderr');
      assert.equal(e.data, 'oops\n');
    }
  });

  test('parses error variant', () => {
    const raw = { kind: 'error', error: { code: 'transport', message: 'boom' } };
    assert.equal(isChatSseEvent(raw), true);
    if (isChatSseEvent(raw)) {
      const e = narrow(raw, 'error');
      assert.equal(e.error.code, 'transport');
      assert.equal(e.error.message, 'boom');
    }
  });

  test('parses end variant', () => {
    const raw = { kind: 'end', exitCode: 0 };
    assert.equal(isChatSseEvent(raw), true);
    if (isChatSseEvent(raw)) {
      const e = narrow(raw, 'end');
      assert.equal(e.exitCode, 0);
    }
  });

  test('rejects malformed payloads', () => {
    assert.equal(isChatSseEvent(null), false);
    assert.equal(isChatSseEvent(undefined), false);
    assert.equal(isChatSseEvent('start'), false);
    assert.equal(isChatSseEvent({}), false); // missing kind
    assert.equal(isChatSseEvent({ kind: 'unknown' }), false); // unknown variant
    assert.equal(isChatSseEvent({ kind: 'start' }), false); // missing runId
    assert.equal(isChatSseEvent({ kind: 'agent.text_delta', delta: 42 }), false); // wrong type
    assert.equal(isChatSseEvent({ kind: 'error', error: { code: 'x' } }), false); // missing message
  });
});

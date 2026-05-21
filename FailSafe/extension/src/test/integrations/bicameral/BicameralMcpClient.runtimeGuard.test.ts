// FX542 — B-BIC-23: isToolCallResult runtime guard verification.
import { strict as assert } from 'assert';
import { isToolCallResult } from '../../../integrations/bicameral/parsers';

suite('isToolCallResult runtime guard (FX542 — B-BIC-23)', () => {
  test('accepts object with content[] only', () => {
    assert.equal(isToolCallResult({ content: [{ type: 'text', text: '{}' }] }), true);
  });

  test('accepts object with structuredContent only', () => {
    assert.equal(isToolCallResult({ structuredContent: { foo: 'bar' } }), true);
  });

  test('accepts object with both content[] and structuredContent', () => {
    assert.equal(isToolCallResult({ content: [], structuredContent: 42 }), true);
  });

  test('accepts isError: true with content[]', () => {
    assert.equal(isToolCallResult({ content: [{ text: 'err' }], isError: true }), true);
  });

  test('accepts isError: false with content[]', () => {
    assert.equal(isToolCallResult({ content: [], isError: false }), true);
  });

  test('rejects object missing both content[] and structuredContent', () => {
    assert.equal(isToolCallResult({ isError: true }), false);
  });

  test('rejects when isError is non-boolean (e.g. string)', () => {
    assert.equal(isToolCallResult({ content: [], isError: 'truthy' }), false);
  });

  test('rejects naked string', () => {
    assert.equal(isToolCallResult('result'), false);
  });

  test('rejects null', () => {
    assert.equal(isToolCallResult(null), false);
  });

  test('rejects undefined', () => {
    assert.equal(isToolCallResult(undefined), false);
  });

  test('rejects naked number', () => {
    assert.equal(isToolCallResult(42), false);
  });

  test('rejects bare array', () => {
    assert.equal(isToolCallResult([{ type: 'text', text: 'x' }]), false);
  });

  test('rejects object where content is not an array', () => {
    assert.equal(isToolCallResult({ content: 'not-array' }), false);
  });
});

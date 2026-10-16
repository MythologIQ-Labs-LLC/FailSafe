import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { persistOpenHandsObservations } from '../../../integrations/agent-observe/openhands-import';
import type { AgentObservationEvent } from '../../../integrations/agent-observe/openhands-observer';
import { TransparencyLogger } from '../../../roadmap/services/TransparencyLogger';

suite('OpenHands historical persistence #477', () => {
  test('persists redacted observations, deduplicates repeated import and reports counts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-openhands-'));
    try {
      const source = path.join(root, 'run.json');
      fs.writeFileSync(source, '{"version":"1.0.0","events":[]}');
      const event: AgentObservationEvent = {
        id: 'evt-1', source: 'openhands', kind: 'action', verb: 'execute_bash',
        tool: 'execute_bash', riskHint: 'high', summary: 'action:execute_bash',
      };
      assert.deepEqual(persistOpenHandsObservations(root, source, [event, event]), { imported: 1, duplicates: 1 });
      assert.deepEqual(persistOpenHandsObservations(root, source, [event]), { imported: 0, duplicates: 1 });
      const log = fs.readFileSync(path.join(root, '.failsafe', 'logs', 'transparency.jsonl'), 'utf8');
      const rows = log.trim().split('\n').map(line => JSON.parse(line));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].origin, 'historical-export');
      assert.equal(rows[0].sourceEventId, 'evt-1');
      assert.equal(rows[0].sourceSha256.length, 64);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('refuses to claim import success against malformed existing transparency log', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-openhands-badlog-'));
    try {
      const source = path.join(root, 'run.json');
      fs.writeFileSync(source, '[]');
      const logDir = path.join(root, '.failsafe', 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      fs.writeFileSync(path.join(logDir, 'transparency.jsonl'), 'not-json\n');
      assert.throws(() => persistOpenHandsObservations(root, source, []), /OPENHANDS_IMPORT_CORRUPT_LOG/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  test('imported events are returned by the transparency API storage reader', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-openhands-visible-'));
    try {
      const source = path.join(root, 'run.json');
      fs.writeFileSync(source, '[]');
      const event: AgentObservationEvent = {
        id: 'e2', source: 'openhands', kind: 'observation', verb: 'read',
        riskHint: 'info', summary: 'observation:read',
      };
      persistOpenHandsObservations(root, source, [event]);
      const visible = new TransparencyLogger(root).getEvents(50);
      assert.equal(visible.length, 1);
      assert.equal(visible[0].sourceEventId, 'e2');
      assert.equal(visible[0].origin, 'historical-export');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('a concurrent import lock refuses an import rather than duplicating records', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-openhands-locked-'));
    try {
      const source = path.join(root, 'run.json');
      fs.writeFileSync(source, '[]');
      const logDir = path.join(root, '.failsafe', 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      const lock = path.join(logDir, 'transparency.jsonl.openhands-import.lock');
      fs.writeFileSync(lock, 'held');
      assert.throws(() => persistOpenHandsObservations(root, source, []), /OPENHANDS_IMPORT_LOCKED/);
      assert.equal(fs.existsSync(lock), true);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('refuses a symlinked audit log instead of appending outside workspace', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-openhands-symlink-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-openhands-outside-'));
    try {
      const source = path.join(root, 'run.json');
      fs.writeFileSync(source, '[]');
      const logDir = path.join(root, '.failsafe', 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      const sentinel = path.join(outside, 'sentinel.jsonl');
      fs.writeFileSync(sentinel, 'untouched');
      try {
        fs.symlinkSync(sentinel, path.join(logDir, 'transparency.jsonl'), 'file');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
        throw error;
      }
      assert.throws(() => persistOpenHandsObservations(root, source, []), /OPENHANDS_IMPORT_SYMLINK/);
      assert.equal(fs.readFileSync(sentinel, 'utf8'), 'untouched');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

});

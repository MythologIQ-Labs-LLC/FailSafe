import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { persistOpenHandsObservations } from '../../../integrations/agent-observe/openhands-import';
import type { AgentObservationEvent } from '../../../integrations/agent-observe/openhands-observer';

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
});

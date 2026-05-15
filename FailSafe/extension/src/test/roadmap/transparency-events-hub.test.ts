import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TransparencyLogger } from '../../roadmap/services/TransparencyLogger';

let tmpRoot: string;

function logPath(): string {
  return path.join(tmpRoot, '.failsafe', 'logs', 'transparency.jsonl');
}

function writeEvents(events: Array<Record<string, unknown>>): void {
  const dir = path.dirname(logPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    logPath(),
    events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''),
    'utf-8',
  );
}

/**
 * Mirrors the wiring in ConsoleServer.buildHubSnapshot so we can verify
 * the transparency-events field's contract independently of the heavy
 * ConsoleServer construction. The `.reverse()` is the load-bearing piece —
 * TransparencyLogger.getEvents returns file order (oldest-first); the hub
 * surfaces newest-first per the de-theater plan spec.
 */
function bundleTransparencyEventsForHub(
  workspaceRoot: string, limit = 20,
): Array<Record<string, unknown>> {
  return new TransparencyLogger(workspaceRoot).getEvents(limit).reverse();
}

suite('hub.transparencyEvents wiring', function () {
  this.timeout(5000);
  setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transparency-hub-')); });
  teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ } });

  test('returns [] when transparency.jsonl does not exist', () => {
    const events = bundleTransparencyEventsForHub(tmpRoot);
    assert.deepEqual(events, []);
  });

  test('returns [] for an empty log file', () => {
    fs.mkdirSync(path.dirname(logPath()), { recursive: true });
    fs.writeFileSync(logPath(), '');
    assert.deepEqual(bundleTransparencyEventsForHub(tmpRoot), []);
  });

  test('returns the most recent N events in reverse-chronological order', () => {
    writeEvents([
      { ts: 1, kind: 'oldest' },
      { ts: 2, kind: 'middle' },
      { ts: 3, kind: 'newest' },
    ]);
    const events = bundleTransparencyEventsForHub(tmpRoot, 20);
    assert.equal(events.length, 3);
    assert.equal(events[0].kind, 'newest');
    assert.equal(events[2].kind, 'oldest');
  });

  test('respects the limit parameter (caps to N most recent)', () => {
    writeEvents(Array.from({ length: 50 }, (_, i) => ({ ts: i, idx: i })));
    const events = bundleTransparencyEventsForHub(tmpRoot, 5);
    assert.equal(events.length, 5);
    // After reverse, newest (idx 49) is first.
    assert.equal(events[0].idx, 49);
    assert.equal(events[4].idx, 45);
  });

  test('skips malformed JSON lines without throwing', () => {
    fs.mkdirSync(path.dirname(logPath()), { recursive: true });
    fs.writeFileSync(
      logPath(),
      `${JSON.stringify({ ts: 1, ok: true })}\nNOT JSON\n${JSON.stringify({ ts: 2, ok: true })}\n`,
    );
    const events = bundleTransparencyEventsForHub(tmpRoot, 20);
    // Both well-formed events present; malformed line silently skipped.
    assert.equal(events.length, 2);
  });
});

import { strict as assert } from 'assert';
import {
  parseOpenItemsFromText,
  parseOpenBlockersFromText,
  summarizeBacklog,
} from '../../roadmap/services/BacklogReader';

const FIXTURE = `# Project Backlog

## Blockers (Must Fix Before Progress)

### Security Blockers

- [ ] [S1] Critical auth bypass in /api/admin
- [x] [S2] Path traversal in revert flow — RESOLVED v4.9.7

### Development Blockers

- [ ] [D40] Razor: ConsoleServer.ts at 1177L (post-decomp)
- [x] [D41] Ghost path — RESOLVED v4.9.8
- [ ] [D42] Architecture issue with EventBus listener leak

## Backlog (Planned Work)

- [ ] [B100] Add WebSocket reconnection backoff
- [x] [B101] Adapter parity — Complete v4.9.0
- [ ] [B102] Polyfill Web Speech API
`;

suite('BacklogReader: parseOpenItemsFromText', () => {
  test('returns only open items (filters [x])', () => {
    const items = parseOpenItemsFromText(FIXTURE);
    const ids = items.map((i) => i.backlogId);
    assert.deepEqual(ids, ['S1', 'D40', 'D42', 'B100', 'B102']);
  });

  test('assigns critical severity to S-prefixed items', () => {
    const items = parseOpenItemsFromText(FIXTURE);
    const s1 = items.find((i) => i.backlogId === 'S1');
    assert.equal(s1?.severity, 'critical');
  });

  test('assigns high severity to D-prefixed items', () => {
    const items = parseOpenItemsFromText(FIXTURE);
    const d40 = items.find((i) => i.backlogId === 'D40');
    assert.equal(d40?.severity, 'high');
  });

  test('assigns medium severity to B-prefixed items', () => {
    const items = parseOpenItemsFromText(FIXTURE);
    const b100 = items.find((i) => i.backlogId === 'B100');
    assert.equal(b100?.severity, 'medium');
  });

  test('captures section context', () => {
    const items = parseOpenItemsFromText(FIXTURE);
    const s1 = items.find((i) => i.backlogId === 'S1');
    assert.equal(s1?.section, 'Security Blockers');
    const d40 = items.find((i) => i.backlogId === 'D40');
    assert.equal(d40?.section, 'Development Blockers');
  });

  test('namespaces id with backlog: prefix', () => {
    const items = parseOpenItemsFromText(FIXTURE);
    assert.ok(items.every((i) => i.id.startsWith('backlog:')));
    assert.equal(items[0].id, 'backlog:S1');
  });

  test('returns empty array for empty input', () => {
    assert.deepEqual(parseOpenItemsFromText(''), []);
  });

  test('returns empty array when no open items', () => {
    const allClosed = `## Blockers\n### Development Blockers\n- [x] [D1] done`;
    assert.deepEqual(parseOpenItemsFromText(allClosed), []);
  });
});

suite('BacklogReader: parseOpenBlockersFromText (Plan.blockers projection)', () => {
  test('returns ONLY S* and D* open items (filters out B*)', () => {
    const blockers = parseOpenBlockersFromText(FIXTURE);
    const ids = blockers.map((b) => b.id);
    assert.deepEqual(ids, ['S1', 'D40', 'D42']);
    assert.ok(!ids.some((id) => id.startsWith('B')));
  });

  test('produces Blocker shape with hard severity for S* (critical) items', () => {
    const blockers = parseOpenBlockersFromText(FIXTURE);
    const s1 = blockers.find((b) => b.id === 'S1');
    assert.equal(s1?.severity, 'hard');
    assert.equal(typeof s1?.title, 'string');
    assert.equal(typeof s1?.reason, 'string');
    assert.equal(typeof s1?.createdAt, 'string');
    assert.equal(s1?.phaseId, 'unassigned');
  });

  test('produces Blocker shape with hard severity for D* items', () => {
    const blockers = parseOpenBlockersFromText(FIXTURE);
    const d40 = blockers.find((b) => b.id === 'D40');
    assert.equal(d40?.severity, 'hard');
  });

  test('returns empty array when no open blockers', () => {
    const allClosed = `### Security Blockers\n- [x] [S1] resolved\n### Development Blockers\n- [x] [D1] done`;
    assert.deepEqual(parseOpenBlockersFromText(allClosed), []);
  });
});

suite('BacklogReader: summarizeBacklog', () => {
  test('counts security/dev blockers and backlog separately', () => {
    const items = parseOpenItemsFromText(FIXTURE);
    const summary = summarizeBacklog(items);
    assert.equal(summary.totalSecurityBlockers, 1);
    assert.equal(summary.totalDevBlockers, 2);
    assert.equal(summary.totalOpenBlockers, 3);
    assert.equal(summary.totalOpenBacklog, 2);
  });

  test('zero summary for empty input', () => {
    const summary = summarizeBacklog([]);
    assert.equal(summary.totalOpenBlockers, 0);
    assert.equal(summary.totalSecurityBlockers, 0);
    assert.equal(summary.totalDevBlockers, 0);
    assert.equal(summary.totalOpenBacklog, 0);
  });
});

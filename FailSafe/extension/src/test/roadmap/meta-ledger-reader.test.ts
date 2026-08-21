import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  MetaLedgerReader,
  parseEntriesFromText,
  summarizeEntries,
  recentVerdictsFromEntries,
  recentCompletionsFromEntries,
} from '../../roadmap/services/MetaLedgerReader';

const FIXTURE = `# META_LEDGER

## Chain Status: ACTIVE

### Entry #1: GENESIS

Initial seed.

### Entry #2: GATE TRIBUNAL - Roadmap Visualization

Plan submitted.

### Entry #3: GATE TRIBUNAL — Roadmap Visualization (Re-audit)

Plan amended.

### Entry #4: IMPLEMENTATION — Roadmap Visualization

Built.

### Entry #5: SUBSTANTIATION — Session Seal v1.1.0

Sealed.

### Entry #6: GATE TRIBUNAL — Chat Participant

Next plan.

### Entry #7: SESSION SEAL — Chat Participant

Sealed (newer naming).

### Entry #8: DELIVER — v4.10.0

Shipped.

### Entry #9: PLAN — Cross-Agent Skill Consolidation

Plan iteration.
`;

suite('MetaLedgerReader: parseEntriesFromText', () => {
  test('parses GENESIS, GATE TRIBUNAL, IMPLEMENTATION, SUBSTANTIATION', () => {
    const entries = parseEntriesFromText(FIXTURE);
    const numbers = entries.map((e) => e.number);
    assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('classifies kind tokens correctly across hyphen and em-dash separators', () => {
    const entries = parseEntriesFromText(FIXTURE);
    const kinds = entries.map((e) => e.kind);
    assert.deepEqual(kinds, [
      'GENESIS',
      'GATE TRIBUNAL',
      'GATE TRIBUNAL',
      'IMPLEMENTATION',
      'SUBSTANTIATION',
      'GATE TRIBUNAL',
      'SESSION SEAL',
      'DELIVER',
      'PLAN',
    ]);
  });

  test('captures titles after separator', () => {
    const entries = parseEntriesFromText(FIXTURE);
    const titles = entries.map((e) => e.title);
    assert.equal(titles[1], 'Roadmap Visualization');
    assert.equal(titles[6], 'Chat Participant');
  });

  test('returns empty array for empty input', () => {
    assert.deepEqual(parseEntriesFromText(''), []);
  });

  test('ignores non-matching headings', () => {
    const noisy = `### Some other heading\n## Top-level\n### Entry #42: PLAN — Test`;
    const entries = parseEntriesFromText(noisy);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].number, 42);
    assert.equal(entries[0].kind, 'PLAN');
  });
});

suite('MetaLedgerReader: summarizeEntries', () => {
  test('counts SUBSTANTIATION + SESSION SEAL + DELIVER toward sessionsCompleted', () => {
    const entries = parseEntriesFromText(FIXTURE);
    const summary = summarizeEntries(entries);
    // Fixture has 1 SUBSTANTIATION + 1 SESSION SEAL + 1 DELIVER = 3 sealed.
    assert.equal(summary.sessionsCompleted, 3);
  });

  test('counts GATE TRIBUNAL toward plansStarted with distinct entry numbers', () => {
    const entries = parseEntriesFromText(FIXTURE);
    const summary = summarizeEntries(entries);
    // Fixture has 3 GATE TRIBUNAL entries at distinct numbers (2, 3, 6).
    assert.equal(summary.plansStarted, 3);
  });

  test('plansStarted dedupes by entry number when re-audits share a number', () => {
    const reAudit = `
### Entry #42: GATE TRIBUNAL — First pass
### Entry #42: GATE TRIBUNAL — Re-audit (same entry number)
### Entry #43: GATE TRIBUNAL — Distinct entry
`;
    const summary = summarizeEntries(parseEntriesFromText(reAudit));
    assert.equal(summary.plansStarted, 2, 'duplicate #42 must collapse to 1');
  });

  test('sessionsInFlight = max(0, plansStarted - sessionsCompleted)', () => {
    const entries = parseEntriesFromText(FIXTURE);
    const summary = summarizeEntries(entries);
    // 3 plans - 3 sealed = 0 in flight.
    assert.equal(summary.sessionsInFlight, 0);
  });

  test('latestEntry returns max-by-number, not last-by-position', () => {
    const outOfOrder = `
### Entry #5: PLAN — Last in file but lower number
### Entry #99: GATE TRIBUNAL — Highest number
### Entry #10: PLAN — Out-of-order tail
`;
    const summary = summarizeEntries(parseEntriesFromText(outOfOrder));
    assert.equal(summary.latestEntry?.number, 99);
    assert.equal(summary.latestEntry?.kind, 'GATE TRIBUNAL');
  });

  test('latestEntry on sorted fixture still returns highest number', () => {
    const entries = parseEntriesFromText(FIXTURE);
    const summary = summarizeEntries(entries);
    assert.equal(summary.latestEntry?.number, 9);
    assert.equal(summary.latestEntry?.kind, 'PLAN');
  });

  test('handles empty input with all-zero summary', () => {
    const summary = summarizeEntries([]);
    assert.equal(summary.totalEntries, 0);
    assert.equal(summary.sessionsCompleted, 0);
    assert.equal(summary.plansStarted, 0);
    assert.equal(summary.sessionsInFlight, 0);
    assert.equal(summary.latestEntry, null);
  });
});

suite('MetaLedgerReader: recentVerdictsFromEntries', () => {
  test('returns last N GATE TRIBUNAL entries shaped as verdict records', () => {
    const entries = parseEntriesFromText(FIXTURE);
    const verdicts = recentVerdictsFromEntries(entries, 10);
    // Fixture has 3 GATE TRIBUNAL entries.
    assert.equal(verdicts.length, 3);
    for (const v of verdicts) {
      assert.equal(typeof v.id, 'string');
      assert.equal(typeof v.title, 'string');
      assert.equal(v.kind, 'GATE TRIBUNAL');
    }
  });

  test('respects limit parameter', () => {
    const entries = parseEntriesFromText(FIXTURE);
    const verdicts = recentVerdictsFromEntries(entries, 2);
    assert.equal(verdicts.length, 2);
  });

  test('returns empty array when no GATE TRIBUNAL entries present', () => {
    const noGates = `### Entry #1: GENESIS\n### Entry #2: PLAN — alpha`;
    const verdicts = recentVerdictsFromEntries(parseEntriesFromText(noGates), 10);
    assert.deepEqual(verdicts, []);
  });
});

suite('MetaLedgerReader: parseEntries() caching', () => {
  let workspaceRoot: string;

  const writeLedger = (root: string, body: string) => {
    const docsDir = path.join(root, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'META_LEDGER.md'), body, 'utf8');
  };

  setup(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-ledger-reader-'));
  });

  teardown(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('parses the on-disk ledger on first call', () => {
    writeLedger(workspaceRoot, FIXTURE);
    const reader = new MetaLedgerReader(workspaceRoot);
    const entries = reader.parseEntries();
    assert.deepEqual(entries.map((e) => e.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('memoizes per instance: a later on-disk edit does not change subsequent calls', () => {
    writeLedger(workspaceRoot, FIXTURE);
    const reader = new MetaLedgerReader(workspaceRoot);
    const first = reader.parseEntries();

    writeLedger(workspaceRoot, `${FIXTURE}\n### Entry #10: PLAN — Added after first read\n`);

    const second = reader.parseEntries();
    assert.deepEqual(second, first, 'second call must return the cached result, not re-read the file');
    assert.equal(second.length, 9);
  });

  test('summarize/recentVerdicts/recentCompletions on one instance agree with a single parseEntries() call', () => {
    writeLedger(workspaceRoot, FIXTURE);
    const reader = new MetaLedgerReader(workspaceRoot);
    const entries = reader.parseEntries();
    assert.deepEqual(reader.summarize(), summarizeEntries(entries));
    assert.deepEqual(reader.recentVerdicts(10), recentVerdictsFromEntries(entries, 10));
    assert.deepEqual(reader.recentCompletions(10), recentCompletionsFromEntries(entries, 10));
  });

  test('a fresh instance re-reads the current on-disk state (no cross-instance staleness)', () => {
    writeLedger(workspaceRoot, FIXTURE);
    const first = new MetaLedgerReader(workspaceRoot).parseEntries();
    assert.equal(first.length, 9);

    writeLedger(workspaceRoot, `${FIXTURE}\n### Entry #10: PLAN — Added between instances\n`);

    const second = new MetaLedgerReader(workspaceRoot).parseEntries();
    assert.equal(second.length, 10, 'a new instance must observe the updated file');
  });

  test('missing ledger file caches an empty array without throwing on repeat calls', () => {
    const reader = new MetaLedgerReader(workspaceRoot);
    assert.deepEqual(reader.parseEntries(), []);
    assert.deepEqual(reader.parseEntries(), []);
  });
});

suite('MetaLedgerReader: recentCompletionsFromEntries', () => {
  test('returns last N SUBSTANTIATION/SESSION SEAL/DELIVER entries', () => {
    const entries = parseEntriesFromText(FIXTURE);
    const completions = recentCompletionsFromEntries(entries, 10);
    // Fixture: 1 SUBSTANTIATION + 1 SESSION SEAL + 1 DELIVER = 3.
    assert.equal(completions.length, 3);
    for (const c of completions) {
      assert.ok(['SUBSTANTIATION', 'SESSION SEAL', 'DELIVER'].includes(c.kind));
    }
  });

  test('respects limit parameter', () => {
    const entries = parseEntriesFromText(FIXTURE);
    const completions = recentCompletionsFromEntries(entries, 1);
    assert.equal(completions.length, 1);
  });
});

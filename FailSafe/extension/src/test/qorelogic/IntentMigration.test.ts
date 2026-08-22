// Functional tests for IntentMigration.migrateIntentSchemaV2 (#243 Tranche C).
//
// This migration runs on every activation via
// WorkspaceMigration.checkAndRepair(), with no caller-side try/catch — so a
// single archived intent left malformed by an interrupted write (crash, disk
// full, killed process mid-upgrade) must never abort activation for the
// whole workspace, and must not block migration of the other, healthy
// archived intents in the same directory.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { migrateIntentSchemaV2 } from '../../qorelogic/IntentMigration';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'intent-mig-'));
}

function intentsDirFor(rootPath: string): string {
  return path.join(rootPath, '.failsafe', 'manifest', 'intents');
}

suite('IntentMigration.migrateIntentSchemaV2 (#243 Tranche C)', () => {
  let dir: string;
  let intentsDir: string;
  let warnCalls: unknown[][];
  let origWarn: typeof console.warn;

  setup(() => {
    dir = tmpRoot();
    intentsDir = intentsDirFor(dir);
    fs.mkdirSync(intentsDir, { recursive: true });
    warnCalls = [];
    origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnCalls.push(args); };
  });

  teardown(() => {
    console.warn = origWarn;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('no intents directory — resolves without error', async () => {
    fs.rmSync(intentsDir, { recursive: true, force: true });
    await assert.doesNotReject(() => migrateIntentSchemaV2(dir));
  });

  test('migrates a v1 archived intent to v2 with default planId + agentIdentity', async () => {
    const file = path.join(intentsDir, 'ok-1.json');
    fs.writeFileSync(file, JSON.stringify({
      id: 'ok-1',
      schemaVersion: 1,
      metadata: { author: 'operator-x' },
    }));

    await migrateIntentSchemaV2(dir);

    const migrated = JSON.parse(fs.readFileSync(file, 'utf-8'));
    assert.equal(migrated.schemaVersion, 2);
    assert.equal(migrated.planId, null);
    assert.deepEqual(migrated.metadata.agentIdentity, { agentDid: 'operator-x', workflow: 'manual' });
  });

  test('already-v2 intents are left untouched (idempotent)', async () => {
    const file = path.join(intentsDir, 'already-v2.json');
    const original = { id: 'already-v2', schemaVersion: 2, planId: 'p-1', metadata: { agentIdentity: { agentDid: 'x', workflow: 'manual' } } };
    fs.writeFileSync(file, JSON.stringify(original));

    await migrateIntentSchemaV2(dir);

    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf-8')), original);
  });

  test('a malformed archive from an interrupted write does not abort the migration pass', async () => {
    // Simulates a crash/kill mid-write leaving a truncated JSON file — the
    // realistic shape of "interruption" for this store (IntentStore.archiveIntent
    // writes via plain fs.writeFile with no atomic temp+rename and no lock).
    const corruptFile = path.join(intentsDir, 'corrupt.json');
    fs.writeFileSync(corruptFile, '{"id":"corrupt","schemaVersion":1,"met');

    await assert.doesNotReject(() => migrateIntentSchemaV2(dir));
  });

  test('a malformed archive is left on disk, not clobbered or deleted', async () => {
    const corruptFile = path.join(intentsDir, 'corrupt.json');
    const corruptContent = '{"id":"corrupt","schemaVersion":1,"met';
    fs.writeFileSync(corruptFile, corruptContent);

    await migrateIntentSchemaV2(dir);

    assert.equal(fs.readFileSync(corruptFile, 'utf-8'), corruptContent);
  });

  test('a malformed archive does not block migration of other healthy archives in the same directory', async () => {
    const corruptFile = path.join(intentsDir, 'corrupt.json');
    fs.writeFileSync(corruptFile, '{"id":"corrupt","schemaVersion":1,"met');
    const healthyFile = path.join(intentsDir, 'healthy.json');
    fs.writeFileSync(healthyFile, JSON.stringify({ id: 'healthy', schemaVersion: 1, metadata: { author: 'operator-y' } }));

    await migrateIntentSchemaV2(dir);

    const migrated = JSON.parse(fs.readFileSync(healthyFile, 'utf-8'));
    assert.equal(migrated.schemaVersion, 2);
    assert.deepEqual(migrated.metadata.agentIdentity, { agentDid: 'operator-y', workflow: 'manual' });
  });

  test('a malformed archive logs an actionable warning naming the file', async () => {
    const corruptFile = path.join(intentsDir, 'corrupt.json');
    fs.writeFileSync(corruptFile, '{"id":"corrupt","schemaVersion":1,"met');

    await migrateIntentSchemaV2(dir);

    assert.ok(warnCalls.length >= 1, 'expected at least one console.warn call');
    const joined = warnCalls.map((args) => args.join(' ')).join('\n');
    assert.match(joined, /corrupt\.json/);
  });

  test('non-JSON files in the intents directory are ignored', async () => {
    fs.writeFileSync(path.join(intentsDir, 'README.md'), '# not an intent');
    await assert.doesNotReject(() => migrateIntentSchemaV2(dir));
  });
});

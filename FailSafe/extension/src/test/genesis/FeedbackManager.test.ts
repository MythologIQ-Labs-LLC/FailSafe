// Functional tests for FeedbackManager (FX462 + FX425).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { FeedbackManager, type FeedbackEntry } from '../../genesis/FeedbackManager';

function makeContext(globalDir: string): vscode.ExtensionContext {
  return {
    globalStorageUri: vscode.Uri.file(globalDir),
    extensionUri: vscode.Uri.file(globalDir),
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

function makeEntry(overrides: Partial<FeedbackEntry> = {}): FeedbackEntry {
  return {
    id: overrides.id ?? `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    type: overrides.type ?? 'bug_report',
    category: overrides.category ?? 'general',
    severity: overrides.severity ?? 'medium',
    title: overrides.title ?? 'Test feedback',
    description: overrides.description ?? 'Description text',
    environment: overrides.environment ?? {
      os: 'win32', vscodeVersion: '1.95', extensionVersion: '5.1.0',
    },
    metadata: overrides.metadata ?? {},
  } as FeedbackEntry;
}

suite('FeedbackManager (FX462 + FX425)', () => {
  let dir: string;
  let mgr: FeedbackManager;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-'));
    mgr = new FeedbackManager(makeContext(dir));
    // FeedbackManager uses workspaceFolders[0]/.failsafe/feedback when in vscode-test;
    // clear that dir at start of each test to prevent cross-test pollution.
    const fbDir = (mgr as any).feedbackDir as string;
    if (fs.existsSync(fbDir)) {
      for (const f of fs.readdirSync(fbDir)) {
        try { fs.unlinkSync(path.join(fbDir, f)); } catch { /* ignore */ }
      }
    }
  });
  teardown(() => {
    const fbDir = (mgr as any).feedbackDir as string;
    if (fs.existsSync(fbDir)) {
      for (const f of fs.readdirSync(fbDir)) {
        try { fs.unlinkSync(path.join(fbDir, f)); } catch { /* ignore */ }
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('FX462 constructor — creates feedback directory under globalStorage when no workspace', () => {
    // FeedbackManager prefers workspaceFolders[0]; if vscode-test has a workspace, it falls there.
    // Otherwise globalStorageUri/feedback. Either way, the dir should exist.
    const fbDir = (mgr as any).feedbackDir as string;
    assert.ok(fs.existsSync(fbDir), `feedback dir should exist: ${fbDir}`);
  });

  test('FX462 saveFeedback — writes GUID-stamped JSON file', async () => {
    const entry = makeEntry({ id: 'test-id-001' });
    const filepath = await mgr.saveFeedback(entry);
    assert.ok(fs.existsSync(filepath));
    assert.match(filepath, /test-id-001\.json$/);
    const loaded = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    assert.equal(loaded.id, 'test-id-001');
  });

  test('FX425 loadAllFeedback — empty directory returns empty array', async () => {
    const all = await mgr.loadAllFeedback();
    assert.deepEqual(all, []);
  });

  test('FX425 loadAllFeedback — returns saved entries sorted DESC by timestamp', async () => {
    await mgr.saveFeedback(makeEntry({ id: 'old', timestamp: '2026-01-01T00:00:00Z' }));
    await mgr.saveFeedback(makeEntry({ id: 'new', timestamp: '2026-05-01T00:00:00Z' }));
    await mgr.saveFeedback(makeEntry({ id: 'mid', timestamp: '2026-03-01T00:00:00Z' }));
    const all = await mgr.loadAllFeedback();
    assert.deepEqual(all.map(e => e.id), ['new', 'mid', 'old']);
  });

  test('FX425 loadAllFeedback — non-JSON files are silently skipped', async () => {
    const fbDir = (mgr as any).feedbackDir as string;
    fs.writeFileSync(path.join(fbDir, 'not-feedback.txt'), 'ignore me');
    fs.writeFileSync(path.join(fbDir, 'malformed.json'), '{not-json');
    await mgr.saveFeedback(makeEntry({ id: 'valid' }));
    const all = await mgr.loadAllFeedback();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'valid');
  });

  test('FX462 getFeedbackSummary — totals + byType + bySeverity breakdowns', async () => {
    await mgr.saveFeedback(makeEntry({ id: '1', type: 'bug_report', severity: 'high' }));
    await mgr.saveFeedback(makeEntry({ id: '2', type: 'feature_request', severity: 'medium' }));
    await mgr.saveFeedback(makeEntry({ id: '3', type: 'bug_report', severity: 'critical' }));
    const summary = await mgr.getFeedbackSummary();
    assert.equal(summary.totalFeedback, 3);
    assert.equal(summary.byType.bug_report, 2);
    assert.equal(summary.byType.feature_request, 1);
    assert.equal(summary.bySeverity.high, 1);
    assert.equal(summary.bySeverity.medium, 1);
    assert.equal(summary.bySeverity.critical, 1);
  });

  test('FX462 getFeedbackSummary — recentFeedback caps at 10 most recent', async () => {
    for (let i = 0; i < 15; i++) {
      await mgr.saveFeedback(makeEntry({
        id: `e${i}`,
        timestamp: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      }));
    }
    const summary = await mgr.getFeedbackSummary();
    assert.equal(summary.totalFeedback, 15);
    assert.equal(summary.recentFeedback.length, 10);
    // Most recent first
    assert.equal(summary.recentFeedback[0].id, 'e14');
  });

  test('FX462 deleteFeedback — known id removes file + returns true', async () => {
    const entry = await mgr.saveFeedback(makeEntry({ id: 'doomed' }));
    const fbDir = (mgr as any).feedbackDir as string;
    assert.ok(fs.existsSync(path.join(fbDir, 'doomed.json')));
    const ok = await mgr.deleteFeedback('doomed');
    assert.equal(ok, true);
    assert.equal(fs.existsSync(path.join(fbDir, 'doomed.json')), false);
  });

  test('FX462 deleteFeedback — unknown id returns false (no throw)', async () => {
    const ok = await mgr.deleteFeedback('does-not-exist');
    assert.equal(ok, false);
  });

  test('FX462 exportFeedback — writes single JSON file with summary + entries', async () => {
    await mgr.saveFeedback(makeEntry({ id: 'a' }));
    await mgr.saveFeedback(makeEntry({ id: 'b' }));
    const outputPath = path.join(dir, 'export.json');
    await mgr.exportFeedback(outputPath);
    assert.ok(fs.existsSync(outputPath));
    const exported = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(exported.summary.totalFeedback, 2);
    assert.equal(exported.feedback.length, 2);
    assert.match(exported.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

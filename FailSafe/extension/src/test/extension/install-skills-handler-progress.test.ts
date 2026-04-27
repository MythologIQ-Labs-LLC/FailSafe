import { strict as assert } from 'assert';
import {
  createInstallSkillsHandler,
  type InstallStep,
  type InstallReport,
} from '../../extension/installSkillsHandler';
import type {
  QorLogicSkillIngestor,
  QorLogicIngestOptions,
  QorLogicIngestResult,
} from '../../qorlogic/QorLogicSkillIngestor';

class FakeIngestor {
  public lastOptions: QorLogicIngestOptions | null = null;
  public stub: QorLogicIngestResult = {
    ok: true, installedHosts: ['claude', 'codex'], skillCount: 17, failures: [],
  };
  async ingest(options: QorLogicIngestOptions): Promise<QorLogicIngestResult> {
    this.lastOptions = options;
    return this.stub;
  }
}

function asIngestor(fake: FakeIngestor): QorLogicSkillIngestor {
  return fake as unknown as QorLogicSkillIngestor;
}

suite('createInstallSkillsHandler: progress + report', () => {
  test('emits at least one progress step with status running and one with status success/error', async () => {
    const fake = new FakeIngestor();
    const steps: InstallStep[] = [];
    const handler = createInstallSkillsHandler(asIngestor(fake), {
      onProgress: (s) => steps.push(s),
    });

    await handler();

    assert.ok(steps.length > 0, 'at least one progress step should fire');
    assert.ok(steps.some((s) => s.status === 'running'));
    assert.ok(steps.some((s) => s.status === 'success' || s.status === 'error'));
  });

  test('returns a structured report on success', async () => {
    const fake = new FakeIngestor();
    fake.stub = { ok: true, installedHosts: ['claude', 'codex'], skillCount: 34, failures: [] };
    const handler = createInstallSkillsHandler(asIngestor(fake));

    const report = await handler();

    assert.ok((report as InstallReport).ok);
    assert.equal((report as InstallReport).totalInstalled, 34);
    assert.deepEqual((report as InstallReport).failures, []);
    assert.ok(Array.isArray((report as InstallReport).steps));
    assert.ok((report as InstallReport).steps.length > 0);
  });

  test('aggregates per-host failures into the report', async () => {
    const fake = new FakeIngestor();
    fake.stub = {
      ok: false, installedHosts: ['codex'], skillCount: 17,
      failures: [{ host: 'claude', error: 'pip-failed' }],
    };
    const handler = createInstallSkillsHandler(asIngestor(fake));

    const report = await handler() as InstallReport;

    assert.equal(report.ok, false);
    assert.equal(report.failures.length, 1);
    assert.equal(report.failures[0].host, 'claude');
    assert.match(report.failures[0].error, /pip-failed/);
    // Sibling success preserved.
    assert.equal(report.totalInstalled, 17);
  });

  test('calls onComplete exactly once after success', async () => {
    const fake = new FakeIngestor();
    const completes: InstallReport[] = [];
    const handler = createInstallSkillsHandler(asIngestor(fake), {
      onComplete: (report) => completes.push(report),
    });

    await handler();

    assert.equal(completes.length, 1);
    assert.equal(completes[0].ok, true);
  });

  test('preserves the legacy-shape return for back-compat with the Console scaffold callback', async () => {
    const fake = new FakeIngestor();
    fake.stub = { ok: true, installedHosts: ['claude'], skillCount: 5, failures: [] };
    const handler = createInstallSkillsHandler(asIngestor(fake));

    const result = await handler() as InstallReport;
    // The InstallReport extends the prior shape: callers that expect
    // `scaffolded` and `skipped` should still find them.
    assert.equal((result as unknown as { scaffolded: number }).scaffolded, 5);
    assert.equal((result as unknown as { skipped: number }).skipped, 0);
  });
});

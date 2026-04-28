import { strict as assert } from 'assert';
import { createInstallSkillsHandler } from '../../extension/installSkillsHandler';
import type {
  QorLogicSkillIngestor,
  QorLogicIngestOptions,
  QorLogicIngestResult,
} from '../../qorlogic/QorLogicSkillIngestor';

class FakeIngestor {
  public lastOptions: QorLogicIngestOptions | null = null;
  public stub: QorLogicIngestResult = {
    ok: true, installedHosts: ['claude', 'codex'], skillCount: 0, failures: [], hostStatuses: [],
  };
  async ingest(options: QorLogicIngestOptions): Promise<QorLogicIngestResult> {
    this.lastOptions = options;
    return this.stub;
  }
}

function asIngestor(fake: FakeIngestor): QorLogicSkillIngestor {
  return fake as unknown as QorLogicSkillIngestor;
}

suite('createInstallSkillsHandler', () => {
  test('invokes ingestor with default hosts [claude, codex] and scope=repo', async () => {
    const fake = new FakeIngestor();
    const handler = createInstallSkillsHandler(asIngestor(fake));

    await handler();

    assert.deepEqual(fake.lastOptions, { hosts: ['claude', 'codex'], scope: 'repo' });
  });

  test('returns scaffolded equal to skillCount when ingest succeeds', async () => {
    const fake = new FakeIngestor();
    fake.stub = { ok: true, installedHosts: ['claude', 'codex'], skillCount: 17, failures: [], hostStatuses: [] };
    const handler = createInstallSkillsHandler(asIngestor(fake));

    const result = await handler();

    assert.equal(result.scaffolded, 17);
    assert.equal(result.skipped, 0);
    assert.equal(result.error, undefined);
  });

  test('joins per-host failures into a single error string', async () => {
    const fake = new FakeIngestor();
    fake.stub = {
      ok: false, installedHosts: ['codex'], skillCount: 5,
      failures: [
        { host: 'claude', error: 'pip-failed' },
        { host: 'gemini', error: 'timeout' },
      ],
      hostStatuses: [],
    };
    const handler = createInstallSkillsHandler(asIngestor(fake));

    const result = await handler();

    assert.equal(result.scaffolded, 5);
    assert.match(result.error ?? '', /claude: pip-failed/);
    assert.match(result.error ?? '', /gemini: timeout/);
  });
});

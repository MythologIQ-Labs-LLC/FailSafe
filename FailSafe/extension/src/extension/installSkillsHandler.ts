import type { QorLogicSkillIngestor, QorLogicHost } from '../qorlogic/QorLogicSkillIngestor';

export interface InstallSkillsResult {
  scaffolded: number;
  skipped: number;
  error?: string;
}

const DEFAULT_HOSTS: QorLogicHost[] = ['claude', 'codex'];

export function createInstallSkillsHandler(
  ingestor: QorLogicSkillIngestor,
): () => Promise<InstallSkillsResult> {
  return async () => {
    const result = await ingestor.ingest({ hosts: DEFAULT_HOSTS, scope: 'repo' });
    return {
      scaffolded: result.skillCount,
      skipped: 0,
      error: collectError(result.failures),
    };
  };
}

function collectError(
  failures: ReadonlyArray<{ host: string; error: string }>,
): string | undefined {
  if (failures.length === 0) return undefined;
  return failures.map((f) => `${f.host}: ${f.error}`).join('; ');
}

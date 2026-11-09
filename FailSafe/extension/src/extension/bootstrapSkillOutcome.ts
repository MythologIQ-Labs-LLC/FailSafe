/** #463: make bootstrap decisions depend on verified host outcomes, not filenames. */
import type { QorLogicIngestResult } from '../qorlogic/QorLogicSkillIngestor';
import type { BootstrapStep } from './bootstrapAssembleReport';
import { verifyHostInstallReceipt } from '../qorlogic/qorHostReceiptVerify';

const REQUIRED_HOSTS = ['claude', 'codex'] as const;

export function hasVerifiedBootstrapHosts(workspaceRoot: string): boolean {
  return REQUIRED_HOSTS.every((host) => verifyHostInstallReceipt(workspaceRoot, host).ok);
}

export function summarizeBootstrapIngestion(result: QorLogicIngestResult): BootstrapStep {
  const missing = REQUIRED_HOSTS.filter((host) => !result.installedHosts.includes(host));
  if (!result.ok || missing.length > 0) {
    return {
      name: 'skill-ingestion',
      status: 'failed',
      detail: [
        `Verified ${result.installedHosts.length}/2 requested hosts`,
        ...missing.map((host) => `${host}: not installed`),
        ...result.failures.map((f) => `${f.host}: ${f.error}`),
      ].join('; '),
    };
  }
  return { name: 'skill-ingestion', status: 'performed',
    detail: `${result.skillCount} skill(s); hosts: ${result.installedHosts.join(', ')}` };
}

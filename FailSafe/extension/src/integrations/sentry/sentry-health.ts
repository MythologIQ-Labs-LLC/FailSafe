/**
 * sentry-health — maps one Sentry import outcome to catalog health evidence
 * (#479). importSentryRisks returns ok even when risk writes failed, so failed
 * records and chunks are checked before ok counts as success.
 */

import type { HealthMapping } from '../catalog/integration-health';
import { writeFailed, type WriteCounts } from '../catalog/write-outcome';

export interface SentryHealthInput {
  ok: boolean;
  localOnly?: boolean;
  cancelled?: boolean;
  status?: number;
  failed: number;
  write?: Partial<WriteCounts>;
}

export function healthFromSentryImport(o: SentryHealthInput): HealthMapping {
  if (o.cancelled) return [];
  if (o.localOnly) return ['failing', 'refused'];
  if (o.ok) return writeFailed(o) ? ['failing', 'storage'] : ['contract-verified'];
  if (o.status === 401 || o.status === 403) return ['failing', 'auth'];
  if (o.status === 429) return ['failing', 'rate_limited'];
  if (o.status) return ['failing', 'http'];
  return ['failing', 'network'];
}

/** Re-exported so a command handler needs one import for the mapping and the recorder. */
export { recordIntegrationHealth } from '../catalog/integration-health';

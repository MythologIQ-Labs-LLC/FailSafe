/**
 * sarif-health — maps one SARIF file import to catalog health evidence (#479).
 * Write failures win over parse warnings; a parse warning means the file did
 * not fully match SARIF 2.1.0; a valid file with no results is still parsed.
 */

import type { HealthMapping } from '../catalog/integration-health';
import { writeFailed, type WriteCounts } from '../catalog/write-outcome';

export type SarifHealthInput =
  | { unreadable: true }
  | { findings: number; failed: number; errors: readonly string[]; write?: Partial<WriteCounts> };

export function healthFromSarifImport(o: SarifHealthInput): HealthMapping {
  if ('unreadable' in o) return ['failing', 'contract'];
  if (writeFailed(o)) return ['failing', 'storage'];
  if (o.errors.length > 0) return ['failing', 'contract'];
  return ['contract-verified'];
}

/** Re-exported so a command handler needs one import for the mapping and the recorder. */
export { recordIntegrationHealth } from '../catalog/integration-health';

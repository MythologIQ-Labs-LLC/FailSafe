/**
 * agent-observe-health — maps the MCP-policy audit and the OpenHands import to
 * catalog health evidence (#479). Both read files, so contract-verified reads
 * as "Last import parsed" on their cards.
 */

import type { HealthMapping } from '../catalog/integration-health';
import { writeFailed, type WriteCounts } from '../catalog/write-outcome';

export function healthFromMcpScan(o: { scanned: number; failed: number; write?: Partial<WriteCounts> }): HealthMapping {
  if (writeFailed(o)) return ['failing', 'storage'];
  return o.scanned > 0 ? ['contract-verified'] : [];
}

export type OpenHandsImportHealth =
  | { kind: 'imported'; versionDeclaredByExport: boolean }
  | { kind: 'unsupported-version' }
  | { kind: 'unreadable' }
  | { kind: 'storage' }
  | { kind: 'dismissed' };

/** Only a version declared in the export file itself counts toward contract-verified. */
export function healthFromOpenHandsImport(o: OpenHandsImportHealth): HealthMapping {
  switch (o.kind) {
    case 'imported': return o.versionDeclaredByExport ? ['contract-verified'] : ['connected'];
    case 'unsupported-version': return ['failing', 'unsupported_version'];
    case 'unreadable': return ['failing', 'contract'];
    case 'storage': return ['failing', 'storage'];
    default: return [];
  }
}

/** Re-exported so a command handler needs one import for the mapping and the recorder. */
export { recordIntegrationHealth } from '../catalog/integration-health';

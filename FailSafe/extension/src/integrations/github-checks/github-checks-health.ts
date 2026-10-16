/**
 * github-checks-health — maps one manual-advisory publish to catalog health
 * evidence (#479). A created check run (with its id) is the only contract
 * success; FailSafe's own refusals are `refused` or `config`, never network.
 */

import type { HealthMapping } from '../catalog/integration-health';

/** Exact error texts publishCheckRunPayload returns for its own refusals. */
export const NOT_PUBLISHABLE_ERROR = 'Check run refused: this name and conclusion are not publishable by FailSafe.';
export const INVALID_API_BASE_ERROR = 'invalid GitHub API base URL';
export const UNCONFIRMED_RESPONSE_ERROR = 'unconfirmed GitHub response';
const CONFIG_ERRORS = [INVALID_API_BASE_ERROR, 'check run target host mismatch', 'invalid check run target repo'];

export function healthFromGitHubPublish(r: {
  ok: boolean; localOnly?: boolean; checkRunId?: number; status?: number; error?: string;
}): HealthMapping {
  if (r.localOnly) return ['failing', 'refused'];
  if (r.ok) return r.checkRunId ? ['contract-verified'] : ['connected'];
  if (r.error && CONFIG_ERRORS.includes(r.error)) return ['failing', 'config'];
  if (r.error === NOT_PUBLISHABLE_ERROR || /^check run refused/i.test(r.error ?? '')) return ['failing', 'refused'];
  if (r.error === UNCONFIRMED_RESPONSE_ERROR) return ['failing', 'contract'];
  if (r.status === 401 || r.status === 403) return ['failing', 'auth'];
  if (r.status) return ['failing', 'http'];
  return ['failing', 'network'];
}

/** Re-exported so a command handler needs one import for the mapping and the recorder. */
export { recordIntegrationHealth } from '../catalog/integration-health';

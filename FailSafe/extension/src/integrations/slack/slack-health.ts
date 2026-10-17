/**
 * slack-health — maps one Slack webhook delivery to catalog health evidence
 * (#479). A webhook has no response contract, so a 2xx is `connected`, never
 * contract-verified. A skipped send (no webhook configured) records nothing.
 */

import type { HealthMapping } from '../catalog/integration-health';
import type { SlackSendResult } from './slack-sender';

export function healthFromSlackDelivery(r: SlackSendResult): HealthMapping {
  if (r.skipped) return [];
  if (r.ok) return ['connected'];
  if (r.status === 429) return ['failing', 'rate_limited'];
  if (r.status) return ['failing', 'http'];
  return ['failing', 'network'];
}

/**
 * teams-health — maps one Teams webhook delivery to catalog health evidence
 * (#479). A 2xx is `connected` (no response contract). A message FailSafe
 * refused to send because it exceeds the Workflows size budget is `refused`.
 */

import type { HealthMapping } from '../catalog/integration-health';
import { TEAMS_PAYLOAD_TOO_LARGE, type TeamsSendResult } from './teams-sender';

export function healthFromTeamsDelivery(r: TeamsSendResult): HealthMapping {
  if (r.skipped) return [];
  if (r.ok) return ['connected'];
  if (r.status === 429 || r.throttled) return ['failing', 'rate_limited'];
  if (r.status) return ['failing', 'http'];
  if (r.error === TEAMS_PAYLOAD_TOO_LARGE) return ['failing', 'refused'];
  return ['failing', 'network'];
}

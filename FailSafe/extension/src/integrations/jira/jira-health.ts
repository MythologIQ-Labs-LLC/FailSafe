/**
 * jira-health — maps one Jira issue fetch to catalog health evidence (#479).
 * A parsed issue is the only success: an HTTP 200 whose body is not an issue
 * is a contract failure. A fetch that never sent a request records nothing.
 */

import type { FailureCategory, HealthMapping } from '../catalog/integration-health';

export function healthFromJiraFetch(r: { ok: boolean; failure?: FailureCategory }): HealthMapping {
  if (r.ok) return ['contract-verified'];
  return r.failure ? ['failing', r.failure] : [];
}

/**
 * agent-cli-health — maps one governed Continue/Aider run to catalog health
 * evidence (#479). A started process is `connected`; a missing binary is
 * `not_installed`; a run refused before spawning (BLOCKED_PRE_EXECUTION) is a
 * policy decision that says nothing about the tool, so it records nothing.
 */

import type { HealthMapping } from '../catalog/integration-health';

export function healthFromAgentRun(out: { available: boolean; spawned: boolean }): HealthMapping {
  if (!out.available) return ['failing', 'not_installed'];
  return out.spawned ? ['connected'] : [];
}

/** Re-exported so a command handler needs one import for the mapping and the recorder. */
export { recordIntegrationHealth } from '../catalog/integration-health';

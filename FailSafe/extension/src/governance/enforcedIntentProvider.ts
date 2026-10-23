/**
 * B340 (plan-b340-enforce-approval LD4): the one place the extension host builds its
 * EnforcementEngine. The engine reads the active intent through enforcedIntentProvider, whose
 * `getActiveIntent` is IntentService.getEnforcedActiveIntent: in enforce mode the intent's status
 * is the effective status (sealed decisions, verified ledger), never the agent-writable file's.
 * bootstrapGovernance and the B340 suites both use createEnforcementEngine, so a test of the
 * factory is a test of production wiring. The ACP enforce proxy builds its own engine over a
 * file provider and is not covered (B373).
 */

import type { IConfigProvider } from '../core/interfaces/IConfigProvider';
import type { INotificationService } from '../core/interfaces/INotificationService';
import { EnforcementEngine, type CommandExecutor, type IntentProvider } from './EnforcementEngine';
import type { IntentService } from './IntentService';

export function enforcedIntentProvider(intentService: IntentService): IntentProvider {
  return {
    getActiveIntent: () => intentService.getEnforcedActiveIntent(),
    createIntent: (params) => intentService.createIntent(params),
  };
}

export function createEnforcementEngine(
  intentService: IntentService,
  workspaceRoot: string,
  configProvider: IConfigProvider,
  notifications: INotificationService,
  executeCommand?: CommandExecutor,
): EnforcementEngine {
  const engine = new EnforcementEngine(enforcedIntentProvider(intentService), workspaceRoot, configProvider, notifications, executeCommand);
  // B66: the governance mode getter (planId enforcement; the effective status is computed only in enforce mode).
  intentService.setGovernanceModeGetter(() => engine.getGovernanceMode());
  return engine;
}

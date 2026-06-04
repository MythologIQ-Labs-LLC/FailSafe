// Standalone-process governance backing factory (GH #172 Part 2). Builds the
// AcpGovernanceBacking the proxy injects into runAcpProxy from file-backed,
// vscode-free providers — so the proxy enforces using the SAME EnforcementEngine
// the extension uses (no duplicated enforcement logic; the engine is reused
// verbatim through EngineBackedInterceptor).
//
//   runtime-mode.json ─┐
//   active_intent.json ┼─► EnforcementEngine.evaluateAction ─► EngineBackedInterceptor
//   (axioms/scope) ────┘                                          (IGovernanceInterceptor)
//
// `enforcing` is true ONLY in enforce mode; observe/assist keep "don't block" and
// the governor records enforcing=false (B3), so a non-enforcing grant is never
// presented as enforced.

import { EnforcementEngine } from '../../../../governance/EnforcementEngine';
import { EngineBackedInterceptor } from '../../../../governance/interceptor';
import type { AcpGovernanceBacking } from '../AcpProxyMain';
import { FileConfigProvider } from './FileConfigProvider';
import { FileIntentProvider } from './FileIntentProvider';
import { NoopNotificationService } from './NoopNotificationService';
import { FileLedgerSink } from './FileLedgerSink';

const ISSUED_BY = 'failsafe-acp-proxy';

/** Compose the proxy's governance backing for a workspace. Pure construction —
 *  no I/O until a decision is evaluated (providers read on demand). */
export function createWorkspaceAcpBacking(workspaceRoot: string): AcpGovernanceBacking {
  const configProvider = new FileConfigProvider(workspaceRoot);
  const engine = new EnforcementEngine(
    new FileIntentProvider(workspaceRoot),
    workspaceRoot,
    configProvider,
    new NoopNotificationService(),
  );
  const governanceInterceptor = new EngineBackedInterceptor(engine, ISSUED_BY);
  const ledger = new FileLedgerSink(workspaceRoot);

  return {
    governanceInterceptor,
    effectiveMode: () => {
      const { mode } = engine.getGovernanceModeState();
      return { mode, enforcing: mode === 'enforce' };
    },
    ledger,
  };
}

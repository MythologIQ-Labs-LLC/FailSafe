// File-backed IConfigProvider for the ACP proxy process (GH #172 Part 2). The
// EnforcementEngine reads exactly ONE thing from its config provider:
// `getConfig().governance.mode` (in getGovernanceModeState). This provider exists
// solely to convey the mirrored governance mode (see runtimeMode.ts) to the engine
// inside the standalone proxy process; the remaining FailSafeConfig fields are
// benign defaults the enforce path never reads. Path getters are derived from the
// workspace root so any incidental caller still gets correct locations.

import * as path from 'path';
import type { IConfigProvider } from '../../../../core/interfaces/IConfigProvider';
import type { FailSafeConfig } from '../../../../shared/types/config';
import { readRuntimeMode } from './runtimeMode';

export class FileConfigProvider implements IConfigProvider {
  constructor(private readonly workspaceRoot: string) {}

  getConfig(): FailSafeConfig {
    return {
      genesis: { livingGraph: false, cortexOmnibar: false, theme: 'starry-night' },
      sentinel: { enabled: false, mode: 'heuristic', localModel: '', ollamaEndpoint: '' },
      qorelogic: { ledgerPath: this.getLedgerPath(), strictMode: false, l3SLA: 0 },
      feedback: { outputDir: this.getFeedbackDir() },
      architecture: { contributors: 1, maxComplexity: 0 },
      // The one field the enforce path actually consults:
      governance: { mode: readRuntimeMode(this.workspaceRoot), overseerId: 'failsafe-acp-proxy' },
    };
  }

  getWorkspaceRoot(): string | undefined {
    return this.workspaceRoot;
  }

  getFailSafeDir(): string {
    return path.join(this.workspaceRoot, '.failsafe');
  }

  getLedgerPath(): string {
    return path.join(this.getFailSafeDir(), 'ledger');
  }

  getFeedbackDir(): string {
    return path.join(this.getFailSafeDir(), 'feedback');
  }

  getSentinelConfigPath(): string {
    return path.join(this.getFailSafeDir(), 'config', 'sentinel.yaml');
  }

  /** The proxy reads the mode per-decision (via getConfig); there is no live
   *  change event in this process. Returns a no-op unsubscribe. */
  onConfigChange(_callback: (config: FailSafeConfig) => void): () => void {
    return () => { /* no-op: proxy re-reads the mirror on each decision */ };
  }
}

// #538 lane A: a VerdictArbiter over the real engine stack (only the trust and
// ledger leaves are faked), as VerdictArbiter.artifact-hash.test.ts builds it,
// with the LLM options passed through the constructor's argument list so the
// rows compile against main (four parameters) and after the fix (a fifth).

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VerdictArbiter } from '../../sentinel/VerdictArbiter';
import { VerdictEngine } from '../../sentinel/engines/VerdictEngine';
import { HeuristicEngine } from '../../sentinel/engines/HeuristicEngine';
import { ExistenceEngine } from '../../sentinel/engines/ExistenceEngine';
import { PolicyEngine } from '../../qorelogic/policies/PolicyEngine';
import { PatternLoader } from '../../sentinel/PatternLoader';
import type { ConfigManager } from '../../shared/ConfigManager';
import type { TrustEngine } from '../../qorelogic/trust/TrustEngine';
import type { LedgerManager } from '../../qorelogic/ledger/LedgerManager';
import type { IConfigProvider } from '../../core/interfaces/IConfigProvider';
import type { SentinelEvent } from '../../shared/types';

const trust = {
  getTrustScore: () => ({ score: 0.85 }),
  updateTrust: async () => undefined,
  quarantineAgent: async () => undefined,
} as unknown as TrustEngine;

const ledger = { appendEntry: async () => ({ id: 1 }) } as unknown as LedgerManager;

export function makeArbiter(config: IConfigProvider, llm?: Record<string, unknown>): VerdictArbiter {
  const configManager = config as unknown as ConfigManager;
  const policyEngine = new PolicyEngine(config);
  const heuristicEngine = new HeuristicEngine(policyEngine, new PatternLoader());
  const existenceEngine = new ExistenceEngine(configManager);
  const verdictEngine = new VerdictEngine(trust, policyEngine, ledger, undefined);
  const args: unknown[] = [configManager, heuristicEngine, verdictEngine, existenceEngine];
  if (llm !== undefined) args.push(llm);
  return Reflect.construct(VerdictArbiter, args) as VerdictArbiter;
}

/** A file-modified event for a temp file; the caller removes `dir`. */
export function fileEvent(content: string): { event: SentinelEvent; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-llm-egress-'));
  const file = path.join(dir, 'flagged.ts');
  fs.writeFileSync(file, content);
  return {
    dir,
    event: {
      id: 'evt-llm-egress', timestamp: new Date().toISOString(), priority: 'normal',
      source: 'file_watcher', type: 'FILE_MODIFIED', payload: { path: file },
    } as SentinelEvent,
  };
}

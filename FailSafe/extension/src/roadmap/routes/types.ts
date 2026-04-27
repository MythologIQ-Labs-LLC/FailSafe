/**
 * Dependency injection interface for API route modules extracted
 * from ConsoleServer. Each route module receives this bag of
 * dependencies instead of referencing `this.*` on the server class.
 */
export interface ApiRouteDeps {
  rejectIfRemote: (req: any, res: any) => boolean;
  broadcast: (data: Record<string, unknown>) => void;
  brainstormService: any;
  audioVaultService: any;
  getRecentCheckpoints: (limit: number) => any[];
  getCheckpointById: (id: string) => any;
  verifyCheckpointChain: () => boolean;
  revertService: any;
  sentinelDaemon: any;
  planManager: any;
  qorelogicManager: any;
  recordCheckpoint: (input: any) => void;
  inferPhaseKeyFromPlan: (plan: any) => string;
  chainValidAt: string | null;
  cachedChainValid: boolean;
  setCachedChainValid: (valid: boolean, at: string) => void;
  getTransparencyEvents: (limit: number) => any[];
  getRiskRegister: () => any[];
  writeRiskRegister: (risks: any[]) => void;
  scaffoldSkills?: () => Promise<{ scaffolded: number; skipped: number; error?: string }>;
  // Agent API route delegates (Phase 2: B142/B143/B144)
  getTimelineEntries: (filter?: any) => any[];
  getHealthMetrics: () => any | null;
  getGenomePatterns: () => Promise<any[]>;
  getGenomeAllPatterns: () => Promise<any[]>; // B183: All patterns regardless of status
  getGenomeUnresolved: (limit: number) => Promise<any[]>;
  getActiveRuns: () => any[];
  getCompletedRuns: () => any[];
  getRun: (runId: string) => any | undefined;
  loadRun: (runId: string) => any | null;
  getRunSteps: (runId: string) => any[];
}

import type { EventBus } from '../../shared/EventBus';
import type { ModuleResult, RunReport } from './types';

export interface SubstrateModule {
  readonly name: string;
  run(): Promise<ModuleResult>;
}

/**
 * SubstrateRunner — orchestrates a sequence of SubstrateModule instances.
 *
 * Contract:
 *   - Executes each module sequentially; per-module throws are captured as
 *     `{ok: false, error: {kind:'other', ...}}` so the run never throws.
 *   - Aggregates totalFindings across all modules.
 *   - Emits ONE 'substrate.run.complete' event on the supplied EventBus
 *     using the 2-positional-arg form `emit(eventType, payload)` (matches
 *     EventBus.emit's signature at src/shared/EventBus.ts:66).
 *   - Optional event bus: no bus → no emit, no throw.
 */
export class SubstrateRunner {
  constructor(
    private readonly modules: SubstrateModule[],
    private readonly eventBus?: EventBus,
  ) {}

  async runAll(): Promise<RunReport> {
    const startedAt = new Date().toISOString();
    const runStart = Date.now();
    const moduleResults: ModuleResult[] = [];
    for (const m of this.modules) {
      try {
        moduleResults.push(await m.run());
      } catch (e) {
        moduleResults.push({
          module: m.name,
          ok: false,
          findings: [],
          summary: { count: 0, bySeverity: { info: 0, warn: 0, high: 0 } },
          durationMs: 0,
          error: { kind: 'other', message: e instanceof Error ? e.message : String(e) },
        });
      }
    }
    const totalFindings = moduleResults.reduce((acc, r) => acc + r.findings.length, 0);
    const runDurationMs = Date.now() - runStart;
    const report: RunReport = { moduleResults, totalFindings, runDurationMs, startedAt };

    if (this.eventBus) {
      this.eventBus.emit('substrate.run.complete', {
        totalFindings,
        runDurationMs,
        startedAt,
        modules: moduleResults.map((r) => ({
          name: r.module,
          count: r.findings.length,
          ok: r.ok,
        })),
      });
    }

    return report;
  }
}

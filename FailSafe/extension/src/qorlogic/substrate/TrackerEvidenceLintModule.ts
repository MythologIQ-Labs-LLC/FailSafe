import type { ModuleResult, SubstrateFinding } from './types';
import { TrackerGenerator } from '../../roadmap/tracker/TrackerGenerator';
import type { LintFinding, TrackerModel } from '../../roadmap/tracker/tracker-core';

/**
 * TrackerEvidenceLintModule — closes DEVELOPMENT_TRACKER_STANDARD §7 enforcement
 * as a substrate module (Tracker v1.1). It regenerates the Development Tracker
 * model and surfaces its evidence-lint findings as SubstrateFindings, so an
 * under-evidenced tracker is operator-visible on the manual substrate run AND on
 * every /qor-substantiate seal (via the B-SUBSTRATE-3 seal auto-hook).
 *
 * WARN-only posture (like every substrate module): findings surface but never
 * block. The generator's own fail-closed behavior still applies at generation
 * time / CI; this module is the *visibility* layer at the governance lifecycle.
 *
 * The model generator is injectable so the finding-mapping is deterministically
 * testable without real artifacts (B-BIC-24 lesson).
 */
export class TrackerEvidenceLintModule {
  readonly name = 'tracker_evidence_lint';

  constructor(
    private readonly workspaceRoot: string,
    private readonly generate?: () => Promise<{ model: TrackerModel; lint: LintFinding[] }>,
  ) {}

  async run(): Promise<ModuleResult> {
    const startedAt = Date.now();
    const gen = this.generate
      ?? (() => new TrackerGenerator({ workspaceRoot: this.workspaceRoot, now: () => new Date() }).generate());

    let lint: LintFinding[];
    try {
      ({ lint } = await gen());
    } catch (e) {
      return {
        module: this.name,
        ok: false,
        findings: [],
        summary: { count: 0, bySeverity: { info: 0, warn: 0, high: 0 } },
        durationMs: Date.now() - startedAt,
        error: { kind: 'other', message: e instanceof Error ? e.message : String(e) },
      };
    }

    // ABORT-class lint findings (uncited claims, preference-driven decisions,
    // uncomputed %, dangling evidence) are the high-severity integrity signals;
    // WARN-class lint findings map to warn.
    const findings: SubstrateFinding[] = lint.map((f) => ({
      module: this.name,
      severity: f.severity === 'abort' ? 'high' : 'warn',
      rule: f.rule,
      message: f.message,
      location: { file: 'docs/design/DEVELOPMENT_TRACKER_STANDARD.md' },
    }));

    const high = findings.filter((f) => f.severity === 'high').length;
    const warn = findings.filter((f) => f.severity === 'warn').length;
    return {
      module: this.name,
      ok: true, // WARN-only: surfaces, never blocks
      findings,
      summary: {
        count: findings.length,
        bySeverity: { info: 0, warn, high },
        note: findings.length === 0
          ? 'Development Tracker model is fully evidence-cited (0 lint findings)'
          : `${high} integrity (ABORT-class) + ${warn} WARN tracker-evidence finding(s)`,
      },
      durationMs: Date.now() - startedAt,
    };
  }
}

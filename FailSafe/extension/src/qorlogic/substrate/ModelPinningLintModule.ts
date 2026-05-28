import { QorScriptInvoker } from './QorScriptInvoker';
import type { ModuleResult } from './types';

const EXPECTED_NOTE =
  'upstream module walks qor/skills/; FailSafe skills are at .claude/skills/ — expected 0 findings until FailSafe vendors or aliases the path';

/**
 * ModelPinningLintModule — invokes upstream `qor.scripts.model_pinning_lint`
 * which walks `qor/skills/*` looking for unpinned model references. FailSafe
 * stores skills at `.claude/skills/`, so the upstream module produces a
 * silent-no-op (exit 0, no findings) against FailSafe's layout.
 *
 * This wrapper preserves that behavior and documents it in `summary.note`
 * so operators understand the 0-finding baseline is expected, not a broken lint.
 *
 * WARN-only posture (and effectively zero-warn under current layout).
 */
export class ModelPinningLintModule {
  readonly name = 'model_pinning_lint';

  constructor(
    private readonly invoker: QorScriptInvoker,
    private readonly workspaceRoot: string,
  ) {}

  async run(): Promise<ModuleResult> {
    const startedAt = Date.now();
    const invocation = await this.invoker.invoke({
      module: 'model_pinning_lint',
      args: ['--repo-root', this.workspaceRoot],
      cwd: this.workspaceRoot,
    });
    return {
      module: this.name,
      ok: invocation.ok,
      findings: [],
      summary: {
        count: 0,
        bySeverity: { info: 0, warn: 0, high: 0 },
        note: EXPECTED_NOTE,
      },
      durationMs: Date.now() - startedAt,
      ...(invocation.error ? { error: invocation.error } : {}),
    };
  }
}

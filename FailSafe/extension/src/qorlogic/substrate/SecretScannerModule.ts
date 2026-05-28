import * as fs from 'fs';
import * as path from 'path';
import { QorScriptInvoker } from './QorScriptInvoker';
import type { ModuleResult, SubstrateFinding } from './types';

interface GitleaksRecord {
  RuleID?: string;
  Description?: string;
  File?: string;
  StartLine?: number;
  Match?: string;
  Secret?: string;
}

/**
 * SecretScannerModule — invokes `python -m qor.scripts.secret_scanner`
 * which shells gitleaks v8 and writes findings JSON to `dist/secrets.findings.json`.
 *
 * WARN-only posture: findings surface in the substrate run report; never block.
 */
export class SecretScannerModule {
  readonly name = 'secret_scanner';

  constructor(
    private readonly invoker: QorScriptInvoker,
    private readonly workspaceRoot: string,
  ) {}

  async run({ stagedOnly = true }: { stagedOnly?: boolean } = {}): Promise<ModuleResult> {
    const startedAt = Date.now();
    const outPath = path.join(this.workspaceRoot, 'dist', 'secrets.findings.json');
    const args: string[] = [];
    if (stagedOnly) args.push('--staged');
    args.push('--out', outPath);

    const invocation = await this.invoker.invoke({
      module: 'secret_scanner',
      args,
      cwd: this.workspaceRoot,
      timeoutMs: 90_000,
    });

    // Spawn/timeout/missing-module: propagate immediately, no findings expected.
    if (invocation.error && invocation.error.kind !== 'other') {
      return {
        module: this.name,
        ok: false,
        findings: [],
        summary: { count: 0, bySeverity: { info: 0, warn: 0, high: 0 } },
        durationMs: Date.now() - startedAt,
        error: invocation.error,
      };
    }

    // gitleaks v8 contract: exit 0 = no findings; exit 1 = findings present;
    // exit 2 = error. If outPath was not written (exit 0, no findings), bail
    // with a clean empty result.
    if (!fs.existsSync(outPath)) {
      return {
        module: this.name,
        ok: invocation.ok,
        findings: [],
        summary: { count: 0, bySeverity: { info: 0, warn: 0, high: 0 } },
        durationMs: Date.now() - startedAt,
        ...(invocation.error ? { error: invocation.error } : {}),
      };
    }

    let parsed: GitleaksRecord[];
    try {
      const raw = fs.readFileSync(outPath, 'utf-8');
      const json = JSON.parse(raw);
      parsed = Array.isArray(json) ? json : [];
    } catch (err) {
      return {
        module: this.name,
        ok: false,
        findings: [],
        summary: { count: 0, bySeverity: { info: 0, warn: 0, high: 0 } },
        durationMs: Date.now() - startedAt,
        error: { kind: 'parse-error', message: err instanceof Error ? err.message : String(err) },
      };
    }

    const findings: SubstrateFinding[] = parsed.map((rec) => ({
      module: this.name,
      severity: 'warn',
      rule: rec.RuleID ?? 'unknown',
      message: rec.Description ?? 'Secret detected',
      location: { file: rec.File, line: rec.StartLine },
      raw: rec,
    }));

    return {
      module: this.name,
      ok: true,
      findings,
      summary: {
        count: findings.length,
        bySeverity: {
          info: 0,
          warn: findings.length,
          high: 0,
        },
      },
      durationMs: Date.now() - startedAt,
    };
  }
}

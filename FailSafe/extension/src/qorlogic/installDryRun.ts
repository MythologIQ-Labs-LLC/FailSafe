/**
 * #463: frozen Qor-logic 0.176.1 cannot produce an authoritative install
 * preview/write-set. Do not send --json, --dry-run, or --include to Python:
 * a fictional preview must never be treated as consent to write different files.
 */
import type { QorLogicSkillIngestor } from './QorLogicSkillIngestor';

export interface DryRunFileEntry { path: string; sha256?: string }
export interface DryRunResult {
  wouldWrite: DryRunFileEntry[];
  wouldDelete?: DryRunFileEntry[];
  degraded: boolean;
  reason: string;
}

/** Retained for typed callers; there is no executor invocation until proven compatible. */
export interface InstallDryRunDeps {
  runQorlogicCommand: (
    ingestor: QorLogicSkillIngestor, args: ReadonlyArray<string>,
  ) => Promise<{ stdout: string; stderr: string; code: number | null }>;
  warn: (msg: string) => void;
}

export async function previewInstall(
  _ingestor: QorLogicSkillIngestor,
  _host: string,
  _scope: 'repo' | 'global' | undefined = 'repo',
  skillFilter?: string[],
  _deps?: InstallDryRunDeps,
): Promise<DryRunResult> {
  return {
    wouldWrite: [],
    degraded: true,
    reason: skillFilter === undefined
      ? 'frozen-qor-logic-install-preview-unavailable'
      : 'selective-skill-preview-unavailable',
  };
}

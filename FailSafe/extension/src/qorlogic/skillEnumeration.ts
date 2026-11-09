/**
 * #463: frozen Qor-logic 0.176.1 exposes "list --available" as text only.
 * It does not expose "list-skills --json" and does not support installing a
 * selected subset. Never fabricate a selectable inventory from an unsupported
 * CLI. Keep this read endpoint fail-closed without launching Python.
 */
import type { QorLogicSkillIngestor } from './QorLogicSkillIngestor';

export type SkillKind = 'skill' | 'agent' | 'command';
export interface SkillEntry {
  name: string;
  kind: SkillKind;
  path: string;
}
export interface SkillEnumerationResult {
  skills: SkillEntry[];
  degraded: boolean;
  reason?: string;
}
/** Kept for caller compatibility; intentionally never invoked. */
export interface SkillEnumerationDeps {
  runQorlogicCommand: (
    ingestor: QorLogicSkillIngestor,
    args: ReadonlyArray<string>,
  ) => Promise<{ stdout: string; stderr: string; code: number | null }>;
  warn: (msg: string) => void;
}
export async function enumerateSkillsForHost(
  _ingestor: QorLogicSkillIngestor,
  _host: string,
  _scope: 'repo' | 'global' | undefined,
  _deps: SkillEnumerationDeps,
): Promise<SkillEnumerationResult> {
  return {
    skills: [],
    degraded: true,
    reason: 'frozen-qor-logic-selective-enumeration-unavailable',
  };
}

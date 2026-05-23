// FailSafe Educational Component — Phase 2: settings reader.
//
// RD-2: leaf config reader. Reads the additive VS Code configuration pair
// `failsafe.education.enabled` (default true) and
// `failsafe.education.proficiency` (default 'beginner') and normalizes them
// into a safe `EducationConfig`. Proficiency is operator-set only — there
// is no usage inference here (ideation non-goal).

import * as vscode from "vscode";
import type { ProficiencyLevel } from "./lessons";
import { PROFICIENCY_LEVELS } from "./lessons";

/** Normalized education settings consumed by the webview affordance. */
export interface EducationConfig {
  enabled: boolean;
  proficiency: ProficiencyLevel;
}

const DEFAULT_PROFICIENCY: ProficiencyLevel = "beginner";
const DEFAULT_ENABLED = true;

/** Type guard: is `value` a valid stored proficiency level? */
function isProficiencyLevel(value: unknown): value is ProficiencyLevel {
  return (
    typeof value === "string" &&
    (PROFICIENCY_LEVELS as readonly string[]).includes(value)
  );
}

/**
 * Read and normalize the education settings.
 *
 * - `failsafe.education.enabled` missing/non-boolean → `true`.
 * - `failsafe.education.proficiency` missing or set to an invalid value →
 *   falls back to `'beginner'`.
 */
export function readEducationConfig(): EducationConfig {
  const config = vscode.workspace.getConfiguration("failsafe");

  const rawEnabled = config.get<unknown>("education.enabled", DEFAULT_ENABLED);
  const enabled = typeof rawEnabled === "boolean" ? rawEnabled : DEFAULT_ENABLED;

  const rawProficiency = config.get<unknown>(
    "education.proficiency",
    DEFAULT_PROFICIENCY,
  );
  const proficiency = isProficiencyLevel(rawProficiency)
    ? rawProficiency
    : DEFAULT_PROFICIENCY;

  return { enabled, proficiency };
}

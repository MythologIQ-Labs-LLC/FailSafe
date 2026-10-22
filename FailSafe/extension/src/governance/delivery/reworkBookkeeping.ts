/**
 * #532 B344 review fold (owner ruling 2026-10-21): files this repository edits in nearly every change.
 * An amended rework is related to the vetoed commit by the paths both changed; counting these would
 * let unrelated work that touches the same changelog and indexes pass the majority, so they are left
 * out of both sides of it. The dialog still lists them, as not counted.
 */
export const REWORK_BOOKKEEPING_PATHS: readonly string[] = Object.freeze([
  'CHANGELOG.md',
  'FailSafe/extension/CHANGELOG.md',
  'docs/BACKLOG.md',
  'docs/FEATURE_INDEX.md',
  'docs/META_LEDGER.md',
  'docs/GOVERNANCE_INDEX.md',
  'docs/SYSTEM_STATE.md',
]);

/** Whether a path, exactly as git names it, is a bookkeeping file: one of the list, or any package-lock.json. */
export function isBookkeepingPath(path: string): boolean {
  return REWORK_BOOKKEEPING_PATHS.includes(path) || path === 'package-lock.json' || path.endsWith('/package-lock.json');
}

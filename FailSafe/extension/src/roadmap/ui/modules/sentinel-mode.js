// FailSafe Command Center — Sentinel-mode value leaf (B-EM-1)
//
// `SentinelMode = "heuristic" | "llm-assisted" | "hybrid"`
// (shared/types/sentinel.ts). This pure leaf supplies the *single* corrected
// fallback for a missing `sentinel.mode`. The previous `|| 'observe'` fallback
// used across five UI sites was a category error: `'observe'` is a
// GovernanceMode, never a SentinelMode.
//
// No DOM, no imports, no label — labels are applied per-site.

/**
 * Resolve a Sentinel-evaluator mode value, defaulting to the corrected
 * `'heuristic'` baseline when no mode is supplied.
 *
 * @param {string|undefined|null} mode A SentinelMode value, or falsy.
 * @returns {string} The supplied mode, or `'heuristic'` when absent.
 */
export function sentinelModeValue(mode) {
  return mode || 'heuristic';
}

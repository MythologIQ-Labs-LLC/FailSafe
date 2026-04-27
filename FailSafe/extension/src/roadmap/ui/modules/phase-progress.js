// FailSafe Command Center — Phase Progress Normalization
// Pure function over a hub `ledgerSummary`. Centralizes the math so the UI
// never renders mathematically impossible progress (e.g. 4 completed out of
// 0 planned when the ledger has substantiations but no gate-tribunal entries).
//
// Contract:
//   normalizePhaseProgress(summary) -> { planned, completed, adherence }
//
//   - completed and planned are non-negative integers.
//   - planned is >= completed (a completion implies at least one plan).
//   - adherence is 0 when planned is 0; otherwise round((completed/planned)*100).

function toNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

export function normalizePhaseProgress(summary) {
  const completed = toNonNegativeInt(summary?.sessionsCompleted);
  const rawPlanned = toNonNegativeInt(summary?.plansStarted);
  const planned = Math.max(rawPlanned, completed);
  const adherence = planned > 0 ? Math.round((completed / planned) * 100) : 0;
  return { planned, completed, adherence };
}

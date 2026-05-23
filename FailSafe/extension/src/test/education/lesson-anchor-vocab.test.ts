// FX612 — Learn primary content: SWE-craft vocabulary dominance check.
//
// Plan v4 Phase 4 ideation failure-remediation class 1 ("content drifts back
// to FailSafe-vocab-only"). Enforce a SWE-craft-vs-FailSafe-vocab ratio
// across all `learn.essay.*` lesson bodies. SWE words must dominate.
//
// Split out of `lesson-anchor-coherence.test.ts` when that file passed the
// Section 4 razor after the FailSafe Learn v2 additions.

import { strict as assert } from "assert";
import { LESSONS } from "../../education/lessons";

const SWE_VOCAB: readonly string[] = [
  "scope", "acceptance", "criteria", "verify", "dependency", "diff", "test",
  "debug", "reversible", "prompt", "agent", "refactor", "commit",
  "branch", "patch", "function", "checkpoint", "summarize",
  "review", "regression", "rewrite", "error", "code", "files",
];
const FAILSAFE_VOCAB: readonly string[] = [
  "SHIELD", "governance", "ledger", "sentinel", "qor-", "audit gate",
  "META_LEDGER", "Shadow Genome", "bicameral", "enforcement engine",
];
const DOMINANCE_RATIO = 3;

function essayLessonBodies(): string {
  return Object.values(LESSONS)
    .filter((l) => l.anchor.startsWith("learn.essay."))
    .map((l) => Object.values(l.body).filter((v): v is string => typeof v === "string").join(" "))
    .join(" ");
}

function countOccurrences(text: string, vocab: readonly string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const word of vocab) {
    const re = new RegExp("\\b" + word.toLowerCase().replace(/[-]/g, "\\-") + "\\b", "g");
    const matches = lower.match(re);
    if (matches) n += matches.length;
  }
  return n;
}

suite("Learn primary content — SWE-craft vocabulary dominance (FX612)", () => {
  test("FX612 SWE vocabulary count >= FailSafe vocabulary count × dominance ratio", () => {
    const text = essayLessonBodies();
    assert.ok(text.length > 0, "expected non-empty essay lesson bodies (Phase 1 must ship)");
    const sweCount = countOccurrences(text, SWE_VOCAB);
    const failsafeCount = countOccurrences(text, FAILSAFE_VOCAB);
    assert.ok(
      sweCount >= failsafeCount * DOMINANCE_RATIO,
      `SWE vocab (${sweCount}) must dominate FailSafe vocab (${failsafeCount}) by >= ${DOMINANCE_RATIO}x`,
    );
  });

  test("FX612 fixture — text dominated by FailSafe vocabulary is CAUGHT", () => {
    const hostile =
      "SHIELD governance ledger sentinel qor-plan audit gate META_LEDGER " +
      "Shadow Genome bicameral enforcement engine SHIELD governance.";
    const sweCount = countOccurrences(hostile, SWE_VOCAB);
    const failsafeCount = countOccurrences(hostile, FAILSAFE_VOCAB);
    assert.ok(
      !(sweCount >= failsafeCount * DOMINANCE_RATIO),
      `hostile fixture should NOT pass dominance check (swe=${sweCount}, failsafe=${failsafeCount})`,
    );
  });
});

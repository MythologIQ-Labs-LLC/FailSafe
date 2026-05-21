// FX581 — Batch 4 Phase 2 (B-BIC-17): SentinelWatchPolicy gains a pure
// sibling method `classifyBicameralVerdict` that maps a bicameral verdict
// string to a Sentinel priority + notify flag. Classification-only (RD-2):
// the method does NOT make a verdict a SentinelEvent nor route it to the
// VerdictArbiter.
import { strict as assert } from "assert";
import { SentinelWatchPolicy } from "../../sentinel/SentinelWatchPolicy";

suite("FX581 SentinelWatchPolicy.classifyBicameralVerdict (Batch 4 Phase 2)", () => {
  test("'drifted' → { priority: 'high', notify: true }", () => {
    const policy = new SentinelWatchPolicy();
    assert.deepEqual(policy.classifyBicameralVerdict("drifted"), {
      priority: "high",
      notify: true,
    });
  });

  test("'ratified' and 'in-sync' → { priority: 'normal', notify: false }", () => {
    const policy = new SentinelWatchPolicy();
    assert.deepEqual(policy.classifyBicameralVerdict("ratified"), {
      priority: "normal",
      notify: false,
    });
    assert.deepEqual(policy.classifyBicameralVerdict("in-sync"), {
      priority: "normal",
      notify: false,
    });
  });

  test("an unknown verdict → the safe { priority: 'normal', notify: false } default", () => {
    const policy = new SentinelWatchPolicy();
    assert.deepEqual(policy.classifyBicameralVerdict("nonsense"), {
      priority: "normal",
      notify: false,
    });
    assert.deepEqual(policy.classifyBicameralVerdict(""), {
      priority: "normal",
      notify: false,
    });
  });
});

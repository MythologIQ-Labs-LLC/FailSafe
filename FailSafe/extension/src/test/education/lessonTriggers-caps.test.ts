// FX608 (sibling suite) — applyCaps semantics, split out of lessonTriggers.test.ts
// so each new file in the FailSafe Learn v2 surface stays under the 250-line
// Section 4 razor. The evaluator-semantics suite lives in lessonTriggers.test.ts;
// the cap-gate suite lives here. Same FX descriptor, same exporting module.

import { strict as assert } from "assert";
import {
  applyCaps,
  PER_ANCHOR_CAP,
  PER_SESSION_GLOBAL_CAP,
  type NudgeAnchor,
  type TriggerInput,
} from "../../education/lessonTriggers";

function firingResults(...anchors: NudgeAnchor[]) {
  return anchors.map((anchor) => ({ anchor, fire: true, reason: "test" }));
}

suite("Lesson trigger engine — applyCaps (FX608)", () => {
  test("FX608 applyCaps suppresses an anchor at or above PER_ANCHOR_CAP", () => {
    const input: TriggerInput = {
      recentNudgeCount: { "learn.essay.scope-before-prompt": PER_ANCHOR_CAP },
    };
    const out = applyCaps(firingResults("learn.essay.scope-before-prompt"), input);
    assert.equal(out.length, 0);
  });

  test("FX608 applyCaps enforces PER_SESSION_GLOBAL_CAP across firing anchors", () => {
    const out = applyCaps(
      firingResults(
        "learn.essay.scope-before-prompt",
        "learn.essay.acceptance-criteria",
        "learn.essay.choose-agent-option",
      ),
      {},
    );
    assert.equal(out.length, PER_SESSION_GLOBAL_CAP);
  });

  test("FX608 applyCaps reduces remaining budget by already-shown counts (cumulative across renders)", () => {
    // Persisted state: one anchor has already surfaced this session.
    const input: TriggerInput = {
      recentNudgeCount: { "learn.essay.scope-before-prompt": 1 },
    };
    const out = applyCaps(
      firingResults(
        "learn.essay.acceptance-criteria",
        "learn.essay.choose-agent-option",
      ),
      input,
    );
    // Budget = PER_SESSION_GLOBAL_CAP - 1 = 1; only the first new anchor surfaces.
    assert.equal(out.length, PER_SESSION_GLOBAL_CAP - 1);
    assert.equal(out[0].anchor, "learn.essay.acceptance-criteria");
  });

  test("FX608 applyCaps suppresses ALL firing when cumulative counts saturate the global cap", () => {
    const input: TriggerInput = {
      recentNudgeCount: {
        "learn.essay.scope-before-prompt": 1,
        "learn.essay.acceptance-criteria": 1,
      },
    };
    const out = applyCaps(
      firingResults("learn.essay.choose-agent-option", "learn.essay.verify-output"),
      input,
    );
    assert.equal(out.length, 0, "global cap saturated → no further nudges this session");
  });

  test("FX608 applyCaps suppresses dismissed anchors", () => {
    const input: TriggerInput = {
      dismissed: { "learn.essay.verify-output": true },
    };
    const out = applyCaps(firingResults("learn.essay.verify-output"), input);
    assert.equal(out.length, 0);
  });

  test("FX608 applyCaps drops non-firing results", () => {
    const out = applyCaps(
      [
        { anchor: "learn.essay.scope-before-prompt", fire: false, reason: "x" },
        { anchor: "learn.essay.acceptance-criteria", fire: true, reason: "y" },
      ],
      {},
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].anchor, "learn.essay.acceptance-criteria");
  });
});

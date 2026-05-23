// FX608 — Educational Component Phase 2: contextual-surfacing trigger engine.
// Pure-function tests; no DOM, no VS Code API. SG-035: invoke and assert.

import { strict as assert } from "assert";
import {
  evaluateTriggers,
  NUDGE_ANCHORS,
  SESSION_THRESHOLD_MINUTES,
  type NudgeAnchor,
  type TriggerInput,
} from "../../education/lessonTriggers";

function findResult(results: ReturnType<typeof evaluateTriggers>, anchor: NudgeAnchor) {
  const r = results.find((x) => x.anchor === anchor);
  assert.ok(r, `trigger result missing for ${anchor}`);
  return r!;
}

suite("Lesson trigger engine — evaluator semantics (FX608)", () => {
  test("FX608 scope-before-prompt fires when file activity exists but no active plan", () => {
    const input: TriggerInput = {
      activePlan: null,
      unattributedFileActivity: [
        { eventId: "e1", timestamp: "2026-05-22T10:00:00Z", type: "change", artifactPath: "src/x.ts" },
      ],
    };
    const r = findResult(evaluateTriggers(input), "learn.essay.scope-before-prompt");
    assert.equal(r.fire, true);
  });

  test("FX608 scope-before-prompt does NOT fire on a passive empty state (no plan, no activity)", () => {
    const r = findResult(
      evaluateTriggers({ activePlan: null, unattributedFileActivity: [] }),
      "learn.essay.scope-before-prompt",
    );
    assert.equal(r.fire, false, "passive empty state must not produce a relevant-now badge");
  });

  test("FX608 scope-before-prompt fires when file activity touches paths no plan-phase artifact covers", () => {
    const input: TriggerInput = {
      activePlan: { phases: [{ id: "p1", description: "do x", artifacts: ["src/a.ts"] }], title: "p" },
      unattributedFileActivity: [
        { eventId: "e1", timestamp: "2026-05-22T10:00:00Z", type: "change", artifactPath: "src/b.ts" },
      ],
    };
    const r = findResult(evaluateTriggers(input), "learn.essay.scope-before-prompt");
    assert.equal(r.fire, true);
  });

  test("FX608 scope-before-prompt does NOT fire when plan exists and file activity is covered", () => {
    const input: TriggerInput = {
      activePlan: { phases: [{ id: "p1", description: "do x", artifacts: ["src/a.ts"] }], title: "p" },
      unattributedFileActivity: [
        { eventId: "e1", timestamp: "2026-05-22T10:00:00Z", type: "change", artifactPath: "src/a.ts" },
      ],
    };
    const r = findResult(evaluateTriggers(input), "learn.essay.scope-before-prompt");
    assert.equal(r.fire, false);
  });

  test("FX608 acceptance-criteria fires when a phase has a description but no artifacts", () => {
    const input: TriggerInput = {
      activePlan: { phases: [{ id: "p1", description: "do x", artifacts: [] }] },
    };
    const r = findResult(evaluateTriggers(input), "learn.essay.acceptance-criteria");
    assert.equal(r.fire, true);
  });

  test("FX608 acceptance-criteria does NOT fire when all described phases have artifacts", () => {
    const input: TriggerInput = {
      activePlan: { phases: [{ id: "p1", description: "do x", artifacts: ["src/a.ts"] }] },
    };
    const r = findResult(evaluateTriggers(input), "learn.essay.acceptance-criteria");
    assert.equal(r.fire, false);
  });

  // Table-driven coverage of every high-blast-radius pattern the engine recognises.
  const HIGH_BLAST_FIXTURES: Array<[string, string]> = [
    ["npm package.json", "package.json"],
    ["npm package-lock.json", "package-lock.json"],
    ["yarn.lock", "yarn.lock"],
    ["pnpm-lock.yaml", "pnpm-lock.yaml"],
    ["bun.lock", "bun.lock"],
    ["bun.lockb", "bun.lockb"],
    ["tsconfig.json", "tsconfig.json"],
    ["tsconfig.build.json", "tsconfig.build.json"],
    ["vite config", "vite.config.ts"],
    ["webpack config", "webpack.config.js"],
    ["requirements.txt", "requirements.txt"],
    ["requirements-dev.txt", "requirements-dev.txt"],
    ["Pipfile", "Pipfile"],
    ["Pipfile.lock", "Pipfile.lock"],
    ["pyproject.toml", "pyproject.toml"],
    ["poetry.lock", "poetry.lock"],
    ["Cargo.toml", "Cargo.toml"],
    ["Cargo.lock", "Cargo.lock"],
    ["go.mod", "go.mod"],
    ["go.sum", "go.sum"],
    ["VSIX manifest", "extension.vsixmanifest"],
    ["packaged VSIX", "dist/failsafe-5.2.0.vsix"],
    [".github/workflows/", ".github/workflows/ci.yml"],
    ["nested package.json", "packages/core/package.json"],
  ];

  for (const [label, path] of HIGH_BLAST_FIXTURES) {
    test(`FX608 choose-agent-option fires on ${label}`, () => {
      const input: TriggerInput = {
        unattributedFileActivity: [
          { eventId: "e", timestamp: "2026-05-22T10:00:00Z", type: "change", artifactPath: path },
        ],
      };
      const r = findResult(evaluateTriggers(input), "learn.essay.choose-agent-option");
      assert.equal(r.fire, true, `expected fire on path: ${path}`);
    });
  }

  test("FX608 choose-agent-option does NOT fire on a non-config code change", () => {
    const input: TriggerInput = {
      unattributedFileActivity: [
        { eventId: "e1", timestamp: "2026-05-22T10:00:00Z", type: "change", artifactPath: "src/main.ts" },
      ],
    };
    const r = findResult(evaluateTriggers(input), "learn.essay.choose-agent-option");
    assert.equal(r.fire, false);
  });

  test("FX608 verify-output fires on ≥5 unattributed changes with no checkpoint after earliest", () => {
    const acts = Array.from({ length: 5 }, (_, i) => ({
      eventId: `e${i}`, timestamp: `2026-05-22T10:0${i}:00Z`, type: "change", artifactPath: `src/${i}.ts`,
    }));
    const r = findResult(
      evaluateTriggers({ unattributedFileActivity: acts, lastCheckpointAt: "2026-05-22T09:00:00Z" }),
      "learn.essay.verify-output",
    );
    assert.equal(r.fire, true);
  });

  test("FX608 verify-output does NOT fire when a checkpoint follows the earliest activity", () => {
    const acts = Array.from({ length: 5 }, (_, i) => ({
      eventId: `e${i}`, timestamp: `2026-05-22T10:0${i}:00Z`, type: "change", artifactPath: `src/${i}.ts`,
    }));
    const r = findResult(
      evaluateTriggers({ unattributedFileActivity: acts, lastCheckpointAt: "2026-05-22T10:30:00Z" }),
      "learn.essay.verify-output",
    );
    assert.equal(r.fire, false);
  });

  test("FX608 slow-down-to-speed-up fires when session exceeds threshold with no checkpoint", () => {
    const start = "2026-05-22T10:00:00Z";
    const now = Date.parse(start) + (SESSION_THRESHOLD_MINUTES + 1) * 60_000;
    const r = findResult(
      evaluateTriggers({ sessionStartedAt: start, now, lastCheckpointAt: null }),
      "learn.essay.slow-down-to-speed-up",
    );
    assert.equal(r.fire, true);
  });

  test("FX608 slow-down-to-speed-up does NOT fire when a checkpoint was recorded this session", () => {
    const start = "2026-05-22T10:00:00Z";
    const now = Date.parse(start) + (SESSION_THRESHOLD_MINUTES + 1) * 60_000;
    const r = findResult(
      evaluateTriggers({ sessionStartedAt: start, now, lastCheckpointAt: "2026-05-22T10:10:00Z" }),
      "learn.essay.slow-down-to-speed-up",
    );
    assert.equal(r.fire, false);
  });

  test("FX608 evaluateTriggers returns results in fixed NUDGE_ANCHORS order regardless of input field order", () => {
    const order = evaluateTriggers({}).map((r) => r.anchor);
    assert.deepEqual(order, [...NUDGE_ANCHORS]);
  });
});

// The applyCaps suite lives in `lessonTriggers-caps.test.ts` so each file
// stays under the Section 4 razor (<250 lines).

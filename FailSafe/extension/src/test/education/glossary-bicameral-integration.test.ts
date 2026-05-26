// FX618 — Phase 2A of plan-learn-tab-multimode-redesign: Bicameral co-existence.
// Two distinct glossary anchors live in the registry by intent:
//   glossary.bicameral              — two-chambers governance pattern (v1 carry-forward)
//   glossary.bicameral-integration  — Bicameral upstream MCP partner (Phase 2A)
//
// SG-035: invoke `getLesson` (registry round-trip) for both anchors and
// assert on resolved body content. Does NOT match against raw content-file
// strings — passes only if the resolver actually surfaces both entries.

import { strict as assert } from "assert";
import { getLesson, LESSONS, glossaryLessons } from "../../education/lessons";

suite("Bicameral co-existence (FX618)", () => {
  test("glossary.bicameral-integration resolves through getLesson with integration framing", () => {
    const body = getLesson("glossary.bicameral-integration", "beginner");
    assert.ok(body, "bicameral-integration entry must resolve via getLesson");
    const text = body!.toLowerCase();
    assert.ok(text.includes("mcp server"), `body must mention 'MCP server'; got: ${body}`);
    assert.ok(text.includes("integrat"), `body must mention 'integration' / 'integrate'; got: ${body}`);
  });

  test("glossary.bicameral remains UNCHANGED (two-chambers framing preserved; regression guard)", () => {
    const body = getLesson("glossary.bicameral", "beginner");
    assert.ok(body, "original bicameral entry must still resolve via getLesson");
    const text = body!.toLowerCase();
    assert.ok(text.includes("two chambers"), `original entry must still say 'two chambers'; got: ${body}`);
    assert.ok(
      text.includes("propose") || text.includes("check"),
      `original entry must still describe propose/review pattern; got: ${body}`,
    );
  });

  test("both bicameral anchors surface in the glossary registry filter", () => {
    const anchors = glossaryLessons().map((l) => l.anchor);
    assert.ok(anchors.includes("glossary.bicameral"), "two-chambers entry must surface in glossary filter");
    assert.ok(
      anchors.includes("glossary.bicameral-integration"),
      "integration-partner entry must surface in glossary filter",
    );
  });

  test("both anchors carry domain='failsafe' (Phase 2A read-time default for the legacy 12 entries)", () => {
    const a = LESSONS["glossary.bicameral"];
    const b = LESSONS["glossary.bicameral-integration"];
    assert.equal(a.domain, "failsafe", "two-chambers entry stamped 'failsafe' at registry-join");
    assert.equal(b.domain, "failsafe", "integration entry declares 'failsafe' (lives in glossary-content-2.ts)");
  });

  test("Bicameral terms are distinct (different display names)", () => {
    const a = LESSONS["glossary.bicameral"];
    const b = LESSONS["glossary.bicameral-integration"];
    assert.notEqual(a.term, b.term, "the two entries must have distinct display terms");
  });
});

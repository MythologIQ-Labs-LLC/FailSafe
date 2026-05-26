// FX617 — Phase 2A: Software glossary registry well-formedness.
// Closes the partial-coverage carry-forward from META_LEDGER #392 (the
// dedicated SWE-content test that was deferred during the auto-dev cycle;
// FX615 covered it indirectly via the Reference/Glossary sub-view render).
//
// SG-035 acceptance question per assertion: "If the registry-join in
// `lessons.ts` or `glossary-aggregator.ts` silently dropped the SWE arrays,
// would this test still pass?" — every check below invokes the actual
// `LESSONS` registry (post-aggregation), so a silent join failure fails the
// suite. Tests don't read the raw content arrays.

import { strict as assert } from "assert";
import { LESSONS, getLesson, lessonKind } from "../../education/lessons";

const SWE_ANCHOR_PREFIX = "glossary.swe.";

function sweLessons() {
  return Object.values(LESSONS).filter(
    (l) => lessonKind(l) === "glossary" && l.domain === "swe",
  );
}

function failsafeGlossaryLessons() {
  return Object.values(LESSONS).filter(
    (l) => lessonKind(l) === "glossary" && l.domain !== "swe",
  );
}

suite("Software glossary registry (FX617)", () => {
  test("SWE registry contains the expected entry-count range (40-60 terms)", () => {
    const swe = sweLessons();
    assert.ok(
      swe.length >= 40 && swe.length <= 60,
      `SWE glossary must have 40-60 entries; got ${swe.length}`,
    );
  });

  test("every SWE entry carries kind='glossary' + domain='swe'", () => {
    const swe = sweLessons();
    assert.ok(swe.length > 0, "SWE registry must be non-empty");
    for (const l of swe) {
      assert.equal(lessonKind(l), "glossary", `${l.anchor} must be kind='glossary'`);
      assert.equal(l.domain, "swe", `${l.anchor} must be domain='swe'`);
    }
  });

  test("every SWE anchor follows the `glossary.swe.<term>` namespace", () => {
    const swe = sweLessons();
    for (const l of swe) {
      assert.ok(
        typeof l.anchor === "string" && l.anchor.startsWith(SWE_ANCHOR_PREFIX),
        `${l.anchor} must start with '${SWE_ANCHOR_PREFIX}'`,
      );
      // The portion after the prefix must be a non-empty kebab-case slug.
      const slug = l.anchor.slice(SWE_ANCHOR_PREFIX.length);
      assert.ok(
        slug.length > 0 && /^[a-z0-9-]+$/.test(slug),
        `${l.anchor} must have a kebab-case slug after the prefix; got '${slug}'`,
      );
    }
  });

  test("SWE anchors are unique within the SWE registry", () => {
    const swe = sweLessons();
    const seen = new Set<string>();
    for (const l of swe) {
      assert.ok(!seen.has(l.anchor), `duplicate SWE anchor: ${l.anchor}`);
      seen.add(l.anchor);
    }
  });

  test("SWE anchors do not collide with FailSafe-domain anchors (disjoint namespaces)", () => {
    const sweAnchors = new Set(sweLessons().map((l) => l.anchor));
    for (const fs of failsafeGlossaryLessons()) {
      assert.ok(
        !sweAnchors.has(fs.anchor),
        `anchor collision between SWE and FailSafe glossaries: ${fs.anchor}`,
      );
      // Cross-namespace check: FailSafe anchor must NOT have the SWE prefix.
      assert.ok(
        !fs.anchor.startsWith(SWE_ANCHOR_PREFIX),
        `FailSafe-domain entry uses SWE namespace: ${fs.anchor}`,
      );
    }
  });

  test("SWE term strings do not collide with FailSafe-domain term strings", () => {
    const sweTerms = new Set(
      sweLessons().map((l) => l.term.trim().toLowerCase()),
    );
    for (const fs of failsafeGlossaryLessons()) {
      assert.equal(
        sweTerms.has(fs.term.trim().toLowerCase()),
        false,
        `term collision between SWE and FailSafe glossaries: '${fs.term}'`,
      );
    }
  });

  test("every SWE entry has all three tier bodies non-empty (beginner/intermediate/advanced)", () => {
    const swe = sweLessons();
    const tiers: Array<"beginner" | "intermediate" | "advanced"> = [
      "beginner",
      "intermediate",
      "advanced",
    ];
    for (const l of swe) {
      for (const tier of tiers) {
        const body = l.body[tier];
        assert.ok(
          typeof body === "string" && body.trim().length > 0,
          `${l.anchor} missing or empty body for tier '${tier}'`,
        );
      }
    }
  });

  test("every SWE entry round-trips through getLesson at the beginner tier", () => {
    const swe = sweLessons();
    for (const l of swe) {
      const resolved = getLesson(l.anchor, "beginner");
      assert.ok(
        typeof resolved === "string" && resolved.trim().length > 0,
        `getLesson(${l.anchor}, 'beginner') must resolve to a non-empty string`,
      );
      // Resolved should equal the literal beginner body (no flattening — beginner is string-typed).
      assert.equal(
        resolved,
        l.body.beginner,
        `getLesson(${l.anchor}, 'beginner') must equal the literal body`,
      );
    }
  });

  test("SWE registry includes the expected file-A core-primitives sample (variable, function, type)", () => {
    // Spot-check that the file-A content (`glossary-content-swe.ts`) actually
    // joined into the registry — catches a silent drop of File A by the
    // aggregator. Picks 3 entries that file-A is canonically expected to own.
    const expectedFileA = ["glossary.swe.variable", "glossary.swe.function", "glossary.swe.type"];
    for (const anchor of expectedFileA) {
      assert.ok(LESSONS[anchor], `expected file-A entry missing from registry: ${anchor}`);
    }
  });

  test("SWE registry includes the expected file-B vcs sample (branch, commit, diff)", () => {
    const expectedFileB = ["glossary.swe.branch", "glossary.swe.commit", "glossary.swe.diff"];
    for (const anchor of expectedFileB) {
      assert.ok(LESSONS[anchor], `expected file-B entry missing from registry: ${anchor}`);
    }
  });

  test("SWE registry includes the expected file-C runtime sample (prompt, hallucination, idempotent)", () => {
    const expectedFileC = ["glossary.swe.prompt", "glossary.swe.hallucination", "glossary.swe.idempotent"];
    for (const anchor of expectedFileC) {
      assert.ok(LESSONS[anchor], `expected file-C entry missing from registry: ${anchor}`);
    }
  });
});

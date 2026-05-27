// FX598 / FX602 — Lesson-anchor coherence check (Educational Component Phase 5a
// + Phase 6d glossary-class extension + FailSafe Learn v2 essay-list extension).
//
// Cross-checks every `Lesson.anchor` in the shipped registry against the
// anchors actually mounted in source. A lesson whose anchor is mounted nowhere
// is a coherence violation — dead lesson content that no governance moment
// surfaces.
//
// Helper extraction + advisory rationale live in `lesson-anchor-coherence-
// helpers.ts`. The FX612 SWE-craft vocabulary dominance check lives in
// `lesson-anchor-vocab.test.ts`. Splits hold the Section 4 razor (≤250 lines).

import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import { LESSONS, glossaryLessons, lessonKind } from "../../education/lessons";
import {
  buildSourceInventory,
  runCoherenceCheck,
  SRC_ROOT,
  type AnchorMount,
} from "./lesson-anchor-coherence-helpers";

suite("Lesson-anchor coherence (FX598)", () => {
  const registryAnchors = Object.values(LESSONS).map((l) => l.anchor);
  // A2: anchors of every `'glossary'`-kind lesson — routed through the
  // glossary-surface validation branch, not the governance-moment branches.
  const glossaryAnchors = glossaryLessons().map((l) => l.anchor);
  const glossaryAnchorSet = new Set<string>(glossaryAnchors);
  // Learn v2: `learn.essay.*` anchors mount on the essay-list surface.
  const essayAnchors = registryAnchors.filter((a) => a.startsWith("learn.essay."));
  const essayAnchorSet = new Set<string>(essayAnchors);

  test("FX598 shipped registry — every lesson anchor is mounted somewhere", () => {
    const inventory = buildSourceInventory(glossaryAnchors, essayAnchors);
    const { violations } = runCoherenceCheck(
      registryAnchors, inventory, glossaryAnchorSet, essayAnchorSet,
    );
    assert.equal(
      violations.length, 0,
      `unmounted lesson anchors (no webview/native/glossary mount): ${violations.map((v) => v.anchor).join(", ")}`,
    );
  });

  test("FX598 v5.2.1 — the three SHIELD anchors are no longer in the registry", () => {
    // v5.2.0 stripped the Monitor SHIELD lesson expander; v5.2.1 drops the
    // orphaned registry entries. See src/education/lessons.ts header for
    // re-introduction protocol.
    for (const anchor of ["shield.plan", "shield.audit", "shield.substantiate"]) {
      assert.equal(
        LESSONS[anchor],
        undefined,
        `${anchor} must not be reintroduced without a consuming mount`,
      );
    }
  });

  test("FX598 A3 — governance-mode is mounted in BOTH webview and native classes", () => {
    const inventory = buildSourceInventory(glossaryAnchors, essayAnchors);
    const mount = inventory.get("governance-mode");
    assert.ok(mount, "governance-mode anchor must be mounted");
    assert.ok(mount!.webview.length > 0, "webview mount (governance-mode-card.js)");
    assert.ok(mount!.native.length > 0, "native mount (FirstRunModePicker / FirstRunOnboarding)");
  });

  test("FX598 A3 — a native-ONLY anchor is coherent (not a false positive)", () => {
    // Registry-keyed lesson consumed solely by a native surface: getLesson()
    // mount but no renderLesson() webview anchor. Per A3 this is a distinct
    // valid class — the check must NOT flag it.
    const inventory = new Map<string, AnchorMount>([
      ["native-only-fixture", { anchor: "native-only-fixture", webview: [], native: ["FirstRunModePicker.ts"], glossary: [], essayList: [] }],
    ]);
    const { violations, results } = runCoherenceCheck(["native-only-fixture"], inventory);
    assert.equal(violations.length, 0, "native-only mount must not be a violation");
    assert.equal(results[0].mountClass, "native");
  });

  test("FX598 fixture — a lesson anchor pointing at a removed surface is CAUGHT", () => {
    const inventory = buildSourceInventory(glossaryAnchors, essayAnchors);
    const withGhost = [...registryAnchors, "ghost-removed-surface"];
    const { violations } = runCoherenceCheck(withGhost, inventory, glossaryAnchorSet, essayAnchorSet);
    assert.equal(violations.length, 1, "exactly one violation expected");
    assert.equal(violations[0].anchor, "ghost-removed-surface");
    assert.equal(violations[0].mountClass, "unmounted");
  });

  // --- FX602: A2 glossary-class positive validation ------------------------

  test("FX602 every 'glossary'-kind lesson resolves to the glossary surface", () => {
    assert.ok(glossaryAnchors.length > 0, "registry must carry glossary lessons");
    const inventory = buildSourceInventory(glossaryAnchors, essayAnchors);
    const { results } = runCoherenceCheck(glossaryAnchors, inventory, glossaryAnchorSet);
    for (const r of results) {
      assert.equal(r.mountClass, "glossary", `${r.anchor} must classify as the glossary surface, got ${r.mountClass}`);
      assert.ok(r.glossaryFiles.includes("education-glossary.js"), `${r.anchor} must mount on education-glossary.js`);
    }
  });

  test("FX602 glossaryLessons() returns exactly the 'glossary'-kind registry entries", () => {
    const fromSelector = new Set(glossaryLessons().map((l) => l.id));
    const fromRegistry = new Set(
      Object.values(LESSONS).filter((l) => lessonKind(l) === "glossary").map((l) => l.id),
    );
    assert.deepEqual(
      [...fromSelector].sort(), [...fromRegistry].sort(),
      "glossaryLessons() must equal the 'glossary'-kind registry subset",
    );
  });

  test("FX602 a glossary lesson with no glossary surface is CAUGHT (not a false positive)", () => {
    // Dead glossary lesson — anchor is glossary-kind but NO module consumes
    // glossaryLessons() for it. Must FAIL as unmounted; must not silently
    // accept via another class.
    const deadInventory = new Map<string, AnchorMount>();
    const { violations, results } = runCoherenceCheck(
      ["glossary.dead-fixture"], deadInventory, new Set(["glossary.dead-fixture"]),
    );
    assert.equal(violations.length, 1, "dead glossary lesson must be a violation");
    assert.equal(results[0].mountClass, "unmounted");
  });

  test("FX602 a glossary anchor is NOT validated against governance-moment mounts", () => {
    // Even if a glossary anchor accidentally appears in a renderLesson() webview
    // mount, it must still be validated against the GLOSSARY surface.
    const inventory = new Map<string, AnchorMount>([
      ["glossary.borrow-fixture", {
        anchor: "glossary.borrow-fixture",
        webview: ["some-card.js"], native: [], glossary: [], essayList: [],
      }],
    ]);
    const { results, violations } = runCoherenceCheck(
      ["glossary.borrow-fixture"], inventory, new Set(["glossary.borrow-fixture"]),
    );
    assert.equal(results[0].mountClass, "unmounted", "a glossary anchor must not borrow the webview classification");
    assert.equal(violations.length, 1);
  });

  test("FX602 governance-moment anchors are NOT mis-flagged as glossary", () => {
    // A2 no-false-positive: the surviving 'moment' anchor must keep its
    // webview/native classification — it is not in the glossary set.
    // (The three SHIELD anchors were dropped in v5.2.1; see lessons.ts.)
    const inventory = buildSourceInventory(glossaryAnchors, essayAnchors);
    const momentAnchors = ["governance-mode"];
    const { results } = runCoherenceCheck(momentAnchors, inventory, glossaryAnchorSet);
    for (const r of results) {
      assert.notEqual(r.mountClass, "glossary", `${r.anchor} is a governance moment, must not classify as glossary`);
      assert.notEqual(r.mountClass, "unmounted", `${r.anchor} must stay mounted`);
    }
  });

  test("FX598 UI_MANIFEST.md references the Educational Component", () => {
    const manifestPath = path.resolve(SRC_ROOT, "..", "..", "..", "docs", "UI_MANIFEST.md");
    assert.ok(fs.existsSync(manifestPath), "docs/UI_MANIFEST.md must exist");
    const manifest = fs.readFileSync(manifestPath, "utf8");
    assert.match(manifest, /Educational Component/, "UI_MANIFEST.md must reference the Educational Component");
  });
});

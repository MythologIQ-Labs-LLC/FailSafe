// FX598 — Educational Component Phase 5a: lesson-anchor coherence check.
//
// Cross-checks every `Lesson.anchor` in the shipped registry against the
// anchors actually mounted in source (and against UI_MANIFEST.md's reference
// to the component). A lesson whose anchor is mounted nowhere is a coherence
// violation — dead lesson content that no governance moment surfaces.
//
// A3 (audit advisory): registry-keyed lessons consumed by NATIVE surfaces
// (FirstRunModePicker / FirstRunOnboarding QuickPicks + notifications, which
// mount no webview DOM anchor) are a DISTINCT non-webview class. The check
// must NOT false-positive on a lesson that has a native mount but no webview
// `renderLesson(...)` mount — a native mount is a valid mount.
//
// A2 (Phase 6 audit advisory): `'glossary'`-kind lessons are a THIRD distinct
// class. They do NOT mount at a governance-moment anchor — they mount on the
// single Settings "FailSafe Glossary" surface. The check POSITIVELY validates
// them: every `'glossary'`-kind anchor must (a) be returned by
// `glossaryLessons()` and (b) be consumed by `education-glossary.js` (which
// calls the `glossaryLessons()` selector). A dead glossary lesson with no
// surface — `glossaryLessons()` not consumed anywhere — must still FAIL.
//
// SG-035: real registry + real source scan, assert on real output.

import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import { LESSONS, glossaryLessons, lessonKind } from "../../education/lessons";

// --- coherence model -------------------------------------------------------

type MountClass = "webview" | "native" | "glossary" | "unmounted";

interface AnchorMount {
  anchor: string;
  webview: string[]; // files with a webview renderLesson('<anchor>') mount
  native: string[]; // files with a native getLesson('<anchor>') mount
  glossary: string[]; // files mounting the anchor on the Glossary surface
}

interface CoherenceResult {
  anchor: string;
  mountClass: MountClass;
  webviewFiles: string[];
  nativeFiles: string[];
  glossaryFiles: string[];
}

/**
 * Classify a single anchor's mount status from a source-anchor inventory.
 *
 * `expectGlossary` (A2): when the anchor belongs to a `'glossary'`-kind
 * lesson, it MUST resolve to a glossary-surface mount — a glossary lesson is
 * never validated against the governance-moment webview/native sets. A
 * glossary lesson with no glossary-surface mount is `'unmounted'` (a dead
 * lesson), not silently accepted via some other class.
 */
function classifyAnchor(
  anchor: string,
  mount: AnchorMount | undefined,
  expectGlossary = false,
): CoherenceResult {
  const webviewFiles = mount?.webview ?? [];
  const nativeFiles = mount?.native ?? [];
  const glossaryFiles = mount?.glossary ?? [];
  let mountClass: MountClass;
  if (expectGlossary) {
    // A2: a glossary lesson is positively validated against the glossary
    // surface ONLY — it must not borrow a webview/native classification.
    mountClass = glossaryFiles.length > 0 ? "glossary" : "unmounted";
  } else if (webviewFiles.length > 0) {
    mountClass = "webview";
  } else if (nativeFiles.length > 0) {
    // A3: a native-only mount is still a valid mount, not a violation.
    mountClass = "native";
  } else {
    mountClass = "unmounted";
  }
  return { anchor, mountClass, webviewFiles, nativeFiles, glossaryFiles };
}

/**
 * Run the coherence check over a lesson registry given a source-anchor
 * inventory. Returns the per-anchor classification + the violation list
 * (anchors that are mounted nowhere — webview, native, nor glossary).
 *
 * `glossaryAnchorSet` (A2) lists the anchors known to belong to
 * `'glossary'`-kind lessons; those are routed through the glossary-surface
 * validation branch instead of the governance-moment branches.
 */
function runCoherenceCheck(
  registryAnchors: string[],
  inventory: Map<string, AnchorMount>,
  glossaryAnchorSet: Set<string> = new Set(),
): { results: CoherenceResult[]; violations: CoherenceResult[] } {
  const results = registryAnchors.map((a) =>
    classifyAnchor(a, inventory.get(a), glossaryAnchorSet.has(a)),
  );
  const violations = results.filter((r) => r.mountClass === "unmounted");
  return { results, violations };
}

// --- source scan -----------------------------------------------------------

const SRC_ROOT = path.resolve(__dirname, "..", "..", "..", "src");

// Webview anchor mounts: a string literal passed to renderLesson('<anchor>').
// Native anchor mounts: a string literal passed to getLesson('<anchor>') in a
// non-webview (.ts governance/genesis) surface.
const WEBVIEW_DIRS = [path.join(SRC_ROOT, "roadmap", "ui", "modules")];
const NATIVE_FILES = [
  path.join(SRC_ROOT, "governance", "FirstRunModePicker.ts"),
  path.join(SRC_ROOT, "genesis", "FirstRunOnboarding.ts"),
];

function listFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => path.join(dir, f));
}

/** Extract every string literal an anchor-consuming call references. */
function extractAnchors(content: string, fnName: string): string[] {
  const re = new RegExp(`${fnName}\\(\\s*['"\`]([^'"\`]+)['"\`]`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.push(m[1]);
  return out;
}

/**
 * Also pick up anchors declared in an anchor lookup table (monitor-render.js
 * uses PHASE_LESSON_ANCHORS = { 0: 'shield.plan', ... }). Without this the
 * SHIELD anchors would read as unmounted because renderLesson() is fed a
 * table value, not a string literal. We treat any module that both imports
 * renderLesson AND declares such a table as a webview mount for those
 * anchors. Tolerates both array (`[...]`) and object (`{...}`) table forms.
 */
function extractTableAnchors(content: string): string[] {
  if (!/renderLesson/.test(content)) return [];
  const tableRe = /_ANCHORS?\s*=\s*[[{]([^\]}]*)[\]}]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(content)) !== null) {
    // An object table has `key: 'value'` pairs — match only the quoted
    // values (the anchors), not bare numeric keys.
    const litRe = /['"`]([^'"`]+)['"`]/g;
    let lm: RegExpExecArray | null;
    while ((lm = litRe.exec(m[1])) !== null) out.push(lm[1]);
  }
  return out;
}

/**
 * A2: the single Glossary surface is the webview module that consumes the
 * `glossaryLessons()` selector. Any module under WEBVIEW_DIRS that calls
 * `glossaryLessons(` is treated as mounting EVERY `'glossary'`-kind anchor —
 * the selector returns the whole glossary set, so the surface mounts them all.
 */
function findGlossarySurfaceFiles(): string[] {
  const out: string[] = [];
  for (const dir of WEBVIEW_DIRS) {
    for (const file of listFiles(dir, ".js")) {
      const content = fs.readFileSync(file, "utf8");
      if (/glossaryLessons\s*\(/.test(content)) out.push(path.basename(file));
    }
  }
  return out;
}

/**
 * Build the real source-anchor inventory by scanning the shipped surfaces.
 *
 * `glossaryAnchors` (A2): the anchors of every `'glossary'`-kind lesson. Each
 * is mounted on the Glossary surface IFF a webview module consumes the
 * `glossaryLessons()` selector — a positive, source-verified mount.
 */
function buildSourceInventory(glossaryAnchors: string[] = []): Map<string, AnchorMount> {
  const inventory = new Map<string, AnchorMount>();
  const ensure = (anchor: string): AnchorMount => {
    let entry = inventory.get(anchor);
    if (!entry) {
      entry = { anchor, webview: [], native: [], glossary: [] };
      inventory.set(anchor, entry);
    }
    return entry;
  };

  // Webview mounts.
  for (const dir of WEBVIEW_DIRS) {
    for (const file of listFiles(dir, ".js")) {
      const content = fs.readFileSync(file, "utf8");
      const direct = extractAnchors(content, "renderLesson");
      const table = extractTableAnchors(content);
      for (const a of [...direct, ...table]) {
        ensure(a).webview.push(path.basename(file));
      }
    }
  }

  // Native mounts.
  for (const file of NATIVE_FILES) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    for (const a of extractAnchors(content, "getLesson")) {
      ensure(a).native.push(path.basename(file));
    }
  }

  // A2: Glossary-surface mounts. If a module consumes glossaryLessons(), it
  // mounts every glossary-kind anchor. If NO module consumes it, the glossary
  // anchors stay glossary:[] and the check flags them as unmounted (dead).
  const glossarySurfaces = findGlossarySurfaceFiles();
  for (const anchor of glossaryAnchors) {
    for (const surface of glossarySurfaces) {
      ensure(anchor).glossary.push(surface);
    }
  }

  return inventory;
}

// --- tests -----------------------------------------------------------------

suite("Lesson-anchor coherence (FX598)", () => {
  const registryAnchors = Object.values(LESSONS).map((l) => l.anchor);
  // A2: the anchors of every `'glossary'`-kind lesson — routed through the
  // glossary-surface validation branch, not the governance-moment branches.
  const glossaryAnchors = glossaryLessons().map((l) => l.anchor);
  const glossaryAnchorSet = new Set<string>(glossaryAnchors);

  test("FX598 shipped registry — every lesson anchor is mounted somewhere", () => {
    const inventory = buildSourceInventory(glossaryAnchors);
    const { violations } = runCoherenceCheck(
      registryAnchors,
      inventory,
      glossaryAnchorSet,
    );
    assert.equal(
      violations.length,
      0,
      `unmounted lesson anchors (no webview/native/glossary mount): ${violations
        .map((v) => v.anchor)
        .join(", ")}`,
    );
  });

  test("FX598 shipped registry — webview anchors resolve to webview mounts", () => {
    const inventory = buildSourceInventory(glossaryAnchors);
    const { results } = runCoherenceCheck(registryAnchors, inventory, glossaryAnchorSet);
    // The three SHIELD anchors are webview-mounted in monitor-render.js.
    for (const anchor of ["shield.plan", "shield.audit", "shield.substantiate"]) {
      const r = results.find((x) => x.anchor === anchor);
      assert.ok(r, `${anchor} present in registry`);
      assert.equal(
        r!.mountClass,
        "webview",
        `${anchor} should be webview-mounted, got ${r!.mountClass}`,
      );
    }
  });

  test("FX598 A3 — governance-mode is mounted in BOTH webview and native classes", () => {
    const inventory = buildSourceInventory(glossaryAnchors);
    const mount = inventory.get("governance-mode");
    assert.ok(mount, "governance-mode anchor must be mounted");
    assert.ok(
      mount!.webview.length > 0,
      "governance-mode has a webview mount (governance-mode-card.js)",
    );
    assert.ok(
      mount!.native.length > 0,
      "governance-mode has a native mount (FirstRunModePicker / FirstRunOnboarding)",
    );
  });

  test("FX598 A3 — a native-ONLY anchor is coherent (not a false positive)", () => {
    // Simulate a registry-keyed lesson consumed solely by a native surface:
    // it has a getLesson() mount but no renderLesson() webview anchor. Per A3
    // this is a distinct valid class — the check must NOT flag it.
    const inventory = new Map<string, AnchorMount>([
      ["native-only-fixture", { anchor: "native-only-fixture", webview: [], native: ["FirstRunModePicker.ts"], glossary: [] }],
    ]);
    const { violations, results } = runCoherenceCheck(["native-only-fixture"], inventory);
    assert.equal(violations.length, 0, "native-only mount must not be a violation");
    assert.equal(results[0].mountClass, "native", "native-only anchor classified as native");
  });

  test("FX598 fixture — a lesson anchor pointing at a removed surface is CAUGHT", () => {
    // Fixture: a registry that includes an anchor with NO mount anywhere
    // (the surface it was wired to was removed). The check must trip.
    const inventory = buildSourceInventory(glossaryAnchors);
    const withGhost = [...registryAnchors, "ghost-removed-surface"];
    const { violations } = runCoherenceCheck(withGhost, inventory, glossaryAnchorSet);
    assert.equal(violations.length, 1, "exactly one violation expected");
    assert.equal(
      violations[0].anchor,
      "ghost-removed-surface",
      "the removed-surface anchor must be the flagged violation",
    );
    assert.equal(violations[0].mountClass, "unmounted");
  });

  // --- FX602: A2 glossary-class positive validation ------------------------

  test("FX602 every 'glossary'-kind lesson resolves to the glossary surface", () => {
    // Positive assertion (A2): each glossary anchor must classify as the
    // distinct 'glossary' mount class — not webview, not native, not unmounted.
    assert.ok(glossaryAnchors.length > 0, "registry must carry glossary lessons");
    const inventory = buildSourceInventory(glossaryAnchors);
    const { results } = runCoherenceCheck(glossaryAnchors, inventory, glossaryAnchorSet);
    for (const r of results) {
      assert.equal(
        r.mountClass,
        "glossary",
        `${r.anchor} must classify as the glossary surface, got ${r.mountClass}`,
      );
      assert.ok(
        r.glossaryFiles.includes("education-glossary.js"),
        `${r.anchor} must mount on education-glossary.js`,
      );
    }
  });

  test("FX602 glossaryLessons() returns exactly the 'glossary'-kind registry entries", () => {
    // The selector and the registry filter must agree — the coherence check's
    // glossary class is derived from glossaryLessons(), so any drift here
    // would silently mis-route a lesson.
    const fromSelector = new Set(glossaryLessons().map((l) => l.id));
    const fromRegistry = new Set(
      Object.values(LESSONS)
        .filter((l) => lessonKind(l) === "glossary")
        .map((l) => l.id),
    );
    assert.deepEqual(
      [...fromSelector].sort(),
      [...fromRegistry].sort(),
      "glossaryLessons() must equal the 'glossary'-kind registry subset",
    );
  });

  test("FX602 a glossary lesson with no glossary surface is CAUGHT (not a false positive)", () => {
    // A2: a dead glossary lesson — its anchor is glossary-kind but NO module
    // consumes glossaryLessons() for it (empty inventory). It must FAIL as
    // unmounted; the check must not silently accept it via another class.
    const deadInventory = new Map<string, AnchorMount>();
    const { violations, results } = runCoherenceCheck(
      ["glossary.dead-fixture"],
      deadInventory,
      new Set(["glossary.dead-fixture"]),
    );
    assert.equal(violations.length, 1, "dead glossary lesson must be a violation");
    assert.equal(results[0].mountClass, "unmounted");
  });

  test("FX602 a glossary anchor is NOT validated against governance-moment mounts", () => {
    // A2: even if a glossary anchor accidentally appeared in a renderLesson()
    // webview mount, it must still be validated against the GLOSSARY surface —
    // a glossary lesson must positively resolve to the glossary surface, never
    // borrow a governance-moment classification.
    const inventory = new Map<string, AnchorMount>([
      [
        "glossary.borrow-fixture",
        {
          anchor: "glossary.borrow-fixture",
          webview: ["some-card.js"], // a stray governance-moment-style mount
          native: [],
          glossary: [], // but NO glossary-surface mount
        },
      ],
    ]);
    const { results, violations } = runCoherenceCheck(
      ["glossary.borrow-fixture"],
      inventory,
      new Set(["glossary.borrow-fixture"]),
    );
    assert.equal(
      results[0].mountClass,
      "unmounted",
      "a glossary anchor must not borrow the webview classification",
    );
    assert.equal(violations.length, 1, "glossary lesson without glossary surface fails");
  });

  test("FX602 governance-moment anchors are NOT mis-flagged as glossary", () => {
    // A2 no-false-positive: the four 'moment' anchors must keep their
    // webview/native classification — they are not in the glossary set.
    const inventory = buildSourceInventory(glossaryAnchors);
    const momentAnchors = ["governance-mode", "shield.plan", "shield.audit", "shield.substantiate"];
    const { results } = runCoherenceCheck(momentAnchors, inventory, glossaryAnchorSet);
    for (const r of results) {
      assert.notEqual(
        r.mountClass,
        "glossary",
        `${r.anchor} is a governance moment, must not classify as glossary`,
      );
      assert.notEqual(r.mountClass, "unmounted", `${r.anchor} must stay mounted`);
    }
  });

  test("FX598 UI_MANIFEST.md references the Educational Component", () => {
    const manifestPath = path.resolve(
      SRC_ROOT, "..", "..", "..", "docs", "UI_MANIFEST.md",
    );
    assert.ok(fs.existsSync(manifestPath), "docs/UI_MANIFEST.md must exist");
    const manifest = fs.readFileSync(manifestPath, "utf8");
    assert.match(
      manifest,
      /Educational Component/,
      "UI_MANIFEST.md must reference the Educational Component (Phase 0 reconciliation)",
    );
  });
});

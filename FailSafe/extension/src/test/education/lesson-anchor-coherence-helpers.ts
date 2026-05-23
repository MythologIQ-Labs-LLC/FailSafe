// Shared model + source-scan helpers for the lesson-anchor coherence tests.
// Lives outside the `.test.ts` discovery glob so mocha does not load it as a
// suite. Split out of `lesson-anchor-coherence.test.ts` when the file passed
// the Section 4 razor (≤250 lines) after the FailSafe Learn v2 essay-list
// extension and the FX612 SWE-vocab dominance check were added.
//
// SG-035: the helpers run against the real registry + a real source scan, so
// the tests assert on real shipped output rather than synthetic fixtures.

import * as fs from "fs";
import * as path from "path";

// --- coherence model -------------------------------------------------------

export type MountClass =
  | "webview"
  | "native"
  | "glossary"
  | "essay-list"
  | "unmounted";

export interface AnchorMount {
  anchor: string;
  webview: string[]; // files with a webview renderLesson('<anchor>') mount
  native: string[]; // files with a native getLesson('<anchor>') mount
  glossary: string[]; // files mounting the anchor on the Glossary surface
  essayList: string[]; // files mounting `learn.essay.*` anchors on the essay-list surface
}

export interface CoherenceResult {
  anchor: string;
  mountClass: MountClass;
  webviewFiles: string[];
  nativeFiles: string[];
  glossaryFiles: string[];
  essayListFiles: string[];
}

/**
 * Classify a single anchor's mount status. `expectGlossary` (A2) and
 * `expectEssayList` (Learn v2) route the anchor to its declared surface
 * and refuse to silently accept it via another class.
 */
export function classifyAnchor(
  anchor: string,
  mount: AnchorMount | undefined,
  expectGlossary = false,
  expectEssayList = false,
): CoherenceResult {
  const webviewFiles = mount?.webview ?? [];
  const nativeFiles = mount?.native ?? [];
  const glossaryFiles = mount?.glossary ?? [];
  const essayListFiles = mount?.essayList ?? [];
  let mountClass: MountClass;
  if (expectEssayList) {
    mountClass = essayListFiles.length > 0 ? "essay-list" : "unmounted";
  } else if (expectGlossary) {
    mountClass = glossaryFiles.length > 0 ? "glossary" : "unmounted";
  } else if (webviewFiles.length > 0) {
    mountClass = "webview";
  } else if (nativeFiles.length > 0) {
    mountClass = "native";
  } else {
    mountClass = "unmounted";
  }
  return { anchor, mountClass, webviewFiles, nativeFiles, glossaryFiles, essayListFiles };
}

/**
 * Run the coherence check over a lesson registry given a source-anchor
 * inventory. Returns per-anchor classifications + the violation list
 * (anchors mounted nowhere — webview, native, glossary, nor essay-list).
 */
export function runCoherenceCheck(
  registryAnchors: string[],
  inventory: Map<string, AnchorMount>,
  glossaryAnchorSet: Set<string> = new Set(),
  essayAnchorSet: Set<string> = new Set(),
): { results: CoherenceResult[]; violations: CoherenceResult[] } {
  const results = registryAnchors.map((a) =>
    classifyAnchor(
      a,
      inventory.get(a),
      glossaryAnchorSet.has(a),
      essayAnchorSet.has(a),
    ),
  );
  const violations = results.filter((r) => r.mountClass === "unmounted");
  return { results, violations };
}

// --- source scan -----------------------------------------------------------

export const SRC_ROOT = path.resolve(__dirname, "..", "..", "..", "src");

// Webview anchor mounts: a string literal passed to renderLesson('<anchor>').
// Native anchor mounts: a string literal passed to getLesson('<anchor>') in a
// non-webview (.ts governance/genesis) surface.
export const WEBVIEW_DIRS = [path.join(SRC_ROOT, "roadmap", "ui", "modules")];
export const NATIVE_FILES = [
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
export function extractAnchors(content: string, fnName: string): string[] {
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
 * table value, not a string literal. Treat any module that both imports
 * renderLesson AND declares such a table as a webview mount for those
 * anchors. Tolerates both array (`[...]`) and object (`{...}`) table forms.
 */
export function extractTableAnchors(content: string): string[] {
  if (!/renderLesson/.test(content)) return [];
  const tableRe = /_ANCHORS?\s*=\s*[[{]([^\]}]*)[\]}]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(content)) !== null) {
    const litRe = /['"`]([^'"`]+)['"`]/g;
    let lm: RegExpExecArray | null;
    while ((lm = litRe.exec(m[1])) !== null) out.push(lm[1]);
  }
  return out;
}

/**
 * A2: the Glossary surface is the webview module that consumes the
 * `glossaryLessons()` selector. Any module under WEBVIEW_DIRS that calls
 * `glossaryLessons(` is treated as mounting EVERY `'glossary'`-kind anchor.
 */
export function findGlossarySurfaceFiles(): string[] {
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
 * Learn v2: the essay-list surface is the webview module that filters
 * LESSONS to anchors with the `learn.essay.` prefix. Any module under
 * WEBVIEW_DIRS whose content references `learn.essay.` is treated as
 * mounting EVERY `learn.essay.*` anchor.
 */
export function findEssayListSurfaceFiles(): string[] {
  const out: string[] = [];
  for (const dir of WEBVIEW_DIRS) {
    for (const file of listFiles(dir, ".js")) {
      const content = fs.readFileSync(file, "utf8");
      if (/learn\.essay\./.test(content)) out.push(path.basename(file));
    }
  }
  return out;
}

/**
 * Build the real source-anchor inventory by scanning the shipped surfaces.
 * `glossaryAnchors` + `essayAnchors` are the anchor sets whose mounts are
 * positively validated against their declared surface — a positive,
 * source-verified mount, not a permissive fall-through.
 */
export function buildSourceInventory(
  glossaryAnchors: string[] = [],
  essayAnchors: string[] = [],
): Map<string, AnchorMount> {
  const inventory = new Map<string, AnchorMount>();
  const ensure = (anchor: string): AnchorMount => {
    let entry = inventory.get(anchor);
    if (!entry) {
      entry = { anchor, webview: [], native: [], glossary: [], essayList: [] };
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

  // A2: Glossary-surface mounts.
  const glossarySurfaces = findGlossarySurfaceFiles();
  for (const anchor of glossaryAnchors) {
    for (const surface of glossarySurfaces) {
      ensure(anchor).glossary.push(surface);
    }
  }

  // Learn v2: essay-list surface mounts.
  const essayListSurfaces = findEssayListSurfaceFiles();
  for (const anchor of essayAnchors) {
    for (const surface of essayListSurfaces) {
      ensure(anchor).essayList.push(surface);
    }
  }

  return inventory;
}

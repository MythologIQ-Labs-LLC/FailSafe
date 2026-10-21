"use strict";
// B218 / B311-B312 lane (plan-b311-b312 LD10, LD11): pins on the agent instruction files. These
// are wording pins, not behaviour: CLAUDE.md carries the owner's taxonomy and authority paragraph
// once, the old "source of truth" directive is gone, and the other agents' instruction files make
// no tracker-config claim of their own.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const EXT = path.resolve(__dirname, "..", "..", "..");
const REPO = path.resolve(EXT, "..", "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const OWNER_SENTENCES = [
  "The Console's implemented navigation defines the product's actual tabs and subviews.",
  "The operator's `docs/roadmap/tracker-config.yaml`, when present, records intended tracker taxonomy and mappings.",
  "Report disagreements as drift; do not silently reconcile them.",
  "`docs/roadmap/programs.yaml` governs tracker programs and phases.",
  "`docs/ARCHITECTURE_INDEX.md` governs architectural document authority.",
];
const PARAGRAPH = `**Product taxonomy and architectural authority:** ${OWNER_SENTENCES.join(" ")}`;
const OLD_TEXT = ["Tracker taxonomy directive (FX891)", "is the source of truth", "align to that declared taxonomy"];
const count = (text, needle) => text.split(needle).length - 1;

test("CLAUDE.md carries each owner sentence exactly once, as one paragraph", () => {
  const claude = read("CLAUDE.md");
  for (const s of OWNER_SENTENCES) assert.equal(count(claude, s), 1, s);
  assert.ok(claude.split(/\r?\n/).includes(PARAGRAPH), "the paragraph is one line, worded exactly");
});

test("CLAUDE.md no longer carries the old tracker taxonomy directive", () => {
  const claude = read("CLAUDE.md");
  for (const s of OLD_TEXT) assert.equal(count(claude, s), 0, s);
});

test("AGENTS.md, GEMINI.md and copilot-instructions.md make no tracker-config claim", () => {
  for (const rel of ["AGENTS.md", "GEMINI.md", ".github/copilot-instructions.md"]) {
    assert.equal(count(read(rel), "tracker-config.yaml"), 0, rel);
  }
});

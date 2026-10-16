"use strict";
// Every `FailSafe: <title>` a user-facing doc tells you to run must be a
// command FailSafe registers. Renamed and removed commands had left 24 dead
// references across the READMEs, the bundled help, the wiki and the
// integration READMEs.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const EXT = path.resolve(__dirname, "..", "..", "..");
const REPO = path.resolve(EXT, "..", "..");

/** The registered command titles, from the extension manifest. */
function registeredTitles(pkg = JSON.parse(fs.readFileSync(path.join(EXT, "package.json"), "utf8"))) {
  return new Set(pkg.contributes.commands.map((c) => c.title));
}

function userFacingDocs() {
  const md = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => path.join(dir, f));
  const integrations = path.join(EXT, "src", "integrations");
  return [
    path.join(REPO, "README.md"),
    path.join(EXT, "README.md"),
    path.join(EXT, "docs", "COMPONENT_HELP.md"),
    path.join(EXT, "docs", "PROCESS_GUIDE.md"),
    path.join(REPO, "docs", "INTEGRATIONS.md"),
    ...md(path.join(REPO, "docs", "wiki")),
    ...fs.readdirSync(integrations)
      .map((d) => path.join(integrations, d, "README.md"))
      .filter((f) => fs.existsSync(f)),
  ];
}

/** `FailSafe: X` in backticks, in bold, or as the first cell of a table row. */
const REFERENCE = /`(FailSafe: [^`\n]+)`|\*\*(FailSafe: [^*\n]+)\*\*|^\|\s*(FailSafe: [^|\n]+?)\s*\|/gm;

function references(file) {
  const text = fs.readFileSync(file, "utf8");
  const found = [];
  for (const m of text.matchAll(REFERENCE)) {
    const line = text.slice(0, m.index).split("\n").length;
    found.push({ where: `${path.relative(REPO, file).split(path.sep).join("/")}:${line}`, title: (m[1] ?? m[2] ?? m[3]).trim() });
  }
  return found;
}

test("every FailSafe command a doc names is a registered command", () => {
  const titles = registeredTitles();
  const refs = userFacingDocs().flatMap(references);
  assert.ok(refs.length >= 100, `only ${refs.length} command references found; the scan is not reading the docs`);
  const dead = refs.filter((r) => !titles.has(r.title)).map((r) => `${r.where}: ${r.title}`);
  assert.deepEqual(dead, [], `docs name commands that do not exist:\n${dead.join("\n")}`);
});

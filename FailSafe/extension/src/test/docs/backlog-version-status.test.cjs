"use strict";
// The BACKLOG Version Summary must not keep calling a shipped release a
// candidate. A version that has a dated CHANGELOG entry and is older than the
// version being built is done, so its row may not say RC, RELEASING or IN
// PROGRESS.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const EXT = path.resolve(__dirname, "..", "..", "..");
const REPO = path.resolve(EXT, "..", "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const UNFINISHED = /\bRC\d*\b|RELEASING|IN PROGRESS|🧪|🚀|🚧/;

const parse = (v) => v.split(".").map(Number);
const older = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};

/** Rows of the Version Summary table: { version, cells }. */
function versionRows(text) {
  const section = /^## Version Summary$([\s\S]*?)(?=^---$|^## )/m.exec(text);
  assert.ok(section, "BACKLOG has no Version Summary section");
  return section[1].split(/\r?\n/)
    .filter((l) => /^\|\s*\**v\d+\.\d+\.\d+\**\s*\|/.test(l))
    .map((l) => ({ version: /v(\d+\.\d+\.\d+)/.exec(l)[1], cells: l.replace(/^\||\|\s*$/g, "").split("|").map((c) => c.trim()) }));
}

/** Versions with a dated `## [x.y.z] - YYYY-MM-DD` CHANGELOG heading. */
const datedReleases = (changelog) => new Set([...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/gm)].map((m) => m[1]));

function staleRows(backlog, changelog, current) {
  const dated = datedReleases(changelog);
  const rows = versionRows(backlog);
  assert.ok(rows.length >= 20, `only ${rows.length} version rows parsed`);
  const malformed = rows.filter((r) => r.cells.length !== 4).map((r) => `v${r.version}: ${r.cells.length} cells`);
  const stale = rows.filter((r) => dated.has(r.version) && older(r.version, current) && UNFINISHED.test(r.cells[2] ?? ""))
    .map((r) => `v${r.version}: ${r.cells[2]}`);
  return { malformed, stale };
}

test("every Version Summary row has four cells and no shipped release reads as unfinished", () => {
  const current = JSON.parse(fs.readFileSync(path.join(EXT, "package.json"), "utf8")).version;
  const { malformed, stale } = staleRows(read("docs/BACKLOG.md"), read("CHANGELOG.md"), current);
  assert.deepEqual({ malformed, stale }, { malformed: [], stale: [] });
});

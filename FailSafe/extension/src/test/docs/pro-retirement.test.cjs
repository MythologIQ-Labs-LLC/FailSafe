"use strict";
// FailSafe Pro is canceled (owner decision, 2026-10-16). No tracked file may
// present it as a product. A match is allowed only in a historical record, in
// a justified file, on a line-scoped allowance, or on a line that itself says
// the product is canceled or retired. Files come from `git ls-files`, so the
// operator's ignored PRIVATE/ and FailSafe-Pro/ folders are never read.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const yaml = require("js-yaml");

const REPO = path.resolve(__dirname, "..", "..", "..", "..", "..");
const PRO = /failsafe[ -]?pro\b|products\/failsafe-pro|\bpro[- ](daemon|tier|coexistence|card)\b/i;
const RETIRED_LINE = /cancel|retired/i;

/** Whole files that record history or that this lane may not edit. */
const HISTORICAL = [
  "docs/META_LEDGER.md", "CHANGELOG.md", "FailSafe/extension/CHANGELOG.md",
  "docs/SYSTEM_STATE.md", "docs/GOVERNANCE_INDEX.md", "docs/FEATURE_INDEX.md",
  "docs/BACKLOG.md", // closed items are history; open items are checked below
  "docs/SHADOW_GENOME.md", "docs/wiki/Changelog-and-Releases.md",
];
const HISTORICAL_PREFIXES = [".failsafe/", "docs/research/", "docs/research-brief-", "docs/plan-", "docs/Planning/"];

/** Whole files with a stated reason to name Pro. */
const JUSTIFIED = [
  // These tests pin that Pro is absent, so they name it.
  "FailSafe/extension/src/test/docs/v5-coherence.test.ts",
  "FailSafe/extension/src/test/roadmap/settings-renderer.test.ts",
  "FailSafe/extension/src/test/ui/command-center-settings.spec.ts",
  "FailSafe/extension/src/test/docs/pro-retirement.test.cjs", // defines the pattern
  // Dormant license tier, invisible to users; its retirement is B215.
  "FailSafe/extension/src/core/LicenseValidator.ts",
  "FailSafe/extension/src/test/core/featureGateService.test.ts",
  "FailSafe/extension/src/test/core/licenseValidator.test.ts",
];

/** Files where only lines matching the sub-pattern may match. */
const LINE_SCOPED = {
  "docs/ARCHITECTURE_PLAN.md": /FailSafe-Pro\//, // names the ignored local folder
  ".gitignore": /FailSafe-Pro\//,
  "FailSafe/extension/src/roadmap/ui/modules/settings.js": /Pro card every time/, // fixed v5 render bug
};

/** Files kept as retirement notes: every matching line says so. */
const RETIRED = ["docs/wiki/FailSafe-Pro.md", "docs/ROADMAP.md", "docs/roadmap/programs.yaml"];

function trackedFiles(root = REPO) {
  const res = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
  assert.equal(res.status, 0, `git ls-files failed in ${root}: ${res.stderr}`);
  return res.stdout.split("\0").filter(Boolean);
}

function readText(rel) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  const buf = fs.readFileSync(abs);
  return buf.includes(0) ? null : buf.toString("utf8");
}

const matchingLines = (text) => text.split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => PRO.test(l));
const isHistorical = (rel) => HISTORICAL.includes(rel) || HISTORICAL_PREFIXES.some((p) => rel.startsWith(p));

/** Offending "path:line: text" entries for one file, empty when it is allowed. */
function offences(rel, text) {
  if (isHistorical(rel) || JUSTIFIED.includes(rel)) return [];
  const allowed = LINE_SCOPED[rel] ?? (RETIRED.includes(rel) ? RETIRED_LINE : null);
  return matchingLines(text)
    .filter(([, l]) => !(allowed && allowed.test(l)))
    .map(([n, l]) => `${rel}:${n}: ${l.trim().slice(0, 120)}`);
}

test("no tracked file presents FailSafe Pro as a product", () => {
  const files = trackedFiles();
  assert.ok(files.length > 500, `git ls-files listed only ${files.length} files`);
  let historicalHits = 0;
  const bad = [];
  for (const rel of files) {
    const text = readText(rel);
    if (text === null) continue;
    if (rel === "CHANGELOG.md") historicalHits += matchingLines(text).length;
    bad.push(...offences(rel, text));
  }
  assert.ok(historicalHits > 0, "the scan found no Pro mention even in CHANGELOG.md, so it inspected nothing");
  assert.deepEqual(bad, [], `active Pro references:\n${bad.join("\n")}`);
});

test("no open backlog item plans for FailSafe Pro", () => {
  const open = readText("docs/BACKLOG.md").split(/\r?\n/).filter((l) => /^\s*- \[ \]/.test(l));
  assert.ok(open.length > 10, `only ${open.length} open backlog items parsed`);
  const bad = open.filter((l) => PRO.test(l) && !RETIRED_LINE.test(l));
  assert.deepEqual(bad, []);
});

test("the wiki's FailSafe Pro page, if kept, is a retirement note with no product link", () => {
  const text = readText("docs/wiki/FailSafe-Pro.md");
  if (text === null) return; // deleting the page is also a retirement
  assert.match(text.split(/\r?\n/)[0], /^# .*\(Retired\)/);
  assert.equal(/mythologiq\.studio/i.test(text), false, "the retired page still links to mythologiq.studio");
});

test("the Development Tracker shows no FailSafe Pro bridge", () => {
  const manifest = yaml.load(readText("docs/roadmap/programs.yaml"));
  const bridges = manifest.convergence ?? [];
  assert.ok(bridges.length > 0, "programs.yaml has no convergence bridges to check");
  const bad = bridges.filter((b) => PRO.test(JSON.stringify(b)));
  assert.deepEqual(bad, []);
});


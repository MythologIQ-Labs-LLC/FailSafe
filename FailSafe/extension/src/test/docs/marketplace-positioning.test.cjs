"use strict";
// Marketplace categorization is product positioning, not a capability claim.
// Open VSX and VS Code Marketplace read these fields from the same VSIX manifest.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const manifest = require(path.resolve(__dirname, "..", "..", "..", "package.json"));

test("FailSafe uses a truthful marketplace category instead of secondary features", () => {
  assert.deepEqual(manifest.categories, ["Other"]);
  assert.match(manifest.description, /governance.*risk monitoring.*audit evidence/i);
});

test("search keywords describe governed developer workflows, without old misdirection", () => {
  const terms = manifest.keywords;
  assert.ok(Array.isArray(terms));
  assert.ok(terms.length > 0 && terms.length <= 30, "VS Code supports up to 30 search keywords");
  assert.equal(new Set(terms).size, terms.length, "duplicate keywords distort discovery");
  for (const term of ["agent governance", "policy enforcement", "code audit", "audit trail"]) {
    assert.ok(terms.includes(term), `missing discovery term: ${term}`);
  }
  for (const old of ["hallucination", "roi", "machine learning", "testing", "visualization"]) {
    assert.ok(!terms.includes(old), `misleading discovery term: ${old}`);
  }
});

test("marketplace metadata does not change extension identity or version", () => {
  assert.equal(manifest.name, "mythologiq-failsafe");
  assert.equal(manifest.publisher, "MythologIQ");
  assert.equal(manifest.icon, "media/icon.png");
  assert.equal(manifest.main, "./dist/extension/main.js");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

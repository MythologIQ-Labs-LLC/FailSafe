"use strict";
// #917 V4: GHSA-mrhx-c7xc-m3w5. Before zod 4.6.6 a size-bounded array (.max/.length) walked
// every element before refusing it, producing one issue per bad element, so an oversized
// request could exhaust the extension host's memory. FailSafe ships zod >= 4.6.7, where
// the bound is checked first. These tests pin that and the one network-reachable schema.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const EXT = path.resolve(__dirname, "..", "..", "..");
const outDir = path.join(EXT, "out");
const { z } = require("zod");
const zodPkg = require(path.join(EXT, "node_modules", "zod", "package.json"));
const { parseReviewRequest } = require(path.join(outDir, "governance", "delivery", "deliveryReview.js"));

const atLeast = (version, floor) => {
  const [a, b, c] = version.split(".").map(Number);
  const [x, y, w] = floor.split(".").map(Number);
  return a !== x ? a > x : b !== y ? b > y : c >= w;
};

test("the installed zod is a release with the size-bound fix", () => {
  assert.ok(atLeast(zodPkg.version, "4.6.6"), `zod ${zodPkg.version} is affected by GHSA-mrhx-c7xc-m3w5`);
  assert.match(require(path.join(EXT, "package.json")).dependencies.zod, /^\^4\.6\.(6|7|[89]|\d\d)/);
});

test("an oversized bounded array is refused with one issue, without walking its elements", () => {
  const schema = z.array(z.object({ id: z.number() }).strict()).max(20);
  const huge = new Array(200_000).fill({ bogus: true });
  const result = schema.safeParse(huge);
  assert.equal(result.success, false);
  assert.equal(result.error.issues.length, 1, "one too_big issue, not one per element");
  assert.equal(result.error.issues[0].code, "too_big");
});

test("POST /api/actions/delivery/review: an oversized reworks list is refused (route schema)", () => {
  const reworks = new Array(200_000).fill({ vetoEntryId: "x", reworkCommit: "nope" });
  const started = process.hrtime.bigint();
  const parsed = parseReviewRequest({ intentId: "x", verdict: "PASS", commitSha: "0".repeat(40), reworks });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(typeof parsed, "string");
  assert.match(parsed, /reworks, when given, 1 to 20/);
  assert.ok(ms < 2000, `refusal took ${ms.toFixed(0)} ms`);
});

"use strict";
// v6.0.8 lane C (LD8, review delta LD-4): createDraft checks the tag, creates
// the draft through the API, and waits for GitHub to list that very release
// (the v6.0.7 publish stopped on a lagging listing with "found 0"); publish
// targets the release id. The gh exec and the sleep are injected, so no
// GitHub call is made.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const SCRIPTS = path.resolve(__dirname, "..", "..", "..", "scripts");
const { ghClient } = require(path.join(SCRIPTS, "release-github.cjs"));

const TAG = "v6.0.8";
const method = (args) => (args.includes("-X") ? args[args.indexOf("-X") + 1] : "GET");

/**
 * A fake gh. `listings[i]` is the number of releases for TAG (ids 40, 41, ...)
 * in the i-th release listing (the last one repeats); `others` are extra
 * releases listed every time.
 */
function fakeGh(listings, { created = { id: 40, draft: true, tag_name: TAG }, refFails = false, others = [], patched } = {}) {
  const calls = [];
  let listed = 0;
  const exec = (args) => {
    calls.push(args);
    if (args[0] !== "api") return "";
    if (method(args) === "POST") return JSON.stringify(created);
    if (method(args) === "PATCH") {
      const id = Number(String(args[args.indexOf("PATCH") + 1]).split("/").pop());
      return JSON.stringify(patched ?? { id, draft: false, tag_name: TAG });
    }
    if (String(args[1]).includes("/git/ref/tags/")) {
      if (refFails) throw new Error("gh: Not Found (HTTP 404)");
      return JSON.stringify({ ref: `refs/tags/${TAG}` });
    }
    const matches = listings[Math.min(listed, listings.length - 1)];
    listed++;
    const releases = Array.from({ length: matches }, (_, i) => ({ id: 40 + i, tag_name: TAG, draft: true }));
    return JSON.stringify([[...releases, ...others, { id: 9, tag_name: "v6.0.7", draft: false }]]);
  };
  const posts = () => calls.filter((a) => a[0] === "api" && method(a) === "POST");
  return { exec, calls, listings: () => listed, posts };
}

function recordingSleep() {
  const slept = [];
  return { sleep: async (ms) => { slept.push(ms); }, slept };
}

test("G1 a draft that is listed only on the third listing is returned; it is created once", async () => {
  const gh = fakeGh([0, 0, 1]);
  const s = recordingSleep();
  const release = await ghClient("o/r", gh.exec, { sleep: s.sleep }).createDraft(TAG, undefined);
  assert.equal(release.id, 40);
  assert.equal(release.tag_name, TAG);
  assert.equal(gh.posts().length, 1);
  assert.equal(gh.listings(), 3);
  assert.deepEqual(s.slept, [1000, 2000]);
});

test("G2 two releases for the tag stop at once, with no further listing", async () => {
  const gh = fakeGh([0, 2, 1]);
  const s = recordingSleep();
  await assert.rejects(ghClient("o/r", gh.exec, { sleep: s.sleep }).createDraft(TAG, undefined),
    (err) => err.stop === true && /found 2/.test(err.message));
  assert.equal(gh.listings(), 2);
  assert.deepEqual(s.slept, [1000]);
  assert.equal(gh.posts().length, 1);
});

test("G3 a draft that is never listed stops after six listings and 30 s of waiting", async () => {
  const gh = fakeGh([0]);
  const s = recordingSleep();
  await assert.rejects(ghClient("o/r", gh.exec, { sleep: s.sleep }).createDraft(TAG, undefined),
    (err) => err.stop === true && /found 0/.test(err.message) && /6 listings/.test(err.message) && /30 s/.test(err.message));
  assert.equal(gh.listings(), 6);
  assert.deepEqual(s.slept, [1000, 2000, 4000, 8000, 15000]);
  assert.equal(gh.posts().length, 1);
});

test("G4 another release for the tag in the listing stops at once and is never returned", async () => {
  const gh = fakeGh([0], { others: [{ id: 7, tag_name: TAG, draft: false }] });
  const s = recordingSleep();
  await assert.rejects(ghClient("o/r", gh.exec, { sleep: s.sleep }).createDraft(TAG, undefined),
    (err) => err.stop === true && /\b7\b/.test(err.message) && /\b40\b/.test(err.message));
  assert.equal(gh.listings(), 1);
  assert.deepEqual(s.slept, []);
});

test("G5 a create response that is not a draft for this tag stops before any listing", async () => {
  for (const created of [{ id: 40, draft: false, tag_name: TAG }, { id: 40, draft: true, tag_name: "v6.0.7" }, { draft: true, tag_name: TAG }, { id: "40", draft: true, tag_name: TAG }]) {
    const gh = fakeGh([1], { created });
    await assert.rejects(ghClient("o/r", gh.exec, { sleep: async () => undefined }).createDraft(TAG, undefined),
      (err) => err.stop === true, JSON.stringify(created));
    assert.equal(gh.listings(), 0, JSON.stringify(created));
  }
});

test("G6 a tag that does not exist on the remote stops before anything is created", async () => {
  const gh = fakeGh([1], { refFails: true });
  await assert.rejects(ghClient("o/r", gh.exec, { sleep: async () => undefined }).createDraft(TAG, undefined),
    (err) => err.stop === true && /does not exist/.test(err.message));
  assert.equal(gh.posts().length, 0);
  assert.equal(gh.listings(), 0);
});

test("G7 publish updates the release by its id: draft=false and make_latest=true", async () => {
  const gh = fakeGh([1]);
  await ghClient("o/r", gh.exec).publish(41, TAG);
  const patch = gh.calls.filter((a) => a[0] === "api" && method(a) === "PATCH");
  assert.equal(patch.length, 1);
  assert.ok(patch[0].includes("repos/o/r/releases/41"), JSON.stringify(patch[0]));
  assert.ok(patch[0].includes("draft=false") && patch[0].includes("make_latest=true"), JSON.stringify(patch[0]));
  assert.equal(gh.calls.filter((a) => a[0] === "release").length, 0, "no tag-addressed release edit");
});

test("G7b a publish response that is not the published release stops the run", async () => {
  for (const patched of [{ id: 41, draft: true }, { id: 42, draft: false }, {}]) {
    const gh = fakeGh([1], { patched });
    await assert.rejects(ghClient("o/r", gh.exec).publish(41, TAG), (err) => err.stop === true, JSON.stringify(patched));
  }
});

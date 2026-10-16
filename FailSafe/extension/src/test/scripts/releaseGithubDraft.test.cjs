"use strict";
// v6.0.8 lane C (LD8): createDraft waits for GitHub to list the draft it just
// created. In the v6.0.7 publish the listing lagged and the run stopped with
// "found 0". The gh exec and the sleep are injected, so no GitHub call is made.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const SCRIPTS = path.resolve(__dirname, "..", "..", "..", "scripts");
const { ghClient } = require(path.join(SCRIPTS, "release-github.cjs"));

const TAG = "v6.0.8";

/** An exec whose release listing answers from `listings` in order (the last one repeats). */
function fakeGh(listings) {
  const calls = [];
  let listed = 0;
  const exec = (args) => {
    calls.push(args);
    if (args[0] === "api") {
      const matches = listings[Math.min(listed, listings.length - 1)];
      listed++;
      const releases = Array.from({ length: matches }, (_, i) => ({ id: 40 + i, tag_name: TAG, draft: true }));
      return JSON.stringify([[...releases, { id: 9, tag_name: "v6.0.7", draft: false }]]);
    }
    return "";
  };
  return { exec, calls, listings: () => listed, creates: () => calls.filter((a) => a[0] === "release" && a[1] === "create").length };
}

function recordingSleep() {
  const slept = [];
  return { sleep: async (ms) => { slept.push(ms); }, slept };
}

test("G1 a draft that is listed only on the third listing is returned; the create runs once", async () => {
  const gh = fakeGh([0, 0, 1]);
  const s = recordingSleep();
  const release = await ghClient("o/r", gh.exec, { sleep: s.sleep }).createDraft(TAG, undefined);
  assert.equal(release.id, 40);
  assert.equal(release.tag_name, TAG);
  assert.equal(gh.creates(), 1);
  assert.equal(gh.listings(), 3);
  assert.deepEqual(s.slept, [1000, 2000]);
});

test("G2 two drafts for the tag stop at once, with no further listing", async () => {
  const gh = fakeGh([0, 2, 1]);
  const s = recordingSleep();
  await assert.rejects(ghClient("o/r", gh.exec, { sleep: s.sleep }).createDraft(TAG, undefined),
    (err) => err.stop === true && /found 2/.test(err.message));
  assert.equal(gh.listings(), 2);
  assert.deepEqual(s.slept, [1000]);
  assert.equal(gh.creates(), 1);
});

test("G3 a draft that is never listed stops after six listings and 30 s of waiting", async () => {
  const gh = fakeGh([0]);
  const s = recordingSleep();
  await assert.rejects(ghClient("o/r", gh.exec, { sleep: s.sleep }).createDraft(TAG, undefined),
    (err) => err.stop === true && /found 0/.test(err.message) && /6 listings/.test(err.message) && /30 s/.test(err.message));
  assert.equal(gh.listings(), 6);
  assert.deepEqual(s.slept, [1000, 2000, 4000, 8000, 15000]);
  assert.equal(gh.creates(), 1);
});

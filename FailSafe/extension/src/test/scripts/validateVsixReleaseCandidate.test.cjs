"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { releaseMarkerMatches } = require("../../../scripts/validate-vsix.cjs");

const VERSION = "6.0.12";
const DATE = "2026-11-06";
const CANDIDATE = "**Candidate Version**: v6.0.12 (2026-11-06), not yet published."; 
const PUBLISHED = "**Current Release**: v6.0.11 (2026-10-29), the published version."; 
const candidateReadme = "# FailSafe\n" + CANDIDATE + "\n" + PUBLISHED;
const prerelease = {GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/pull/620/merge"};
const rc = {GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/release/v6.0.12-rc1"};

test("source/VSIX candidate can identify genuine older published release during PR qualification", () => {
  assert.equal(releaseMarkerMatches(candidateReadme,VERSION,DATE,prerelease),true);
  assert.equal(releaseMarkerMatches(candidateReadme,VERSION,DATE,rc),true);
});

test("main, tag and renamed release refs cannot claim candidate marker as published", () => {
  for (const context of [
    {GITHUB_EVENT_NAME:"push",GITHUB_REF:"refs/heads/main"},
    {GITHUB_EVENT_NAME:"push",GITHUB_REF:"refs/tags/v6.0.12"},
    {GITHUB_EVENT_NAME:"release",GITHUB_REF:"refs/tags/v6.0.12"},
    {GITHUB_EVENT_NAME:"push",GITHUB_REF:"refs/heads/release/v6.0.13-rc1"},
    {GITHUB_EVENT_NAME:"push",GITHUB_REF:"refs/heads/release/v6.0.12-stable"},
    {GITHUB_EVENT_NAME:"push",GITHUB_REF:"refs/heads/release/v6.0.12-rc1/evil"}
  ]) assert.equal(releaseMarkerMatches(candidateReadme,VERSION,DATE,context),false,JSON.stringify(context));
});

test("missing, mismatched or false published version makes candidate invalid", () => {
  for (const altered of [
    CANDIDATE, PUBLISHED,
    candidateReadme.replace("v6.0.12 (2026-11-06)","v6.0.11 (2026-11-06)"),
    candidateReadme.replace("Current Release**: v6.0.11","Current Release**: v6.0.12"),
    candidateReadme.replace("Current Release**: v6.0.11","Current Release**: v7.0.0"),
  ]) assert.equal(releaseMarkerMatches(altered,VERSION,DATE,prerelease),false);
});

test("published marker remains strict and accepted on actual tag", () => {
  const source = "# FailSafe\n**Current Release**: v6.0.12 (2026-11-06)";
  assert.equal(releaseMarkerMatches(source,VERSION,DATE,{GITHUB_EVENT_NAME:"push",GITHUB_REF:"refs/tags/v6.0.12"}),true);
  assert.equal(releaseMarkerMatches(source,VERSION,"2026-11-07",{GITHUB_EVENT_NAME:"push",GITHUB_REF:"refs/tags/v6.0.12"}),false);
});
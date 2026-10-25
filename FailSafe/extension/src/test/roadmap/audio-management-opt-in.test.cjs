"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const src = name => fs.readFileSync(path.resolve(__dirname, "..", "..", "roadmap", "ui", "modules", name), "utf8");

test("saved-audio panel renders server values as text, with explicit deletion only", () => {
  const tpl = src("brainstorm-templates.js");
  const manager = src("brainstorm-audio-management.js");
  const orchestrator = src("brainstorm.js");
  assert.match(tpl, /cc-bs-audio-manage/);
  assert.match(tpl, /cc-bs-audio-recordings[^>]*hidden/);
  assert.match(manager, /textContent/);
  assert.doesNotMatch(manager, /innerHTML|localStorage|sessionStorage/);
  assert.match(manager, /method: 'DELETE'/);
  assert.match(manager, /addEventListener\('click'/);
  assert.match(orchestrator, /wireSavedAudioManager\(this\)/);
});

"use strict";
// Pin the visual opt-in to an unchecked, non-persistent control and the
// actual capture callback's decision point. Native approval is tested in TS.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ui = (name) => fs.readFileSync(path.resolve(__dirname, "..", "..", "roadmap", "ui", "modules", name), "utf8");

test("Mind Map audio persistence is visibly opt-in, unchecked on every new view", () => {
  const template = ui("brainstorm-templates.js");
  const input = template.match(/<input\b[^>]*class="cc-bs-save-audio-toggle"[^>]*>/);
  assert.ok(input, "save-audio control must exist");
  assert.doesNotMatch(input[0], /\schecked\b/i, "never pre-enable raw capture saving");
  assert.match(template, /even if transcription fails/i);
  assert.match(template, /until you delete them/i);
});

test("raw-capture callback checks live opt-in before any upload", () => {
  const wiring = ui("brainstorm-voice-wiring.js");
  const start = wiring.indexOf("onAudioCaptured = (blob)");
  const preference = wiring.indexOf("cc-bs-save-audio-toggle", start);
  const guard = wiring.indexOf("?.checked !== true) return", preference);
  const upload = wiring.indexOf("fetch('/api/v1/brainstorm/audio'", start);
  assert.ok(start >= 0 && preference > start && guard > preference && upload > guard);
  assert.doesNotMatch(wiring, /store\.set\(['"]audio-save/, "raw-audio consent must not silently persist");
});

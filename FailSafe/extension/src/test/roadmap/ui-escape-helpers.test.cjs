"use strict";
// Lane E (plan-e-console-ui-xss LD8, audit fold 7) row G1: the browser-served
// Console modules carry no quote-unsafe escape helper. A helper built as
// `d.textContent = value; return d.innerHTML` escapes & < > but not quotes, so
// its output breaks out of a quoted attribute. Two guards:
//   G1a (positive): every module-local `esc` / `escHtml` delegates to the
//       shared full escaper `escapeHtml` (brainstorm-templates.js:4), or
//       maps all of & < > " ' itself (mcp-catalog-renderer, tracker-taxonomy-drift).
//   G1b (negative): no module still holds the textContent -> innerHTML return
//       idiom, in either the plain or the `if (d) { ... }` shape.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const UI = path.resolve(__dirname, "..", "..", "roadmap", "ui");

function moduleFiles() {
  const out = [];
  for (const dir of [UI, path.join(UI, "modules")]) {
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith(".js")) out.push(path.join(dir, name));
    }
  }
  return out;
}

/** Body text of the function or method that starts at `index` (brace matched). */
function bodyAt(src, index) {
  const open = src.indexOf("{", index);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

// `function esc(x) {`, `export function escHtml(x) {`, class method `esc(str) {`.
const HELPER = /^[ \t]*(?:export\s+)?(?:function\s+)?(esc|escHtml)\s*\(\s*\w*\s*\)\s*\{/gm;
// The return idiom: textContent assigned, then the same scope returns .innerHTML.
const IDIOM = /\.textContent\s*=\s*[^;]+;\s*return\s+\w+\.innerHTML\s*;/;

// A helper that does not delegate must itself map all five characters.
const FULL_MAP = ["&amp;", "&lt;", "&gt;", "&quot;"];
const isFull = (body) => FULL_MAP.every((e) => body.includes(e)) && /&#0?39;/.test(body);

test("G1a every module-local esc/escHtml delegates to escapeHtml or maps & < > \" '", () => {
  const offenders = [];
  let helpers = 0;
  for (const file of moduleFiles()) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(HELPER)) {
      helpers++;
      const body = bodyAt(src, m.index);
      if (!/\bescapeHtml\(/.test(body) && !isFull(body)) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${path.relative(UI, file)}:${line} ${m[1]}`);
      }
    }
  }
  assert.ok(helpers >= 20, `expected the Console's local helpers to be found (found ${helpers})`);
  assert.deepEqual(offenders, [], `helpers that do not delegate to escapeHtml:\n${offenders.join("\n")}`);
});

test("G1b no Console module returns innerHTML after assigning textContent", () => {
  const offenders = [];
  for (const file of moduleFiles()) {
    const src = fs.readFileSync(file, "utf8");
    if (IDIOM.test(src)) offenders.push(path.relative(UI, file));
  }
  assert.deepEqual(offenders, [], `quote-unsafe escape idiom still present in:\n${offenders.join("\n")}`);
});

test("G1b the idiom pattern matches both shapes and not the quote-safe roadmap.js form", () => {
  assert.ok(IDIOM.test("esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }"));
  assert.ok(IDIOM.test("if (d) { d.textContent = String(value); return d.innerHTML; }"));
  assert.ok(!IDIOM.test("div.textContent = String(value || '');\n    return div.innerHTML.replace(/\"/g, '&quot;');"));
  const roadmap = fs.readFileSync(path.join(UI, "roadmap.js"), "utf8");
  assert.ok(!IDIOM.test(roadmap), "roadmap.js's quote-safe escapeHtml is not matched");
});

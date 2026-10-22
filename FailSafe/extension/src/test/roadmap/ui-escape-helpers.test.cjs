"use strict";
// Lane E (plan-e-console-ui-xss LD8, audit fold 7, review fold 4) row G1: the
// browser-served Console carries no quote-unsafe escape helper. A helper built
// as `d.textContent = value; return d.innerHTML` escapes & < > but not quotes,
// so its output breaks out of a quoted attribute.
//
// Scope: every .js and .html file under src/roadmap/ui/ (vendor/ excluded):
// command-center.js, roadmap.js, legacy-roadmap.js, modules/*.js,
// command-center.html, index.html, tracker/tracker-dashboard.html (inline
// scripts included). Helpers: `function esc|escHtml(...)`, class methods
// `esc(...) {`, and arrow helpers `const|let|var esc|escHtml = (...) =>`.
//   G1a (positive): every helper delegates to the shared `escapeHtml`
//       (brainstorm-templates.js:4) or maps all of & < > " ' itself.
//   G1b (negative): no file holds the textContent -> innerHTML return idiom,
//       in the plain or the `if (d) { ... }` shape.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const UI = path.resolve(__dirname, "..", "..", "roadmap", "ui");

function uiFiles(dir = UI) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "vendor") out.push(...uiFiles(full));
    } else if (/\.(js|html)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Body of the helper whose definition ends at `end` (brace block or arrow expression). */
function bodyFrom(src, end) {
  const rest = src.slice(end);
  if (rest.trimStart().startsWith("{")) {
    const open = end + rest.indexOf("{");
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
    }
    return src.slice(open);
  }
  const stop = rest.search(/;\s*(\r?\n|$)/);
  return stop === -1 ? rest : rest.slice(0, stop + 1);
}

// function/method form (ends at the opening brace) and arrow form (ends after =>).
const HELPER_FN = /^[ \t]*(?:export\s+)?(?:function\s+)?(esc|escHtml)\s*\(\s*\w*\s*\)\s*(?=\{)/gm;
const HELPER_ARROW = /^[ \t]*(?:export\s+)?(?:const|let|var)\s+(esc|escHtml)\s*=\s*\(?\s*\w*\s*\)?\s*=>/gm;
// The return idiom: textContent assigned, then the same scope returns .innerHTML.
const IDIOM = /\.textContent\s*=\s*[^;]+;\s*return\s+\w+\.innerHTML\s*;/;
const FULL_MAP = ["&amp;", "&lt;", "&gt;", "&quot;"];
const isFull = (body) => FULL_MAP.every((e) => body.includes(e)) && /&#0?39;/.test(body);

/** `name:line` for every helper in `src` that neither delegates nor maps all five characters. */
function helperFindings(src) {
  const out = [];
  let count = 0;
  for (const re of [HELPER_FN, HELPER_ARROW]) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      count++;
      const body = bodyFrom(src, m.index + m[0].length);
      if (!/\bescapeHtml\(/.test(body) && !isFull(body)) {
        out.push(`${m[1]}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
  }
  return { count, out };
}

test("G1a every Console escape helper delegates to escapeHtml or maps & < > \" '", () => {
  const offenders = [];
  let helpers = 0;
  for (const file of uiFiles()) {
    const { count, out } = helperFindings(fs.readFileSync(file, "utf8"));
    helpers += count;
    for (const o of out) offenders.push(`${path.relative(UI, file)} ${o}`);
  }
  assert.ok(helpers >= 24, `expected the Console's local helpers to be found (found ${helpers})`);
  assert.deepEqual(offenders, [], `helpers that do not delegate to escapeHtml:\n${offenders.join("\n")}`);
});

test("G1b no Console file returns innerHTML after assigning textContent", () => {
  const files = uiFiles();
  assert.ok(files.some((f) => f.endsWith(".html")), "the .html UI files are scanned");
  const offenders = files.filter((f) => IDIOM.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(UI, f));
  assert.deepEqual(offenders, [], `quote-unsafe escape idiom still present in:\n${offenders.join("\n")}`);
});

test("G1 controls: the patterns catch every helper shape and spare the quote-safe roadmap.js form", () => {
  // The return idiom, plain and guarded.
  assert.ok(IDIOM.test("esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }"));
  assert.ok(IDIOM.test("if (d) { d.textContent = String(value); return d.innerHTML; }"));
  assert.ok(!IDIOM.test("div.textContent = String(value || '');\n    return div.innerHTML.replace(/\"/g, '&quot;');"));
  assert.ok(!IDIOM.test(fs.readFileSync(path.join(UI, "roadmap.js"), "utf8")), "roadmap.js's quote-safe escapeHtml is not matched");
  // Arrow helpers: an idiom block body, a quote-incomplete expression body, and the fixed forms.
  const arrowIdiom = "const esc = (v) => { const d = document.createElement('div'); d.textContent = v; return d.innerHTML; };\n";
  assert.deepEqual(helperFindings(arrowIdiom).out, ["esc:1"]);
  assert.ok(IDIOM.test(arrowIdiom));
  const arrowPartial = 'const esc = (s) => String(s == null ? "" : s)\n  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");\n';
  assert.deepEqual(helperFindings(arrowPartial).out, ["esc:1"]);
  assert.deepEqual(helperFindings("const esc = (value) => escapeHtml(value ?? '');\n").out, []);
  assert.deepEqual(helperFindings("function esc(value) {\n  return escapeHtml(value ?? '');\n}\n").out, []);
  assert.deepEqual(helperFindings("export function escHtml(str) {\n  const d = document.createElement('div');\n  d.textContent = str;\n  return d.innerHTML;\n}\n").out, ["escHtml:1"]);
});

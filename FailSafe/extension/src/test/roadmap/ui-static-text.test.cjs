// Static Console/Monitor HTML must not show JavaScript string escapes as text. The Monitor footer
// read `provided \"as is\"` (literal backslashes, on screen) from v3.5.2 until this check.
// The HTML is parsed with jsdom, not regex-stripped: what matters is what the browser renders
// (text nodes and attribute values), and script/style contents are not rendered text.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const UI_DIR = path.resolve(__dirname, "../../roadmap/ui");

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "vendor" ? [] : htmlFiles(p);
    return e.name.endsWith(".html") ? [p] : [];
  });
}

/** Rendered text and attribute values of a document, excluding <script>, <style> and <template> contents. */
function renderedStrings(html) {
  const { document, NodeFilter } = new JSDOM(html).window;
  const skip = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);
  const out = [];
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.currentNode; node; node = walker.nextNode()) {
    if (node.nodeType === 3) {
      if (!skip.has(node.parentElement?.tagName)) out.push(node.nodeValue);
    } else if (!skip.has(node.tagName)) {
      for (const attr of node.attributes) out.push(attr.value);
    }
  }
  return out;
}

test("no static UI HTML renders an escaped quote (\\\") as visible text", () => {
  const files = htmlFiles(UI_DIR);
  assert.ok(files.length > 0, "found the UI HTML files");
  const offenders = [];
  for (const file of files) {
    for (const s of renderedStrings(fs.readFileSync(file, "utf8"))) {
      if (s.includes('\\"')) offenders.push(`${path.relative(UI_DIR, file)}: ${s.trim().slice(0, 120)}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("the check sees an escaped quote in rendered text but not inside a script", () => {
  const flagged = renderedStrings('<p>provided \\"as is\\"</p><script>const s = "\\"ok\\"";</script>');
  assert.ok(flagged.some((s) => s.includes('\\"as is')), "text node is checked");
  assert.ok(!flagged.some((s) => s.includes('\\"ok')), "script content is not rendered text");
});

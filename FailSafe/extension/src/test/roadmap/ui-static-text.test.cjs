// Static Console/Monitor HTML must not show JavaScript string escapes as text. The Monitor footer
// read `provided \"as is\"` (literal backslashes, on screen) from v3.5.2 until this check.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const UI_DIR = path.resolve(__dirname, "../../roadmap/ui");

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "vendor" ? [] : htmlFiles(p);
    return e.name.endsWith(".html") ? [p] : [];
  });
}

/** Markup outside <script> and <style> blocks, i.e. what the browser treats as HTML. */
function markupOnly(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
}

test("no static UI HTML renders an escaped quote (\\\") as visible text", () => {
  const files = htmlFiles(UI_DIR);
  assert.ok(files.length > 0, "found the UI HTML files");
  const offenders = [];
  for (const file of files) {
    markupOnly(fs.readFileSync(file, "utf8")).split(/\r?\n/).forEach((line, i) => {
      if (line.includes('\\"')) offenders.push(`${path.relative(UI_DIR, file)}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

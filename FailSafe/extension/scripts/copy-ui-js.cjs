// Copy .js UI module files from src/ to out/ after tsc compile.
// tsc doesn't emit raw .js files even when included; tests that import
// .js ES modules (e.g. install-skills-progress, brainstorm-canvas) need
// the compiled output mirrored to out/ for runtime resolution.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "out");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "vendor") continue;
      out.push(...walk(full));
    } else if (entry.isFile() && (
      entry.name.endsWith(".js")
      // B190: also mirror governance contract JSON Schema files so tests +
      // future runtime loaders can read them from out/contracts/*.json.
      || (entry.name.endsWith(".json") && full.replace(/\\/g, "/").includes("/contracts/"))
    )) {
      out.push(full);
    }
  }
  return out;
}

if (!fs.existsSync(SRC)) {
  console.error(`copy-ui-js: source dir missing: ${SRC}`);
  process.exit(1);
}

let copied = 0;
for (const src of walk(SRC)) {
  const rel = path.relative(SRC, src);
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  copied += 1;
}
console.log(`copy-ui-js: mirrored ${copied} .js file(s) src/ → out/`);

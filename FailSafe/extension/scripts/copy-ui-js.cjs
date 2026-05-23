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

// Educational Component (v5.2.0): emit BROWSER-ESM builds of the education
// modules. `out/education/*.js` is tsc's CommonJS output — required by the
// extension's CJS code (FirstRunModePicker, educationConfig) and consumed
// fine by jsdom tests via Node's CJS<->ESM interop. The webview affordances
// (`roadmap/ui/modules/education-lesson.js`, `guided-dev-cycle.js`), however,
// run in a real browser with NO CJS interop, so they need actual
// `export`-bearing ESM modules. esbuild emits those into out/education-browser/,
// which ConsoleRouteRegistrar (and the serveCompactUI test helper) mount at
// the /education URL. bundle:true inlines sibling imports (e.g. lessons.ts →
// glossary-content*.ts) so each emitted module is self-contained.
try {
  const esbuild = require("esbuild");
  for (const eduName of ["lessons", "lessonTriggers"]) {
    const browserEntry = path.join(SRC, "education", `${eduName}.ts`);
    if (!fs.existsSync(browserEntry)) continue;
    const browserOut = path.join(OUT, "education-browser", `${eduName}.js`);
    fs.mkdirSync(path.dirname(browserOut), { recursive: true });
    esbuild.buildSync({
      entryPoints: [browserEntry],
      outfile: browserOut,
      format: "esm",
      bundle: true,
      platform: "browser",
    });
    console.log(`copy-ui-js: emitted browser-ESM education/${eduName}.js → out/education-browser/`);
  }
} catch (e) {
  console.error(`copy-ui-js: browser-ESM education build skipped: ${e && e.message}`);
}

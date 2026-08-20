/**
 * release-gate.cjs — Local release validation and version management.
 *
 * Exports:
 *   bumpVersion(version, level) — returns new version string
 *   preflight(version, extDir, rootDir) — returns { pass, checks[] }
 *
 * CLI:
 *   node release-gate.cjs --preflight
 *   node release-gate.cjs --bump <patch|minor|major>
 *   node release-gate.cjs --tag
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Pure functions (exported for testing) ──────────────────────────

function bumpVersion(version, level) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Invalid version format: ${version}`);
  let [, major, minor, patch] = match.map(Number);
  switch (level) {
    case "major":
      major++;
      minor = 0;
      patch = 0;
      break;
    case "minor":
      minor++;
      patch = 0;
      break;
    case "patch":
      patch++;
      break;
    default:
      throw new Error(`Invalid bump level: ${level}`);
  }
  return `${major}.${minor}.${patch}`;
}

function preflight(version, extDir, rootDir) {
  const checks = [];

  // 1. CHANGELOG entry
  const clPath = path.join(extDir, "CHANGELOG.md");
  const clContent = fs.existsSync(clPath) ? fs.readFileSync(clPath, "utf8") : "";
  checks.push({
    name: "changelog-entry",
    pass: clContent.includes(`## [${version}]`),
    message: `CHANGELOG.md contains ## [${version}]`,
  });

  // 2. README release marker
  const rmPath = path.join(extDir, "README.md");
  const rmContent = fs.existsSync(rmPath) ? fs.readFileSync(rmPath, "utf8") : "";
  checks.push({
    name: "readme-release-marker",
    pass: rmContent.includes(version),
    message: `README.md contains version ${version}`,
  });

  // 2b. README What's-New section (SG 2026-08-20: the v6.0.1 train shipped
  // without this heading and only CI's validate-vsix caught it; the same
  // assertion must fail here, at the [RELEASE] commit hook, first).
  checks.push({
    name: "readme-whats-new",
    pass: rmContent.includes(`## What's New in v${version}`),
    message: `README.md contains ## What's New in v${version}`,
  });

  // 3. Root CHANGELOG entry
  const rcPath = path.join(rootDir, "CHANGELOG.md");
  const rcContent = fs.existsSync(rcPath) ? fs.readFileSync(rcPath, "utf8") : "";
  checks.push({
    name: "root-changelog-entry",
    pass: rcContent.includes(`## [${version}]`),
    message: `Root CHANGELOG.md contains ## [${version}]`,
  });

  // 4. COMPONENT_HELP version marker (B108)
  const chPath = path.join(extDir, "docs", "COMPONENT_HELP.md");
  const chContent = fs.existsSync(chPath) ? fs.readFileSync(chPath, "utf8") : "";
  checks.push({
    name: "component-help-version",
    pass: chContent.includes(`v${version}`),
    message: `COMPONENT_HELP.md contains v${version}`,
  });

  // 5. PROCESS_GUIDE version marker (B108)
  const pgPath = path.join(extDir, "docs", "PROCESS_GUIDE.md");
  const pgContent = fs.existsSync(pgPath) ? fs.readFileSync(pgPath, "utf8") : "";
  checks.push({
    name: "process-guide-version",
    pass: pgContent.includes(`v${version}`),
    message: `PROCESS_GUIDE.md contains v${version}`,
  });

  // 6. Backlog duplicate B-items (B139)
  const blPath = path.join(rootDir, "docs", "BACKLOG.md");
  const blContent = fs.existsSync(blPath) ? fs.readFileSync(blPath, "utf8") : "";
  const bNums = [];
  for (const m of blContent.matchAll(/\[B(\d+)\]/g)) bNums.push(m[1]);
  const dupes = bNums.filter((n, i) => bNums.indexOf(n) !== i);
  checks.push({
    name: "backlog-no-duplicates",
    pass: dupes.length === 0,
    message: dupes.length
      ? `Duplicate B-items: ${[...new Set(dupes)].map((n) => "B" + n).join(", ")}`
      : "No duplicate B-items",
  });

  // 7. Backlog version summary current (B139)
  const summarySection = blContent.match(/## Version Summary[\s\S]*?(?=\n---)/);
  checks.push({
    name: "backlog-version-summary",
    pass: summarySection ? summarySection[0].includes(version) : false,
    message: `BACKLOG.md version summary includes ${version}`,
  });

  const allPass = checks.every((c) => c.pass);
  return { pass: allPass, checks };
}

// ── Exports ────────────────────────────────────────────────────────

module.exports = { bumpVersion, preflight };

// ── CLI entrypoint ─────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const extDir = path.resolve(__dirname, "..");
  const rootDir = path.resolve(__dirname, "../../..");

  if (args.includes("--preflight")) {
    const pkg = JSON.parse(fs.readFileSync(path.join(extDir, "package.json"), "utf8"));
    const result = preflight(pkg.version, extDir, rootDir);
    for (const c of result.checks) {
      console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.message}`);
    }
    if (result.pass) {
      console.log(`[PASS] Source release metadata validated: v${pkg.version} (${new Date().toISOString().slice(0, 10)})`);
    }
    process.exit(result.pass ? 0 : 1);
  }

  if (args.includes("--bump")) {
    const level = args[args.indexOf("--bump") + 1];
    const pkgPath = path.join(extDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const oldVersion = pkg.version;
    const newVersion = bumpVersion(oldVersion, level);
    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`v${oldVersion} → v${newVersion} (${level} bump)`);
    process.exit(0);
  }

  if (args.includes("--tag")) {
    const pkg = JSON.parse(fs.readFileSync(path.join(extDir, "package.json"), "utf8"));
    const result = preflight(pkg.version, extDir, rootDir);
    if (!result.pass) {
      console.error("[FAIL] Preflight failed — cannot tag.");
      for (const c of result.checks.filter((c) => !c.pass)) {
        console.error(`  - ${c.message}`);
      }
      process.exit(1);
    }
    const tag = `v${pkg.version}`;
    execSync(`git tag -a ${tag} -m "${tag}"`, { stdio: "inherit" });
    console.log(`[TAG] Created annotated tag: ${tag}`);
    process.exit(0);
  }

  console.error("Usage: node release-gate.cjs --preflight | --bump <level> | --tag");
  process.exit(1);
}

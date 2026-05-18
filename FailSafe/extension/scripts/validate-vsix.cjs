const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    fail(result.stderr.trim() || `${command} ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function canRun(command, args = ["--help"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return !result.error;
}

function resolveVsixPath(explicit, expectedVersion) {
  if (explicit) {
    const resolved = path.resolve(process.cwd(), explicit);
    if (fs.existsSync(resolved)) {
      return resolved;
    }

    const basename = path.basename(explicit);
    const strippedV = basename.replace(/-v(\d+\.\d+\.\d+(?:[-+][^.]*)?(?:\.[^.]+)*)\.vsix$/i, "-$1.vsix");
    if (strippedV !== basename) {
      const fallback = path.resolve(process.cwd(), path.join(path.dirname(explicit), strippedV));
      if (fs.existsSync(fallback)) {
        return fallback;
      }
    }

    return resolved;
  }

  const files = fs
    .readdirSync(root)
    .filter((name) => name.endsWith(".vsix"))
    .map((name) => path.join(root, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (files.length === 0) {
    fail("No VSIX found. Pass a path or run packaging first.");
  }

  if (expectedVersion) {
    const exactName = `mythologiq-failsafe-${expectedVersion}.vsix`;
    const exactMatch = files.find((filePath) => path.basename(filePath) === exactName);
    if (exactMatch) {
      return exactMatch;
    }
  }

  return files[0];
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    fail(`${label} missing: ${needle}`);
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Unable to parse JSON at ${filePath}: ${error.message}`);
  }
}

function extractLatestRelease(changelogText) {
  const releaseMatch = changelogText.match(/^## \[(?!Unreleased\])([^\]]+)\] - (\d{4}-\d{2}-\d{2})$/m);
  if (!releaseMatch) {
    fail("Unable to determine latest release from CHANGELOG.md. Expected heading like '## [x.y.z] - YYYY-MM-DD'.");
  }
  return { version: releaseMatch[1], date: releaseMatch[2] };
}

function createArchiveReader(vsixPath) {
  if (canRun("unzip")) {
    return {
      list: () => runCommand("unzip", ["-Z1", vsixPath]),
      read: (entry) => runCommand("unzip", ["-p", vsixPath, entry]),
    };
  }

  return {
    list: () => runCommand("tar", ["-tf", vsixPath]),
    read: (entry) => runCommand("tar", ["-xOf", vsixPath, entry]),
  };
}

function main() {
  const args = process.argv.slice(2);
  const sourceOnly = args.includes("--source-only");
  const explicitVsix = args.find((arg) => !arg.startsWith("-"));

  const sourcePkg = readJson(path.join(root, "package.json"));
  const sourceReadme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const sourceChangelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const latestRelease = extractLatestRelease(sourceChangelog);

  if (sourcePkg.version !== latestRelease.version) {
    fail(
      `Version mismatch between package.json (${sourcePkg.version}) and latest CHANGELOG release (${latestRelease.version}).`
    );
  }

  assertIncludes(
    sourceReadme,
    `**Current Release**: v${sourcePkg.version} (${latestRelease.date})`,
    "Source README release marker"
  );
  assertIncludes(sourceReadme, `## What's New in v${sourcePkg.version}`, "Source README release notes heading");
  // Validate all icon references in package.json resolve to real files
  const iconErrors = [];
  function checkIcon(label, iconPath) {
    if (!iconPath) return;
    if (!fs.existsSync(path.resolve(root, iconPath))) {
      iconErrors.push(`${label}: ${iconPath}`);
    }
  }
  checkIcon("Extension icon", sourcePkg.icon);
  (sourcePkg.contributes?.viewsContainers?.activitybar || []).forEach((c) =>
    checkIcon(`Activity bar "${c.title}"`, c.icon)
  );
  Object.values(sourcePkg.contributes?.views || {}).forEach((viewList) =>
    viewList.forEach((v) => checkIcon(`View "${v.name}"`, v.icon))
  );
  if (iconErrors.length) {
    fail("Missing icon files referenced in package.json:\n  " + iconErrors.join("\n  "));
  }

  console.log(`[PASS] Source release metadata validated: v${sourcePkg.version} (${latestRelease.date})`);

  if (sourceOnly) {
    return;
  }

  const vsixPath = resolveVsixPath(explicitVsix, sourcePkg.version);
  if (!fs.existsSync(vsixPath)) {
    fail(`VSIX not found: ${vsixPath}`);
  }

  const archive = createArchiveReader(vsixPath);
  const list = archive.list();
  [
    "extension.vsixmanifest",
    "extension/package.json",
    "extension/README.md",
    "extension/CHANGELOG.md",
    "extension/docs/COMPONENT_HELP.md",
    "extension/docs/PROCESS_GUIDE.md",
    "extension/dist/extension/main.js",
    "extension/dist/extension/ui/index.html",
    "extension/dist/extension/ui/command-center.html",
    "extension/dist/extension/ui/command-center.js",
    "extension/dist/extension/ui/command-center.css",
  ].forEach((entry) => assertIncludes(list, entry, "Archive entry"));

  const packagedPkg = JSON.parse(archive.read("extension/package.json"));
  if (packagedPkg.version !== sourcePkg.version) {
    fail(`Packaged package.json version mismatch: expected ${sourcePkg.version}, found ${packagedPkg.version}`);
  }
  if (packagedPkg.main !== "./dist/extension/main.js") {
    fail(`Packaged package.json main mismatch: expected ./dist/extension/main.js, found ${packagedPkg.main}`);
  }
  const packagedCommands = JSON.stringify(packagedPkg.contributes?.commands ?? []);
  assertIncludes(packagedCommands, `"failsafe.installCommitHook"`, "Packaged command");
  assertIncludes(packagedCommands, `"failsafe.removeCommitHook"`, "Packaged command");

  const manifest = archive.read("extension.vsixmanifest");
  assertIncludes(manifest, `Version="${sourcePkg.version}"`, "VSIX manifest version");
  assertIncludes(manifest, `DisplayName>${sourcePkg.displayName}<`, "VSIX display name");

  const readme = archive.read("extension/README.md");
  assertIncludes(
    readme,
    `**Current Release**: v${sourcePkg.version} (${latestRelease.date})`,
    "Packaged README release marker"
  );
  assertIncludes(readme, `## What's New in v${sourcePkg.version}`, "Packaged README release notes");

  const changelog = archive.read("extension/CHANGELOG.md");
  assertIncludes(changelog, `## [${sourcePkg.version}] - ${latestRelease.date}`, "Packaged changelog release entry");

  // B195 acceptance gate — VSIX size ceiling. Plan: docs/plan-qor-voice-substrate-extraction.md Phase 4.
  assertVsixUnderCeiling(vsixPath, 30 * 1024 * 1024);

  console.log(`[PASS] VSIX validated: ${vsixPath}`);
}

/**
 * Assert the produced VSIX is under the given ceiling. Defaults to 30 MB to
 * close B195. Pure size check on the produced file; runs after the existing
 * archive content validations.
 */
function assertVsixUnderCeiling(vsixPath, ceilingBytes) {
  const stat = fs.statSync(vsixPath);
  if (stat.size > ceilingBytes) {
    const mb = (stat.size / (1024 * 1024)).toFixed(2);
    const ceilingMb = (ceilingBytes / (1024 * 1024)).toFixed(0);
    throw new Error(`VSIX size ${mb} MB exceeds ${ceilingMb} MB ceiling (B195)`);
  }
}

module.exports = { assertVsixUnderCeiling };

if (require.main === module) {
  main();
}

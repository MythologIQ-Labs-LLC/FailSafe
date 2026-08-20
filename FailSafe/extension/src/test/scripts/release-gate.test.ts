import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";

/**
 * Inline extraction of pure functions from release-gate.cjs for unit testing.
 * We require the module and test its exported functions directly.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const releaseGate = require(path.join(__dirname, "../../../scripts/release-gate.cjs"));

suite("release-gate: bumpVersion", () => {
  test("patch increment", () => {
    assert.strictEqual(releaseGate.bumpVersion("1.0.0", "patch"), "1.0.1");
  });

  test("minor increment resets patch", () => {
    assert.strictEqual(releaseGate.bumpVersion("1.2.3", "minor"), "1.3.0");
  });

  test("major increment resets minor and patch", () => {
    assert.strictEqual(releaseGate.bumpVersion("2.5.9", "major"), "3.0.0");
  });

  test("handles zero version", () => {
    assert.strictEqual(releaseGate.bumpVersion("0.0.0", "patch"), "0.0.1");
  });

  test("throws on invalid level", () => {
    assert.throws(
      () => releaseGate.bumpVersion("1.0.0", "prerelease"),
      /Invalid bump level/,
    );
  });

  test("throws on invalid version format", () => {
    assert.throws(
      () => releaseGate.bumpVersion("not-a-version", "patch"),
      /Invalid version format/,
    );
  });
});

suite("release-gate: preflight", function () {
  this.timeout(10000);
  const fixtureDir = path.join(__dirname, "__fixtures__", "release-gate");

  function writeFixture(
    version: string,
    opts: { changelog?: string; readme?: string; rootChangelog?: string } = {},
  ) {
    const dir = fs.mkdtempSync(path.join(fixtureDir, "test-"));
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ version }, null, 2),
    );
    const date = "2026-03-07";
    fs.writeFileSync(
      path.join(dir, "CHANGELOG.md"),
      opts.changelog ??
        `## [${version}] - ${date}\n\n### Added\n- Feature`,
    );
    fs.writeFileSync(
      path.join(dir, "README.md"),
      opts.readme ??
        `**Current Release**: v${version} (${date})\n\n## What's New in v${version}\n\nStuff`,
    );
    // docs/ subfolder for component-help and process-guide checks (B108)
    const docsDir = path.join(dir, "docs");
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(
      path.join(docsDir, "COMPONENT_HELP.md"),
      `# Component Help\n\nAudience: operators using v${version}.`,
    );
    fs.writeFileSync(
      path.join(docsDir, "PROCESS_GUIDE.md"),
      `# Process Guide\n\nAccurate workflows for v${version}.`,
    );
    const rootDir = path.join(dir, ".root");
    fs.mkdirSync(rootDir, { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, "CHANGELOG.md"),
      opts.rootChangelog ??
        `## [${version}]\n\n### Summary\n- Release`,
    );
    // docs/BACKLOG.md with version summary (B139)
    const rootDocsDir = path.join(rootDir, "docs");
    fs.mkdirSync(rootDocsDir, { recursive: true });
    fs.writeFileSync(
      path.join(rootDocsDir, "BACKLOG.md"),
      `## Version Summary\n\n| Version | Status |\n| --- | --- |\n| ${version} | Released |\n\n---\n`,
    );
    return { dir, rootDir };
  }

  suiteSetup(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });
  });

  suiteTeardown(function () {
    this.timeout(5000);
    try {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    } catch {
      // Windows may hold brief locks on temp dirs; swallow cleanup errors
    }
  });

  test("all checks pass for valid fixture", () => {
    const { dir, rootDir } = writeFixture("4.5.0");
    const result = releaseGate.preflight("4.5.0", dir, rootDir);
    const failing = result.checks.filter((c: { pass: boolean }) => !c.pass);
    assert.strictEqual(failing.length, 0, JSON.stringify(failing, null, 2));
  });

  test("detects missing CHANGELOG entry", () => {
    const { dir, rootDir } = writeFixture("4.5.0", {
      changelog: "## [4.4.0] - 2026-03-01\n\nOld entry",
    });
    const result = releaseGate.preflight("4.5.0", dir, rootDir);
    const cl = result.checks.find(
      (c: { name: string }) => c.name === "changelog-entry",
    );
    assert.strictEqual(cl.pass, false);
  });

  test("detects missing README release marker", () => {
    const { dir, rootDir } = writeFixture("4.5.0", {
      readme: "# Extension\n\nNo version info here",
    });
    const result = releaseGate.preflight("4.5.0", dir, rootDir);
    const rm = result.checks.find(
      (c: { name: string }) => c.name === "readme-release-marker",
    );
    assert.strictEqual(rm.pass, false);
  });

  test("FX916/SG-2026-08-20: detects missing README What's-New section (mirrors validate-vsix)", () => {
    // The v6.0.1 train shipped without this heading and only CI's
    // validate-vsix caught it; the preflight (run by the [RELEASE]
    // commit-msg hook) must now fail the same way, locally and earlier.
    const { dir, rootDir } = writeFixture("4.5.0", {
      readme: "**Current Release**: v4.5.0 (2026-03-07)\n\nNo release notes section here",
    });
    const result = releaseGate.preflight("4.5.0", dir, rootDir);
    const wn = result.checks.find(
      (c: { name: string }) => c.name === "readme-whats-new",
    );
    assert.ok(wn, "preflight must include a readme-whats-new check");
    assert.strictEqual(wn.pass, false, "missing What's-New heading must fail preflight");
    assert.strictEqual(result.pass, false);
  });

  test("detects missing root CHANGELOG entry", () => {
    const { dir, rootDir } = writeFixture("4.5.0", {
      rootChangelog: "## [4.4.0]\n\nOld root entry",
    });
    const result = releaseGate.preflight("4.5.0", dir, rootDir);
    const rc = result.checks.find(
      (c: { name: string }) => c.name === "root-changelog-entry",
    );
    assert.strictEqual(rc.pass, false);
  });
});

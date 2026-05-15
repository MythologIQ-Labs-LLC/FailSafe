/**
 * FX359 - Skill provenance metadata enforcement. F244 claims SKILL.md
 * frontmatter includes creator, source repo/path, source type. The
 * pre-existing Antigravity test only checks name + description and silently
 * skips. This test enumerates `.claude/skills/`, validates the full schema,
 * falls back to a fixture if absent, and never skips.
 */
import { describe, it } from "mocha";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { collectMarkdownFiles } from "../../roadmap/services/SkillFileUtils";
import { readFrontmatterValue } from "../../roadmap/services/SkillFrontmatter";

// From compiled out/test/roadmap/ -> .., .., .., .., .., => repo root
const REPO_CLAUDE_SKILLS = path.resolve(
  __dirname, "..", "..", "..", "..", "..", ".claude", "skills",
);

const FIXTURE_SKILL_MD = [
  "---",
  "name: qor-fixture",
  "description: >-",
  "  Fixture skill used when .claude/skills/ is not present on disk.",
  "metadata:",
  "  category: governance",
  "  author: MythologIQ",
  "  source:",
  "    repository: https://github.com/MythologIQ/Qor-logic",
  "    path: qor/skills/governance/qor-fixture",
  "phase: audit",
  "---",
  "# fixture",
].join("\n");

interface FrontmatterCheck {
  basename: string;
  fm: string;
}

function extractFrontmatter(content: string): string | null {
  const m = content.match(/^---\s*([\s\S]*?)\s*---/);
  return m ? m[1] : null;
}

function readNestedValue(fm: string, dottedKey: string): string {
  // Try flat key first (e.g. `metadata.author` on one line — rare).
  const flat = readFrontmatterValue(fm, dottedKey);
  if (flat) return flat;
  // Otherwise walk indented YAML lines.
  const segments = dottedKey.split(".");
  let lines = fm.split(/\r?\n/);
  let indent = -1;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const re = new RegExp(`^(\\s*)${seg}\\s*:\\s*(.*)$`);
    let found = -1;
    for (let j = 0; j < lines.length; j++) {
      const m = lines[j].match(re);
      if (!m) continue;
      if (indent >= 0 && m[1].length <= indent) continue;
      found = j;
      indent = m[1].length;
      if (i === segments.length - 1) {
        return (m[2] || "").trim().replace(/^['"]|['"]$/g, "");
      }
      break;
    }
    if (found < 0) return "";
    lines = lines.slice(found + 1);
  }
  return "";
}

function isGovernanceSkill(_basename: string, fm: string): boolean {
  // Provenance enforcement targets skills that have OPTED IN to the
  // `metadata:` block schema. A skill that declares a `metadata:` key in its
  // frontmatter is asserting F244 compliance and MUST fill the full schema.
  // Skills without a `metadata:` block (legacy / reference / third-party docs
  // like threejs-*) are out of scope here — covered by the basic frontmatter
  // test in skill-frontmatter-validation.test.ts.
  return /^\s*metadata\s*:/m.test(fm);
}

function buildChecks(): FrontmatterCheck[] {
  const out: FrontmatterCheck[] = [];
  if (!fs.existsSync(REPO_CLAUDE_SKILLS)) {
    out.push({ basename: "fixture-SKILL.md", fm: extractFrontmatter(FIXTURE_SKILL_MD) || "" });
    return out;
  }
  return out;
}

describe("FX359 - Skill provenance metadata schema", () => {
  it("every governance skill in .claude/skills/ carries full provenance", async function () {
    this.timeout(15000);

    const checks: FrontmatterCheck[] = [];
    let usedFixture = false;

    if (fs.existsSync(REPO_CLAUDE_SKILLS)) {
      const files = await collectMarkdownFiles(REPO_CLAUDE_SKILLS);
      assert.ok(
        files.length > 0,
        `No SKILL.md files found under ${REPO_CLAUDE_SKILLS}`,
      );
      for (const filePath of files) {
        // Only enforce on top-level SKILL.md (skill root), not references/*.md.
        if (path.basename(filePath) !== "SKILL.md") continue;
        const content = fs.readFileSync(filePath, "utf8");
        const fm = extractFrontmatter(content);
        if (!fm) continue;
        const basename = path.basename(path.dirname(filePath));
        checks.push({ basename, fm });
      }
    } else {
      usedFixture = true;
      checks.push(...buildChecks());
    }

    assert.ok(
      checks.length > 0,
      "no skill frontmatter blocks to validate (neither directory nor fixture)",
    );

    let governanceCount = 0;
    const failures: string[] = [];

    for (const { basename, fm } of checks) {
      if (!isGovernanceSkill(basename, fm)) continue;
      governanceCount++;

      const name = readFrontmatterValue(fm, "name");
      if (!name) failures.push(`${basename}: missing 'name'`);

      const desc = readFrontmatterValue(fm, "description");
      if (!desc) failures.push(`${basename}: missing 'description'`);

      // F244 provenance schema. Per the F244 claim, each of {creator, source
      // repo/path, source type} must resolve from frontmatter. The canonical
      // location is `metadata.*`, but legacy skills place these at the
      // top level — both are accepted, missing is rejected.
      const creator =
        readNestedValue(fm, "metadata.author") ||
        readFrontmatterValue(fm, "creator") ||
        readFrontmatterValue(fm, "author");
      if (!creator) {
        failures.push(`${basename}: missing creator ('metadata.author' or 'creator')`);
      }

      const repo =
        readNestedValue(fm, "metadata.source.repository") ||
        readFrontmatterValue(fm, "source_repo");
      if (repo && !/^https?:\/\//.test(repo)) {
        failures.push(`${basename}: source repository must be a URL, got '${repo}'`);
      }

      const sourcePath =
        readNestedValue(fm, "metadata.source.path") ||
        readFrontmatterValue(fm, "source_path");
      if (!repo && !sourcePath) {
        failures.push(
          `${basename}: missing source repo/path ('metadata.source.repository' or 'metadata.source.path' or 'source_repo'/'source_path')`,
        );
      }

      const category =
        readNestedValue(fm, "metadata.category") ||
        readFrontmatterValue(fm, "source_type") ||
        readFrontmatterValue(fm, "category");
      if (!category) {
        failures.push(`${basename}: missing source type ('metadata.category' or 'source_type')`);
      }

      // `phase` declares relevance phase — the version-pin proxy at frontmatter
      // tier (full semver pins live in SOURCE.yml; here we enforce the phase
      // anchor that ties a governance skill to a SHIELD lifecycle stage).
      const phase = readFrontmatterValue(fm, "phase");
      if (!phase) {
        failures.push(`${basename}: missing 'phase' (lifecycle pin)`);
      }
    }

    assert.ok(
      governanceCount > 0,
      usedFixture
        ? "fixture did not exercise a governance-class skill"
        : "no governance-class (qor-*) skills found under .claude/skills/",
    );

    assert.deepStrictEqual(
      failures,
      [],
      `FX359 provenance violations (${failures.length}):\n  - ${failures.join("\n  - ")}`,
    );
  });

  it("readNestedValue correctly walks YAML indentation", () => {
    const fm = [
      "name: x",
      "metadata:",
      "  author: MythologIQ",
      "  source:",
      "    repository: https://example.test/repo",
      "    path: skills/x",
    ].join("\n");
    assert.strictEqual(readNestedValue(fm, "metadata.author"), "MythologIQ");
    assert.strictEqual(
      readNestedValue(fm, "metadata.source.repository"),
      "https://example.test/repo",
    );
    assert.strictEqual(readNestedValue(fm, "metadata.source.path"), "skills/x");
    assert.strictEqual(readNestedValue(fm, "metadata.missing"), "");
  });

  it("fixture exercises the full provenance schema (negative + positive)", () => {
    const fm = extractFrontmatter(FIXTURE_SKILL_MD);
    assert.ok(fm, "fixture must yield frontmatter");
    assert.ok(readFrontmatterValue(fm!, "name"), "fixture name");
    assert.ok(readFrontmatterValue(fm!, "description"), "fixture description");
    assert.ok(readNestedValue(fm!, "metadata.author"), "fixture author");
    assert.ok(
      readNestedValue(fm!, "metadata.source.repository"),
      "fixture repo",
    );
    assert.ok(readNestedValue(fm!, "metadata.source.path"), "fixture path");
    assert.ok(readNestedValue(fm!, "metadata.category"), "fixture category");
    assert.ok(readFrontmatterValue(fm!, "phase"), "fixture phase");

    const stripped = FIXTURE_SKILL_MD.replace(/^\s*author:.*$/m, "");
    const fm2 = extractFrontmatter(stripped)!;
    assert.strictEqual(
      readNestedValue(fm2, "metadata.author"),
      "",
      "removing author must be detected",
    );
  });
});

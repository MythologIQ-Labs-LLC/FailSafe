import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  detectArchetype,
  buildProposals,
  executeProposals,
} from "../../extension/organizeWorkspace";

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-organize-test-"));
}

function touch(root: string, rel: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, "");
}

suite("organizeWorkspace", () => {
  let root: string;

  setup(() => { root = tmpWorkspace(); });
  teardown(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test("detects ai-workspace archetype when .claude/ and .failsafe/ exist", () => {
    fs.mkdirSync(path.join(root, ".claude"));
    fs.mkdirSync(path.join(root, ".failsafe"));
    assert.strictEqual(detectArchetype(root), "ai-workspace");
  });

  test("detects node-app archetype when package.json exists at root", () => {
    touch(root, "package.json");
    assert.strictEqual(detectArchetype(root), "node-app");
  });

  test("proposes moving stale plan-e*.md files from root", () => {
    touch(root, "plan-e7-foo.md");
    const proposals = buildProposals(root);
    const move = proposals.find((p) => p.label.includes("plan-e7-foo.md"));
    assert.ok(move, "expected a proposal for plan-e7-foo.md");
    assert.ok(move!.detail.includes("plan-e7-foo.md"));
    assert.ok(["high", "medium", "low"].includes(move!.priority));
  });

  test("does not propose moving plan-e2e-*.md (legitimate e2e test plans)", () => {
    touch(root, "plan-e2e-checkout-flow.md");
    const proposals = buildProposals(root);
    assert.ok(
      !proposals.some((p) => p.label.toLowerCase().includes("plan-e2e")),
      "e2e plan files must not be treated as stale debris",
    );
  });

  test("proposes creating .failsafe/governance/plans when missing", () => {
    const proposals = buildProposals(root);
    assert.ok(proposals.some((p) => p.label.includes(".failsafe/governance/plans")));
  });

  test("does not propose moving protected paths", () => {
    for (const d of [".claude", ".agent", ".qor", ".failsafe"]) fs.mkdirSync(path.join(root, d));
    const proposals = buildProposals(root);
    for (const p of proposals) {
      const lower = p.label.toLowerCase();
      const touchesProtected =
        (lower.startsWith("move") || lower.startsWith("delete") || lower.startsWith("remove")) &&
        /\.claude|\.agent|\.qor\b|\.failsafe[^/]/.test(lower);
      assert.ok(!touchesProtected, `proposal must not target protected path: ${p.label}`);
    }
  });

  test("proposes .gitignore privacy patterns when .claude/ is present and pattern is missing", () => {
    fs.mkdirSync(path.join(root, ".claude"));
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n");
    const withMissing = buildProposals(root);
    assert.ok(withMissing.some((p) => p.description === "privacy"), "expected privacy proposal");

    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n.claude/\n");
    const withoutMissing = buildProposals(root);
    assert.ok(!withoutMissing.some((p) => p.description === "privacy"), "expected no privacy proposal");
  });

  test("empty workspace returns minimal proposals", () => {
    const proposals = buildProposals(root);
    assert.strictEqual(detectArchetype(root), "generic");
    assert.ok(proposals.length <= 3, `expected few proposals, got ${proposals.length}`);
  });

  test("execute approved proposals and report results", async () => {
    const proposals = buildProposals(root);
    const createDir = proposals.find((p) => p.label.includes(".failsafe/governance/plans"));
    assert.ok(createDir);
    const result = await executeProposals([createDir!]);
    assert.ok(fs.existsSync(path.join(root, ".failsafe", "governance", "plans")));
    assert.ok(result.executed.includes(createDir!.label));
    assert.strictEqual(result.skipped.length, 0);
  });
});

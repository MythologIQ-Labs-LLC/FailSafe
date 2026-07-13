import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { findTestRepoRoot } from "./test-repo-root";

suite("tracker test repository root", () => {
  test("finds a marked root from a nested directory independent of cwd", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-root-"));
    const nested = path.join(root, "a", "b", "c");
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.mkdirSync(path.join(root, "FailSafe", "extension"), { recursive: true });
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "FEATURE_INDEX.md"), "# index");
    fs.writeFileSync(path.join(root, "FailSafe", "extension", "package.json"), "{}");
    try {
      assert.strictEqual(findTestRepoRoot(nested), root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails after the bounded parent walk", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-root-miss-"));
    const nested = path.join(root, "a", "b", "c");
    fs.mkdirSync(nested, { recursive: true });
    try {
      assert.throws(() => findTestRepoRoot(nested, 1), /repository root/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

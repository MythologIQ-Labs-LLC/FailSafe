import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, it } from "mocha";
import { ensureFailsafeGitignoreEntry } from "../../shared/gitignore";

const tempDirs: string[] = [];

function makeTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-gitignore-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(function () {
  this.timeout(10000);
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may hold brief locks on temp dirs; swallow cleanup errors
      }
    }
  }
});

describe("ensureFailsafeGitignoreEntry", function () {
  // Windows mkdtempSync + writeFileSync can briefly exceed 2s under
  // antivirus or concurrent prepush-hook filesystem load. Allow headroom.
  this.timeout(10000);

  it("creates .gitignore with .failsafe/ when missing", () => {
    const workspace = makeTempWorkspace();
    const changed = ensureFailsafeGitignoreEntry(workspace);
    const gitignorePath = path.join(workspace, ".gitignore");

    assert.equal(changed, true);
    assert.equal(fs.existsSync(gitignorePath), true);
    assert.equal(fs.readFileSync(gitignorePath, "utf8"), ".failsafe/\n");
  });

  it("appends .failsafe/ to existing .gitignore once", () => {
    const workspace = makeTempWorkspace();
    const gitignorePath = path.join(workspace, ".gitignore");
    fs.writeFileSync(gitignorePath, "node_modules/\n", "utf8");

    const firstChanged = ensureFailsafeGitignoreEntry(workspace);
    const secondChanged = ensureFailsafeGitignoreEntry(workspace);
    const content = fs.readFileSync(gitignorePath, "utf8");

    assert.equal(firstChanged, true);
    assert.equal(secondChanged, false);
    assert.equal(content, "node_modules/\n.failsafe/\n");
  });

  it("does not add duplicate when .failsafe is already present", () => {
    const workspace = makeTempWorkspace();
    const gitignorePath = path.join(workspace, ".gitignore");
    fs.writeFileSync(gitignorePath, ".failsafe/\ndist/\n", "utf8");

    const changed = ensureFailsafeGitignoreEntry(workspace);
    const content = fs.readFileSync(gitignorePath, "utf8");

    assert.equal(changed, false);
    assert.equal(content, ".failsafe/\ndist/\n");
  });
});

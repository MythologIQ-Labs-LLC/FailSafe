import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CommitGuard } from "../../governance/CommitGuard";

describe("CommitGuard", function () {
  this.timeout(10000);
  let tmpDir: string;
  let guard: CommitGuard;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "commitguard-"));
    const gitDir = path.join(tmpDir, ".git", "hooks");
    fs.mkdirSync(gitDir, { recursive: true });
    guard = new CommitGuard(tmpDir, 7777);
  });

  afterEach(function () {
    this.timeout(10000);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Windows may hold brief locks on temp dirs; swallow cleanup errors
    }
  });

  describe("generateToken", () => {
    it("returns a valid UUID format", () => {
      const token = guard.generateToken();
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(
        uuidRegex.test(token),
        `Token "${token}" is not a valid UUID v4`,
      );
    });

    it("returns a different token each call", () => {
      const t1 = guard.generateToken();
      const t2 = guard.generateToken();
      assert.notEqual(t1, t2);
    });
  });

  describe("validateToken", () => {
    it("accepts the correct token", () => {
      const token = guard.generateToken();
      assert.equal(guard.validateToken(token), true);
    });

    it("rejects a wrong token", () => {
      guard.generateToken();
      assert.equal(guard.validateToken("wrong-token-value"), false);
    });

    it("rejects an empty string", () => {
      guard.generateToken();
      assert.equal(guard.validateToken(""), false);
    });

    it("rejects when no token has been generated", () => {
      assert.equal(guard.validateToken("anything"), false);
    });

    it("uses constant-time comparison (buffer lengths must match)", () => {
      const token = guard.generateToken();
      // Same length but different content should still be rejected
      const fakeToken = token.replace(/[0-9a-f]/i, "x");
      if (fakeToken !== token) {
        assert.equal(guard.validateToken(fakeToken), false);
      }
      // Different length should be rejected before timingSafeEqual
      assert.equal(guard.validateToken(token + "extra"), false);
    });
  });

  describe("detectExistingHooks (via install behavior)", () => {
    it("detects no existing hook when hooks dir is empty", async () => {
      await guard.install();
      const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit");
      assert.ok(fs.existsSync(hookPath));
      // No backup should exist since there was no prior hook
      const backupPath = hookPath + ".failsafe-original";
      assert.ok(!fs.existsSync(backupPath));
    });

    it("chains an existing raw hook", async () => {
      const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit");
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "original hook"', {
        mode: 0o755,
      });

      await guard.install();

      const backupPath = hookPath + ".failsafe-original";
      assert.ok(fs.existsSync(backupPath), "Original hook should be backed up");
      const backupContent = fs.readFileSync(backupPath, "utf8");
      assert.ok(backupContent.includes("original hook"));
    });

    it("detects pre-commit-framework when config file exists", async () => {
      const configPath = path.join(tmpDir, ".pre-commit-config.yaml");
      fs.writeFileSync(configPath, "repos: []");
      const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit");
      fs.writeFileSync(hookPath, "#!/bin/sh\npre-commit run", { mode: 0o755 });

      await guard.install();

      const backupPath = hookPath + ".failsafe-original";
      assert.ok(
        fs.existsSync(backupPath),
        "Pre-commit framework hook should be backed up",
      );
    });

    it("detects husky when .git/config contains hooksPath", async () => {
      const gitConfigPath = path.join(tmpDir, ".git", "config");
      fs.writeFileSync(gitConfigPath, "[core]\n\thooksPath = .husky\n");
      const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit");
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "husky hook"', {
        mode: 0o755,
      });

      await guard.install();

      const backupPath = hookPath + ".failsafe-original";
      assert.ok(
        fs.existsSync(backupPath),
        "Husky hook should be backed up when hooksPath is set in .git/config",
      );
    });
  });

  describe("install / uninstall lifecycle", () => {
    it("installs the hook script with FailSafe marker", async () => {
      await guard.install();
      const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit");
      const content = fs.readFileSync(hookPath, "utf8");
      assert.ok(content.includes("FailSafe Pre-Commit Guard"));
      assert.ok(content.includes("commit-check"));
    });

    it("persists a token file during install", async () => {
      await guard.install();
      const tokenPath = path.join(tmpDir, ".git", "failsafe-hook-token");
      assert.ok(fs.existsSync(tokenPath));
      const tokenContent = fs.readFileSync(tokenPath, "utf8");
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(tokenContent));
    });

    it("uninstall removes hook and token when no backup exists", async () => {
      await guard.install();
      await guard.uninstall();
      const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit");
      const tokenPath = path.join(tmpDir, ".git", "failsafe-hook-token");
      assert.ok(!fs.existsSync(hookPath));
      assert.ok(!fs.existsSync(tokenPath));
    });

    it("uninstall restores original hook from backup", async () => {
      const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit");
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "original"', { mode: 0o755 });

      await guard.install();
      await guard.uninstall();

      assert.ok(fs.existsSync(hookPath));
      const content = fs.readFileSync(hookPath, "utf8");
      assert.ok(content.includes("original"));
      assert.ok(!content.includes("FailSafe"));
    });

    it("a second uninstall() call does not delete the just-restored original hook", async () => {
      const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit");
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "original"', { mode: 0o755 });

      await guard.install();
      await guard.uninstall();
      // Backup is consumed; hookPath now holds the user's real restored hook.
      await guard.uninstall();

      assert.ok(
        fs.existsSync(hookPath),
        "second uninstall() must not delete the restored non-FailSafe hook",
      );
      const content = fs.readFileSync(hookPath, "utf8");
      assert.ok(content.includes("original"));
    });

    it("a duplicate uninstall() call after install-without-backup is a safe no-op", async () => {
      await guard.install();
      await guard.uninstall();
      // No backup ever existed and hookPath is already gone; must not throw.
      await guard.uninstall();
      const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit");
      assert.ok(!fs.existsSync(hookPath));
    });

    it("uninstall() does not delete an unrelated file left at hookPath after the backup is gone", async () => {
      const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit");
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "original"', { mode: 0o755 });

      await guard.install();
      await guard.uninstall();
      // Simulate another actor placing an unrelated file at hookPath between calls.
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "someone-elses-hook"', {
        mode: 0o755,
      });
      await guard.uninstall();

      assert.ok(
        fs.existsSync(hookPath),
        "uninstall() must not delete a non-FailSafe file it did not install",
      );
    });
  });

  describe("isInstalled", () => {
    it("returns false when no hook exists", async () => {
      assert.equal(await guard.isInstalled(), false);
    });

    it("returns true after install", async () => {
      await guard.install();
      assert.equal(await guard.isInstalled(), true);
    });

    it("returns false after uninstall", async () => {
      await guard.install();
      await guard.uninstall();
      assert.equal(await guard.isInstalled(), false);
    });

    it("returns false for a non-FailSafe hook", async () => {
      const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit");
      fs.writeFileSync(hookPath, '#!/bin/sh\necho "not failsafe"');
      assert.equal(await guard.isInstalled(), false);
    });
  });
});

import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, it } from "mocha";
import {
  CommandRunner,
  ensureGitRepositoryReady,
} from "../../shared/gitBootstrap";

const tempDirs: string[] = [];

function makeTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-git-bootstrap-"));
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

describe("ensureGitRepositoryReady", () => {
  it("initializes git when available and repo is missing", async () => {
    const workspace = makeTempWorkspace();
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];

    const runner: CommandRunner = async (command, args, cwd) => {
      calls.push({ command, args, cwd });
      if (command === "git" && args[0] === "--version") {
        return { code: 0, stdout: "git version 2.45.0", stderr: "" };
      }
      if (command === "git" && args[0] === "init") {
        return { code: 0, stdout: "Initialized empty Git repository", stderr: "" };
      }
      return { code: 1, stdout: "", stderr: "unexpected command" };
    };

    const result = await ensureGitRepositoryReady(workspace, {
      runner,
      autoInstallGit: true,
      initializeRepo: true,
      platform: "win32",
    });

    assert.equal(result.gitAvailable, true);
    assert.equal(result.repoInitialized, true);
    assert.equal(result.initializedRepo, true);
    assert.equal(result.installedGit, false);
    assert.ok(
      calls.some((c) => c.command === "git" && c.args[0] === "--version"),
    );
    assert.ok(calls.some((c) => c.command === "git" && c.args[0] === "init"));
  });

  it("attempts install when git is missing and then initializes", async () => {
    const workspace = makeTempWorkspace();
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
    let gitInstalled = false;

    const runner: CommandRunner = async (command, args, cwd) => {
      calls.push({ command, args, cwd });
      if (command === "git" && args[0] === "--version") {
        return gitInstalled
          ? { code: 0, stdout: "git version 2.45.0", stderr: "" }
          : { code: 1, stdout: "", stderr: "git not found" };
      }
      if (command === "winget" && args[0] === "install") {
        gitInstalled = true;
        return { code: 0, stdout: "installed", stderr: "" };
      }
      if (command === "git" && args[0] === "init") {
        return { code: 0, stdout: "Initialized empty Git repository", stderr: "" };
      }
      return { code: 1, stdout: "", stderr: "unexpected command" };
    };

    const result = await ensureGitRepositoryReady(workspace, {
      runner,
      autoInstallGit: true,
      platform: "win32",
    });

    assert.equal(result.gitAvailable, true);
    assert.equal(result.installedGit, true);
    assert.equal(result.initializedRepo, true);
    assert.ok(calls.some((c) => c.command === "winget"));
  });

  it("never mutates a folder or installs Git by default", async () => {
    const workspace = makeTempWorkspace();
    const calls: string[] = [];
    const runner: CommandRunner = async (cmd, args) => {
      calls.push(cmd + " " + args.join(" "));
      return { code: cmd === "git" && args[0] === "--version" ? 0 : 1, stdout: "", stderr: "" };
    };
    const result = await ensureGitRepositoryReady(workspace, { runner });
    assert.equal(result.initializedRepo, false);
    assert.equal(result.installedGit, false);
    assert.deepEqual(calls, ["git --version"]);
    assert.equal(fs.existsSync(path.join(workspace, ".git")), false);
  });

  it("does not initialize when git is unavailable and auto-install is disabled", async () => {
    const workspace = makeTempWorkspace();
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];

    const runner: CommandRunner = async (command, args, cwd) => {
      calls.push({ command, args, cwd });
      if (command === "git" && args[0] === "--version") {
        return { code: 1, stdout: "", stderr: "git not found" };
      }
      return { code: 1, stdout: "", stderr: "unexpected command" };
    };

    const result = await ensureGitRepositoryReady(workspace, {
      runner,
      autoInstallGit: false,
      platform: "linux",
    });

    assert.equal(result.gitAvailable, false);
    assert.equal(result.repoInitialized, false);
    assert.equal(result.initializedRepo, false);
    assert.equal(result.installedGit, false);
    assert.equal(calls.some((c) => c.command === "git" && c.args[0] === "init"), false);
  });

  it("does not run git init when repository already exists", async () => {
    const workspace = makeTempWorkspace();
    fs.mkdirSync(path.join(workspace, ".git"), { recursive: true });
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];

    const runner: CommandRunner = async (command, args, cwd) => {
      calls.push({ command, args, cwd });
      if (command === "git" && args[0] === "--version") {
        return { code: 0, stdout: "git version 2.45.0", stderr: "" };
      }
      return { code: 1, stdout: "", stderr: "unexpected command" };
    };

    const result = await ensureGitRepositoryReady(workspace, {
      runner,
      autoInstallGit: true,
      platform: "win32",
    });

    assert.equal(result.gitAvailable, true);
    assert.equal(result.repoInitialized, true);
    assert.equal(result.initializedRepo, false);
    assert.equal(calls.some((c) => c.command === "git" && c.args[0] === "init"), false);
  });
});

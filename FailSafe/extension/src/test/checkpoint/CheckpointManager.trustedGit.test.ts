import { describe, it, before, after } from "mocha";
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { exec, execFileSync } from "child_process";
import { promisify } from "util";
import { CheckpointManager } from "../../qorelogic/checkpoint/CheckpointManager";
import type { ConfigManager } from "../../shared/ConfigManager";

/**
 * Planted git.cmd against CheckpointManager (plan-v607-final-integration
 * Phase 2, T-a3). The old captureSnapshot ran `git rev-parse HEAD` as a
 * cmd.exe string, and cmd.exe runs a git.cmd from the cwd before PATH. The
 * precondition proves that on this host (it fails, never skips, if the attack
 * does not fire); then captureSnapshot must return the real HEAD and the
 * planted file must never run. Also records the extension host's cwd (F4).
 */
describe("CheckpointManager trusted git (T-a3)", function () {
  const win = process.platform === "win32";
  const saved = process.env.NoDefaultCurrentDirectoryInExePath;
  let base = "";
  let ws = "";
  let mark = "";
  let sha = "";

  before(function () {
    if (!win) this.skip();
    // F1: with this set, cmd.exe does not search the cwd and the attack is silently off.
    delete process.env.NoDefaultCurrentDirectoryInExePath;
    base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "fsgit-a3-")));
    ws = path.join(base, "ws");
    fs.mkdirSync(ws);
    const realGit = (process.env.PATH ?? "").split(";")
      .map((d) => path.join(d.trim().replace(/^"(.*)"$/, "$1"), "git.exe"))
      .find((f) => path.isAbsolute(f) && fs.existsSync(f));
    assert.ok(realGit, "a real git.exe on PATH is required");
    const git = (...args: string[]): string => execFileSync(
      realGit,
      ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args],
      { cwd: ws, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: base } },
    ).trim();
    git("init", "-q");
    git("commit", "-q", "--allow-empty", "-m", "fixture");
    sha = git("rev-parse", "HEAD");
    mark = path.join(ws, "cmd-ran.txt");
    fs.writeFileSync(path.join(ws, "git.cmd"), '@echo cmd> "%~dp0cmd-ran.txt"\r\n');
    console.log(`[T-a3 F4] process.cwd()=${process.cwd()} dirname(process.execPath)=${path.dirname(process.execPath)}`);
  });

  after(() => {
    if (saved !== undefined) process.env.NoDefaultCurrentDirectoryInExePath = saved;
    if (base) fs.rmSync(base, { recursive: true, force: true });
  });

  it("precondition: the old shell-string form runs the planted git.cmd", async () => {
    fs.rmSync(mark, { force: true });
    try { await promisify(exec)("git rev-parse HEAD", { cwd: ws }); } catch { /* the plant prints nothing useful */ }
    console.log(`[T-a3] precondition cmd marker=${fs.existsSync(mark)}`);
    assert.strictEqual(fs.existsSync(mark), true, "promisify(exec) ran the planted git.cmd");
  });

  it("captureSnapshot returns the real HEAD and never runs the plant", async () => {
    fs.rmSync(mark, { force: true });
    const config = { getWorkspaceRoot: () => ws } as unknown as ConfigManager;
    const manager = new CheckpointManager(config);
    const snapshot = await (manager as unknown as { captureSnapshot(): Promise<{ git_head: string | null }> }).captureSnapshot();
    console.log(`[T-a3] captureSnapshot git_head=${snapshot.git_head} cmd marker=${fs.existsSync(mark)}`);
    assert.strictEqual(snapshot.git_head, sha);
    assert.strictEqual(fs.existsSync(mark), false, "the planted git.cmd never ran");
  });
});

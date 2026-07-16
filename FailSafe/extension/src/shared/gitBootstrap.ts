import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

export type CommandRunner = (
  command: string,
  args: string[],
  cwd?: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface GitBootstrapOptions {
  autoInstallGit?: boolean;
  platform?: NodeJS.Platform;
  runner?: CommandRunner;
  existsSync?: (target: string) => boolean;
  log?: (level: "info" | "warn" | "error", message: string) => void;
}

export interface GitBootstrapResult {
  gitAvailable: boolean;
  repoInitialized: boolean;
  installedGit: boolean;
  initializedRepo: boolean;
}

export async function ensureGitRepositoryReady(
  workspaceRoot: string,
  options: GitBootstrapOptions = {},
): Promise<GitBootstrapResult> {
  const existsSync = options.existsSync || fs.existsSync;
  const runner = options.runner || defaultRunner;
  const log = options.log || (() => {});
  const platform = options.platform || process.platform;
  const autoInstallGit = options.autoInstallGit ?? true;
  const gitDir = path.join(workspaceRoot, ".git");
  const repoInitialized = existsSync(gitDir);

  let gitAvailable = await checkGitAvailable(runner);
  let installedGit = false;
  let initializedRepo = false;

  if (!gitAvailable && autoInstallGit) {
    installedGit = await tryInstallGit(platform, runner, log);
    if (installedGit) {
      gitAvailable = await checkGitAvailable(runner);
    }
  }

  if (!gitAvailable) {
    return {
      gitAvailable: false,
      repoInitialized,
      installedGit,
      initializedRepo: false,
    };
  }

  if (!repoInitialized) {
    const initOk = await runCommand(runner, "git", ["init"], workspaceRoot);
    if (initOk) {
      initializedRepo = true;
    }
  }

  return {
    gitAvailable: true,
    repoInitialized: repoInitialized || initializedRepo,
    installedGit,
    initializedRepo,
  };
}

async function checkGitAvailable(runner: CommandRunner): Promise<boolean> {
  return runCommand(runner, "git", ["--version"]);
}

async function tryInstallGit(
  platform: NodeJS.Platform,
  runner: CommandRunner,
  log: (level: "info" | "warn" | "error", message: string) => void,
): Promise<boolean> {
  const candidates = getInstallCandidates(platform);
  for (const candidate of candidates) {
    const ok = await runCommand(runner, candidate.command, candidate.args);
    if (ok) {
      log("info", `Installed git via ${candidate.command}.`);
      return true;
    }
  }
  log("warn", "Unable to auto-install git with available package managers.");
  return false;
}

function getInstallCandidates(
  platform: NodeJS.Platform,
): Array<{ command: string; args: string[] }> {
  if (platform === "win32") {
    return [
      {
        command: "winget",
        args: [
          "install",
          "--id",
          "Git.Git",
          "-e",
          "--source",
          "winget",
          "--silent",
          "--accept-package-agreements",
          "--accept-source-agreements",
        ],
      },
      { command: "choco", args: ["install", "git", "-y"] },
    ];
  }
  if (platform === "darwin") {
    return [{ command: "brew", args: ["install", "git"] }];
  }
  return [
    { command: "apt-get", args: ["install", "-y", "git"] },
    { command: "dnf", args: ["install", "-y", "git"] },
    { command: "yum", args: ["install", "-y", "git"] },
    { command: "pacman", args: ["-Sy", "--noconfirm", "git"] },
  ];
}

async function runCommand(
  runner: CommandRunner,
  command: string,
  args: string[],
  cwd?: string,
): Promise<boolean> {
  try {
    const result = await runner(command, args, cwd);
    return result.code === 0;
  } catch {
    return false;
  }
}

async function defaultRunner(
  command: string,
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const options = { cwd, shell: false as const, windowsHide: true };
    const child = command === "git"
      ? spawn("git", args, options)
      : command === "winget"
        ? spawn("winget", args, options)
        : command === "choco"
          ? spawn("choco", args, options)
          : command === "brew"
            ? spawn("brew", args, options)
            : command === "apt-get"
              ? spawn("apt-get", args, options)
              : command === "dnf"
                ? spawn("dnf", args, options)
                : command === "yum"
                  ? spawn("yum", args, options)
                  : command === "pacman"
                    ? spawn("pacman", args, options)
                    : null;
    if (!child) {
      resolve({
        code: 126,
        stdout: "",
        stderr: `Unsupported Git bootstrap executable: ${command}`,
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) =>
      resolve({ code: code ?? 1, stdout, stderr }),
    );
  });
}

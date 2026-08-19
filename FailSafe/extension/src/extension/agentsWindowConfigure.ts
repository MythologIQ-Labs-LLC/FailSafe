// FX909 (#83 Phases B+C): guided, idempotent Agents-window preparation flow.
// Pure logic behind an injected io seam (modeDefaultNotice.ts precedent) so
// the guidance is unit-testable without the extension host.
//
// The flow deliberately performs NO silent writes: the Agents-window opt-in
// (`extensions.supportAgentsWindow`) is a USER setting the operator must set
// themselves, and both action buttons dispatch existing governed commands.

export interface AgentsWindowConfigureIo {
  showInfo(message: string, ...buttons: string[]): Promise<string | undefined>;
  openSettings(query: string): Promise<void>;
  runCommand(id: string): Promise<void>;
}

export async function runAgentsWindowConfigure(
  io: AgentsWindowConfigureIo,
): Promise<void> {
  const optIn = await io.showInfo(
    'VS Code Agents window: FailSafe must be opted in via the USER setting ' +
      '"extensions.supportAgentsWindow" — add "MythologIQ.mythologiq-failsafe": true ' +
      "(and install FailSafe in the default profile). FailSafe cannot set this for you.",
    "Open Settings",
  );
  if (optIn === "Open Settings") {
    await io.openSettings("extensions.supportAgentsWindow");
  }

  const worktree = await io.showInfo(
    "Agents-window sessions run in git worktrees. One FailSafe commit-hook " +
      "install now governs every worktree of this repository (hooks live in " +
      "the shared .git/hooks; the commit-check endpoint is live).",
    "Install Commit Hook",
  );
  if (worktree === "Install Commit Hook") {
    await io.runCommand("failsafe.installCommitHook");
  }

  const mcp = await io.showInfo(
    "Agent Host sessions cannot see extension-registered MCP servers. Use " +
      "workspace .mcp.json for tools you want forwarded — FailSafe's governed " +
      "catalog installer writes entries with the trust check built in.",
    "Install MCP Integration",
  );
  if (mcp === "Install MCP Integration") {
    await io.runCommand("failsafe.mcp.installCatalog");
  }
}

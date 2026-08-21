/**
 * bootstrapAcpProxy — wires the ACP enforce-proxy install UX (GH #172 Part 2).
 *
 * Registers two operator commands:
 *   • failsafe.acp.installGovernedProxy   — pick a Devin agent → register a
 *       FailSafe-governed twin that routes it through the proxy.
 *   • failsafe.acp.uninstallGovernedProxy — remove the FailSafe twin.
 *
 * The proxy itself (dist/acp-proxy.js) enforces using the workspace governance
 * mode (mirrored to .failsafe/governance/runtime-mode.json). No network activity;
 * the only side effect is editing the user-writable ~/.windsurf/acp/registry.json.
 *
 * On every activation it also re-checks any entry FailSafe previously installed
 * against the live registry (FailSafe#398) — the registry is unsigned +
 * user-writable, so an external rewrite (a Devin auto-update, a user "repair")
 * can silently point the entry back at the raw, ungoverned agent while still
 * showing the FailSafe-branded name in Devin. A workspace that never installed
 * the proxy has nothing to compare against and stays silent.
 *
 * The "expected" entry is persisted in `globalState`, not `workspaceState`:
 * `~/.windsurf/acp/registry.json` is a single per-machine file with one
 * `FAILSAFE_AGENT_ID` entry, not one per workspace. Scoping it to
 * `workspaceState` would make installing in workspace B — which legitimately
 * overwrites the one shared entry — read as tampering the next time workspace
 * A activates, even though governance never lapsed.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  installFailSafeAgent, uninstallFailSafeAgent, buildGovernedTwin, parseRegistry,
  type DevinAgent,
} from '../integrations/acp/registry/DevinRegistryWriter';
import { resolveDevinRegistries, listWrappableAgents, type DevinRegistryLocation } from '../integrations/acp/registry/AcpInstall';
import type { DevinChannel } from '../integrations/acp/registry/DevinRegistryPaths';
import { devinRegistryPath } from '../integrations/acp/registry/DevinRegistryPaths';
import { checkInstalledEntryDrift } from '../integrations/acp/registry/DevinRegistryDriftCheck';

const DEVIN_CHANNELS: DevinChannel[] = ['stable', 'next'];

/**
 * What FailSafe persists at install time: the twin it wrote, plus the
 * workspace it was installed from. `buildGovernedTwin` bakes
 * `--workspace <workspaceRoot>` into the twin's launch args, so an entry that
 * is byte-for-byte intact can still govern a DIFFERENT workspace than the one
 * currently activating — recording `workspaceRoot` lets the re-check tell
 * the two cases apart instead of reporting a blanket "intact".
 */
interface InstalledEntry {
  agent: DevinAgent;
  workspaceRoot: string;
}

function expectedEntryStateKey(channel: DevinChannel): string {
  return `failsafe.acp.expectedRegistryEntry.${channel}`;
}

/**
 * Re-check every channel a FailSafe entry was previously installed for
 * against the live registry, and warn (once, per channel) on drift. Never
 * mutates the registry itself — repair stays an explicit operator action via
 * the existing install command.
 */
export function verifyGovernedProxyEntries(
  context: vscode.ExtensionContext,
  activatingWorkspaceRoot: string,
  home: string,
  readFileFn: (p: string) => string | null,
): void {
  for (const channel of DEVIN_CHANNELS) {
    const stored = context.globalState.get<InstalledEntry>(expectedEntryStateKey(channel));
    if (!stored) continue; // never installed on this machine (or explicitly uninstalled) — nothing to drift from.
    const { agent: expected, workspaceRoot: installedWorkspaceRoot } = stored;

    const result = checkInstalledEntryDrift(readFileFn(devinRegistryPath(channel, home)), expected);
    if (!result) continue;

    const label = expected.name;
    if (result.status === 'intact') {
      if (installedWorkspaceRoot !== activatingWorkspaceRoot) {
        // The entry is genuinely correct — just not for this workspace.
        // Staying silent here would let this workspace's operator select it
        // in Devin believing it enforces THIS workspace's policy, when it
        // actually applies installedWorkspaceRoot's governance instead.
        void vscode.window.showWarningMessage(
          `FailSafe's ACP registry entry for "${label}" (${channel}) currently targets a different workspace (${installedWorkspaceRoot}), not this one. Selecting it here in Devin would apply that workspace's governance policy, not this workspace's. Run "FailSafe: Install ACP Governed Proxy" from this workspace to point it here instead.`,
        );
      }
      continue;
    }

    if (result.status === 'tampered') {
      void vscode.window.showWarningMessage(
        `FailSafe's ACP registry entry for "${label}" (${channel}) no longer matches what FailSafe installed — the agent may now be running ungoverned. Run "FailSafe: Install ACP Governed Proxy" to restore it, or uninstall if this was intentional.`,
      );
    } else if (result.status === 'missing') {
      void vscode.window.showWarningMessage(
        `FailSafe's ACP registry entry for "${label}" (${channel}) is missing even though FailSafe previously installed it — governance for that agent is no longer active. Run "FailSafe: Install ACP Governed Proxy" to reinstall it, or ignore if this was intentional.`,
      );
    } else {
      // malformed: the file exists but FailSafe cannot parse it, so it cannot
      // tell whether governance is intact. Do not call this "missing" — that
      // implies a clean removal and a safe reinstall, when reinstalling here
      // would silently drop any other agents this unreadable file still holds.
      void vscode.window.showWarningMessage(
        `FailSafe's ACP registry file for the "${channel}" channel exists but could not be parsed as JSON — FailSafe cannot verify whether "${label}" is still governed. Inspect the file directly before trusting it; running "Install ACP Governed Proxy" will treat it as empty and may drop any other agents it still contains.`,
      );
    }
  }
}

export function bootstrapAcpProxy(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
): void {
  const proxyJsPath = path.join(context.extensionPath, 'dist', 'acp-proxy.js');

  async function pickRegistry(): Promise<DevinRegistryLocation | undefined> {
    const found = resolveDevinRegistries(os.homedir(), fs.existsSync);
    if (found.length === 0) {
      await vscode.window.showWarningMessage(
        'No Devin Desktop ACP registry found (~/.windsurf/acp/registry.json). Install/run Devin Desktop, then retry.',
      );
      return undefined;
    }
    if (found.length === 1) return found[0];
    const choice = await vscode.window.showQuickPick(
      found.map((f) => ({ label: f.channel, description: f.path, loc: f })),
      { title: 'FailSafe: which Devin channel?' },
    );
    return choice?.loc;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.acp.installGovernedProxy', async () => {
      if (!fs.existsSync(proxyJsPath)) {
        await vscode.window.showErrorMessage(`ACP proxy bundle missing at ${proxyJsPath}. Rebuild the extension (npm run bundle).`);
        return;
      }
      const loc = await pickRegistry();
      if (!loc) return;

      const agents = listWrappableAgents(parseRegistry(fs.readFileSync(loc.path, 'utf8')));
      if (agents.length === 0) {
        await vscode.window.showWarningMessage('No wrappable agents found in the Devin registry. Add an ACP agent in Devin first.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        agents.map((a: DevinAgent) => ({ label: a.name, description: a.id, agent: a })),
        { title: 'FailSafe: which agent to govern?' },
      );
      if (!picked) return;

      const twin = buildGovernedTwin(picked.agent, {
        nodePath: process.execPath,
        proxyJsPath,
        workspaceRoot,
        name: `FailSafe (governing ${picked.agent.name})`,
      });
      try {
        installFailSafeAgent(loc.path, twin);
        const entry: InstalledEntry = { agent: twin, workspaceRoot };
        await context.globalState.update(expectedEntryStateKey(loc.channel), entry);
        await vscode.window.showInformationMessage(
          `FailSafe governed proxy installed for "${picked.agent.name}". Select "${twin.name}" in Devin to run it under FailSafe governance.`,
        );
      } catch (e) {
        await vscode.window.showErrorMessage(`Failed to write the Devin registry: ${(e as Error).message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.acp.uninstallGovernedProxy', async () => {
      const found = resolveDevinRegistries(os.homedir(), fs.existsSync);
      try {
        for (const loc of found) uninstallFailSafeAgent(loc.path);
        // Always clear persisted expected state for every channel, even when no
        // registry file currently exists — otherwise a deleted/moved registry
        // leaves the drift warning firing on every activation with no way to
        // quiet it, since this loop is the only place that clears it.
        for (const channel of DEVIN_CHANNELS) {
          await context.globalState.update(expectedEntryStateKey(channel), undefined);
        }
        await vscode.window.showInformationMessage(
          found.length === 0
            ? 'No Devin registry found — nothing to uninstall.'
            : 'FailSafe governed proxy removed from the Devin registry.',
        );
      } catch (e) {
        await vscode.window.showErrorMessage(`Failed to update the Devin registry: ${(e as Error).message}`);
      }
    }),
  );

  try {
    verifyGovernedProxyEntries(
      context,
      workspaceRoot,
      os.homedir(),
      (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null),
    );
  } catch (e) {
    // Best-effort: a detection failure must never block activation.
    void vscode.window.showErrorMessage(`FailSafe ACP registry drift check failed: ${(e as Error).message}`);
  }
}

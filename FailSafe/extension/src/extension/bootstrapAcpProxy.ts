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
      if (found.length === 0) {
        await vscode.window.showInformationMessage('No Devin registry found — nothing to uninstall.');
        return;
      }
      try {
        for (const loc of found) uninstallFailSafeAgent(loc.path);
        await vscode.window.showInformationMessage('FailSafe governed proxy removed from the Devin registry.');
      } catch (e) {
        await vscode.window.showErrorMessage(`Failed to update the Devin registry: ${(e as Error).message}`);
      }
    }),
  );
}

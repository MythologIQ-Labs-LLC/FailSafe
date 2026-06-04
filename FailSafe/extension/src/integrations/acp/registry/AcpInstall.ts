// Pure install-flow helpers for the ACP governed-proxy install UX (GH #172 Part 2).
// vscode-free so they unit-test headlessly; the VS Code command (bootstrapAcpProxy)
// wraps them with quick-pick UI + fs writes.

import { devinRegistryPath, type DevinChannel } from './DevinRegistryPaths';
import { parseRegistry, FAILSAFE_AGENT_ID, type DevinAgent, type DevinRegistry } from './DevinRegistryWriter';

export interface DevinRegistryLocation {
  channel: DevinChannel;
  path: string;
}

/** Which Devin ACP registries exist on this machine (stable + next channels). */
export function resolveDevinRegistries(
  home: string,
  existsFn: (p: string) => boolean,
): DevinRegistryLocation[] {
  const channels: DevinChannel[] = ['stable', 'next'];
  return channels
    .map((channel) => ({ channel, path: devinRegistryPath(channel, home) }))
    .filter((loc) => existsFn(loc.path));
}

/**
 * Agents in a registry that FailSafe can wrap: every entry EXCEPT FailSafe's own
 * twin (never wrap ourselves → no infinite proxy chain) and any entry with no
 * platform binaries (nothing to launch).
 */
export function listWrappableAgents(reg: DevinRegistry): DevinAgent[] {
  return reg.agents.filter(
    (a) => a && a.id !== FAILSAFE_AGENT_ID && Object.keys(a.distribution?.binary ?? {}).length > 0,
  );
}

/** Parse a registry file's text and return its wrappable agents (convenience). */
export function wrappableAgentsFromText(text: string | null | undefined): DevinAgent[] {
  return listWrappableAgents(parseRegistry(text));
}

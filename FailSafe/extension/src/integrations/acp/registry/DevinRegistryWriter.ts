// Devin Desktop ACP registry writer (GH #172 Part 2, B8).
//
// Net-new external-home-dir writer for `~/.windsurf/acp/registry.json`. The
// registry is UNSIGNED + user-writable, so the writer is MERGE-NOT-CLOBBER
// (never drops other agents) + ATOMIC (temp+rename, never a half-written file)
// + PARSE-TOLERANT (a corrupt registry degrades to a fresh skeleton rather than
// blocking install). The pure merge/parse functions carry the logic; only the
// thin install/uninstall wrappers touch fs.
//
// Schema verified against https://docs.devin.ai/desktop/acp:
//   { version, agents: [ { id, name, version, description?, authors?, license?,
//     distribution: { binary: { "<platform>": { archive, cmd, args } } } } ],
//     extensions: [] }

import * as fs from 'fs';
import * as path from 'path';
import { DEVIN_PLATFORM_KEYS } from './DevinRegistryPaths';

/** The default id/name for FailSafe's governed-proxy agent entry. */
export const FAILSAFE_AGENT_ID = 'failsafe-governed';

export interface DevinBinarySpec { archive: string; cmd: string; args: string[]; }
export interface DevinAgent {
  id: string;
  name: string;
  version: string;
  description?: string;
  authors?: string[];
  license?: string;
  distribution: { binary: Record<string, DevinBinarySpec> };
}
export interface DevinRegistry {
  version: string;
  agents: DevinAgent[];
  extensions: unknown[];
}

function freshRegistry(): DevinRegistry {
  return { version: '1.0.0', agents: [], extensions: [] };
}

/**
 * Parse a registry file's text into a `DevinRegistry`, tolerating a
 * missing/malformed/partial file by returning a fresh skeleton (a corrupt
 * registry must never block install or clobber what we can't read — but we DO
 * preserve a well-formed `agents`/`extensions`/`version`).
 */
export function parseRegistry(text: string | null | undefined): DevinRegistry {
  if (!text) return freshRegistry();
  try {
    const o = JSON.parse(text) as Partial<DevinRegistry>;
    return {
      version: typeof o.version === 'string' ? o.version : '1.0.0',
      agents: Array.isArray(o.agents) ? (o.agents as DevinAgent[]) : [],
      extensions: Array.isArray(o.extensions) ? o.extensions : [],
    };
  } catch {
    return freshRegistry();
  }
}

/**
 * Build the FailSafe proxy agent entry — every platform's `cmd`/`args` point at
 * the shipped proxy, which wraps the real (pre-installed) agent. Devin does not
 * download distributions, so `archive` is always empty.
 */
export function buildFailSafeAgent(opts: {
  id?: string; name?: string; proxyCmd: string; proxyArgs: string[];
}): DevinAgent {
  const binary: Record<string, DevinBinarySpec> = {};
  for (const p of DEVIN_PLATFORM_KEYS) {
    binary[p] = { archive: '', cmd: opts.proxyCmd, args: [...opts.proxyArgs] };
  }
  return {
    id: opts.id ?? FAILSAFE_AGENT_ID,
    name: opts.name ?? 'FailSafe (governed)',
    version: '1.0.0',
    description: 'FailSafe ACP governance proxy — mediates the agent through FailSafe enforcement.',
    authors: ['MythologIQ'],
    license: 'Apache-2.0',
    distribution: { binary },
  };
}

/** Pure: upsert an agent by id, PRESERVING every other agent + extensions. */
export function upsertAgent(reg: DevinRegistry, agent: DevinAgent): DevinRegistry {
  const agents = reg.agents.filter((a) => a && a.id !== agent.id);
  agents.push(agent);
  return { version: reg.version || '1.0.0', agents, extensions: reg.extensions ?? [] };
}

/** Pure: remove an agent by id (preserve others + extensions). */
export function removeAgent(reg: DevinRegistry, id: string): DevinRegistry {
  return { version: reg.version || '1.0.0', agents: reg.agents.filter((a) => a && a.id !== id), extensions: reg.extensions ?? [] };
}

/** Atomic write (temp + rename); creates parent dirs. Never leaves a partial file. */
export function writeRegistryAtomic(filePath: string, reg: DevinRegistry): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.failsafe-tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(reg, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

/** Read → merge → atomic-write: install/refresh the FailSafe agent. */
export function installFailSafeAgent(filePath: string, agent: DevinAgent): void {
  const reg = parseRegistry(fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null);
  writeRegistryAtomic(filePath, upsertAgent(reg, agent));
}

/** Remove the FailSafe agent (no-op when the registry doesn't exist). */
export function uninstallFailSafeAgent(filePath: string, id: string = FAILSAFE_AGENT_ID): void {
  if (!fs.existsSync(filePath)) return;
  const reg = parseRegistry(fs.readFileSync(filePath, 'utf8'));
  writeRegistryAtomic(filePath, removeAgent(reg, id));
}

/**
 * llmDestinationPolicy - where Sentinel and Brainstorm content may be sent (#538, B273).
 *
 * Pure. A loopback endpoint is allowed from any source. Any other host is a
 * candidate only when the endpoint came from the user's own settings, and
 * then only after the operator approves that exact origin and operation
 * (llmEgressAuthorizer). A workspace file or workspace setting can never
 * point content off the machine.
 */

import * as net from 'net';
import { bareHost, isForbiddenRemoteAddress, isLoopbackHostName } from '../../shared/net/addressPolicy';
import type { LlmEndpointSource } from '../../shared/types';

export type { LlmEndpointSource } from '../../shared/types';

export type LlmEgressOperation = 'sentinel-file-analysis' | 'brainstorm-transcript';

export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';

export interface LlmTarget {
  protocol: 'http:' | 'https:';
  /** The host to connect to, IPv6 without brackets. */
  hostname: string;
  port: number;
  /** `protocol//host:port`, with the port always present. */
  origin: string;
  /** The endpoint's path prefix without a trailing slash ('' for none). */
  basePath: string;
}

export type ParsedEndpoint = { ok: true; target: LlmTarget } | { ok: false; reason: string };

export function parseLlmEndpoint(raw: unknown): ParsedEndpoint {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'no endpoint' };
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return { ok: false, reason: 'not a URL' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: `scheme ${url.protocol} is not http or https` };
  if (url.username || url.password) return { ok: false, reason: 'the URL carries credentials' };
  if (url.search || url.hash) return { ok: false, reason: 'the URL carries a query or fragment' };
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  return {
    ok: true,
    target: {
      protocol: url.protocol,
      hostname: bareHost(url.hostname),
      port,
      origin: `${url.protocol}//${url.hostname}:${port}`,
      basePath: url.pathname.replace(/\/+$/, ''),
    },
  };
}

export type LlmDestination =
  | { kind: 'refused'; reason: string }
  | { kind: 'loopback'; target: LlmTarget }
  | { kind: 'needs-authorization'; target: LlmTarget };

export function decideLlmDestination(endpoint: unknown, source: unknown): LlmDestination {
  const parsed = parseLlmEndpoint(endpoint);
  if (!parsed.ok) return { kind: 'refused', reason: parsed.reason };
  const { target } = parsed;
  if (isLoopbackHostName(target.hostname)) return { kind: 'loopback', target };
  if (net.isIP(target.hostname) !== 0 && isForbiddenRemoteAddress(target.hostname)) {
    return { kind: 'refused', reason: 'a private, link-local or reserved address' };
  }
  if (source !== 'user-setting') return { kind: 'refused', reason: 'only a user setting may name a host that is not this machine' };
  return { kind: 'needs-authorization', target };
}

export interface InspectedSetting {
  defaultValue?: unknown;
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
}

/**
 * The effective endpoint and where it came from, both from the same layer:
 * sentinel.yaml, then folder and workspace settings, then user settings
 * (which VS Code also fills from remote-machine and Dev Container settings),
 * then the default. `null` counts as absent, as `??` does.
 */
export function resolveSentinelEndpoint(yamlValue: unknown, inspected?: InspectedSetting): { value: string; source: LlmEndpointSource } {
  const text = (v: unknown): string => (typeof v === 'string' ? v : '');
  const present = (v: unknown): boolean => v !== undefined && v !== null;
  if (present(yamlValue)) return { value: text(yamlValue), source: 'workspace-file' };
  if (present(inspected?.workspaceFolderValue)) return { value: text(inspected?.workspaceFolderValue), source: 'workspace-setting' };
  if (present(inspected?.workspaceValue)) return { value: text(inspected?.workspaceValue), source: 'workspace-setting' };
  if (present(inspected?.globalValue)) return { value: text(inspected?.globalValue), source: 'user-setting' };
  const fallback = text(inspected?.defaultValue) || DEFAULT_OLLAMA_ENDPOINT;
  return { value: fallback, source: 'default' };
}

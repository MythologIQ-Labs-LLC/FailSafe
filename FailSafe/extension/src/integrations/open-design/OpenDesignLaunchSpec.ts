/**
 * OpenDesignLaunchSpec — how FailSafe launches the Open Design MCP server (#481).
 *
 * The Open Design daemon publishes the exact launch command for its MCP server
 * at `GET /api/mcp/install-info` (loopback only; a foreign Origin gets 403).
 * A bare `od mcp` does not work on a Windows desktop install, where no `od` is
 * on PATH and Git Bash resolves `od` to coreutils' octal-dump.
 *
 * A loopback HTTP response must not by itself decide what FailSafe spawns, so
 * this module only narrows what an operator can be asked to confirm. The
 * consent modal in `bootstrapOpenDesignMcp` is the control. Env keys are
 * allowlisted because under ELECTRON_RUN_AS_NODE a key like NODE_OPTIONS
 * would preload code without changing the command or argv.
 */

import * as path from 'path';

/** globalState key for the operator-confirmed spec (user-scoped, never workspace settings). */
export const LAUNCH_SPEC_STATE_KEY = 'failsafe.openDesign.mcpLaunchSpec';

export const ALLOWED_LAUNCH_ENV_KEYS: readonly string[] = ['OD_DATA_DIR', 'ELECTRON_RUN_AS_NODE'];

export interface OpenDesignLaunchSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export type LaunchSpecResult =
  | { ok: true; spec: OpenDesignLaunchSpec }
  | { ok: false; reason: string };

export interface FetchLaunchSpecOptions {
  port?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const isAbsolute = (p: string): boolean => path.win32.isAbsolute(p) || path.posix.isAbsolute(p);

function parseEnv(raw: unknown): Record<string, string> | string {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return 'env must be an object';
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED_LAUNCH_ENV_KEYS.includes(key)) return `env key ${key} is not allowed`;
    if (typeof value !== 'string') return `env value for ${key} must be a string`;
    env[key] = value;
  }
  return env;
}

/** Validate an install-info payload. Never trusts the payload's own cliExists/nodeExists. */
export function parseLaunchSpec(raw: unknown): LaunchSpecResult {
  if (raw === null || typeof raw !== 'object') return { ok: false, reason: 'install-info is not an object' };
  const { command, args, env } = raw as Record<string, unknown>;
  if (typeof command !== 'string' || !isAbsolute(command)) {
    return { ok: false, reason: 'command must be an absolute path' };
  }
  if (!Array.isArray(args) || args.length === 0 || !args.every((a) => typeof a === 'string')) {
    return { ok: false, reason: 'args must be a non-empty string array' };
  }
  if (!isAbsolute(args[0] as string)) return { ok: false, reason: 'args[0] (MCP entry script) must be an absolute path' };
  const parsedEnv = parseEnv(env);
  if (typeof parsedEnv === 'string') return { ok: false, reason: parsedEnv };
  return { ok: true, spec: { command, args: [...(args as string[])], env: parsedEnv } };
}

/** Fetch and validate the daemon's launch spec. Fails closed on any error. */
export async function fetchLaunchSpec(opts: FetchLaunchSpecOptions = {}): Promise<LaunchSpecResult> {
  const url = `http://127.0.0.1:${opts.port ?? 7456}/api/mcp/install-info`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5_000);
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, reason: `install-info returned HTTP ${res.status}` };
    return parseLaunchSpec(await res.json());
  } catch (e) {
    return { ok: false, reason: `install-info unreachable (${(e as Error).message})` };
  } finally {
    clearTimeout(timer);
  }
}

const quote = (s: string): string => (/[\s"]/.test(s) ? JSON.stringify(s) : s);

/** The full command line shown in the consent prompt: every env pair, then argv. */
export function formatCommandLine(spec: OpenDesignLaunchSpec): string {
  const envPart = Object.entries(spec.env).map(([k, v]) => `${k}=${quote(v)}`);
  return [...envPart, quote(spec.command), ...spec.args.map(quote)].join(' ');
}

export function sameSpec(a: OpenDesignLaunchSpec | null | undefined, b: OpenDesignLaunchSpec | null | undefined): boolean {
  if (!a || !b) return false;
  return formatCommandLine(a) === formatCommandLine(b);
}

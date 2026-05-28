/**
 * OpenDesignDaemonProbe — HTTP liveness probe for the local Open Design daemon.
 *
 * Probes `GET http://127.0.0.1:<port>/api/version` with a configurable
 * timeout, then TTL-caches the result so repeated probe() calls within the
 * TTL window do not re-hit the network.
 *
 * Failure modes are discriminated (refused / timeout / non_200 / parse_error)
 * so callers can surface a precise operator hint without inspecting raw
 * errors.
 *
 * See plan-open-design-integration-v1.1.md Phase 1; FX721.
 */

export type DaemonProbeResult =
  | { alive: true; version: string }
  | { alive: false; reason: 'refused' | 'timeout' | 'non_200' | 'parse_error' };

export interface DaemonProbeOptions {
  /** TCP port the daemon listens on. Default 7456. */
  port?: number;
  /** Per-attempt timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Cached-result TTL in ms. Default 30_000. */
  ttlMs?: number;
  /** Injectable clock (test seam). Default Date.now. */
  nowMs?: () => number;
  /** Injectable fetch (test seam). Default global fetch. */
  fetchImpl?: typeof fetch;
}

export class OpenDesignDaemonProbe {
  private cache: { at: number; result: DaemonProbeResult } | null = null;
  private readonly opts: DaemonProbeOptions;

  constructor(opts: DaemonProbeOptions = {}) {
    this.opts = opts;
  }

  async probe(): Promise<DaemonProbeResult> {
    const now = (this.opts.nowMs ?? Date.now)();
    const ttl = this.opts.ttlMs ?? 30_000;
    if (this.cache && now - this.cache.at < ttl) {
      return this.cache.result;
    }
    const port = this.opts.port ?? 7456;
    const url = `http://127.0.0.1:${port}/api/version`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 5_000);
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    let result: DaemonProbeResult;
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal });
      if (!res.ok) {
        result = { alive: false, reason: 'non_200' };
      } else {
        try {
          const data = (await res.json()) as { version?: unknown };
          result =
            typeof data.version === 'string' && data.version.length > 0
              ? { alive: true, version: data.version }
              : { alive: false, reason: 'parse_error' };
        } catch {
          result = { alive: false, reason: 'parse_error' };
        }
      }
    } catch (e) {
      const code = (e as { name?: string } | null)?.name;
      result = { alive: false, reason: code === 'AbortError' ? 'timeout' : 'refused' };
    } finally {
      clearTimeout(timer);
    }
    this.cache = { at: now, result };
    return result;
  }
}

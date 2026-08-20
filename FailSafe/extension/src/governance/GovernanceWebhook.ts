import * as crypto from 'crypto';
import * as https from 'https';
import * as url from 'url';
import * as net from 'net';

export interface WebhookConfig {
  url: string;
  events: string[];
  /**
   * Explicit allowlist of top-level payload keys permitted to leave the machine.
   * Required: an outbound governance sender must never ship whatever a future
   * caller happens to pass to a third-party endpoint.
   */
  payloadFields: string[];
  secret?: string;
  /** Byte cap on the serialized body; non-positive/absent means the 65536 default.
   *  Enforced fail-closed in the builder BEFORE signing (#350). */
  maxPayloadBytes?: number;
}

/** Registration view safe to log or surface: never carries the shared secret. */
export interface RegisteredWebhook {
  url: string;
  events: string[];
  payloadFields: string[];
  hasSecret: boolean;
}

interface WebhookResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/** Injectable network seam (SlackNotifier pattern): receives exactly the
 *  builder's contract; the default is the real https shell below. */
export type WebhookTransport = (
  options: {
    hostname: string;
    port: string | number;
    path: string;
    headers: Record<string, string | number>;
  },
  body: string,
) => Promise<WebhookResult>;

export const DEFAULT_MAX_PAYLOAD_BYTES = 65536;

export const SIGNATURE_HEADER = 'x-failsafe-signature-256';

/** HMAC-SHA256 over the exact transmitted bytes, so a receiver can verify integrity. */
export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

/** Allowlist-driven: only declared, own properties are copied out. */
function applyPayloadAllowlist(
  allow: string[],
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const key of allow) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      filtered[key] = payload[key];
    }
  }
  return filtered;
}

/**
 * Pure request builder: the network wiring below is a thin shell over this, so the
 * security-relevant decisions (what is sent, what signs it, where it goes) are
 * deterministically testable without opening a socket.
 */
export function buildWebhookRequest(
  config: WebhookConfig,
  event: string,
  payload: Record<string, unknown>,
  timestamp: string,
): { hostname: string; port: string | number; path: string; body: string; headers: Record<string, string | number> } {
  const allow = Array.isArray(config.payloadFields) ? config.payloadFields : [];
  const body = JSON.stringify({
    event,
    payload: applyPayloadAllowlist(allow, payload),
    timestamp,
  });
  // Byte bound (#350): enforced BEFORE signing so the signature-over-
  // transmitted-bytes invariant is never in tension with the cap; the guard is
  // the single source of truth (direct callers bypass register()).
  const cap = Number.isFinite(config.maxPayloadBytes) && (config.maxPayloadBytes as number) > 0
    ? (config.maxPayloadBytes as number)
    : DEFAULT_MAX_PAYLOAD_BYTES;
  const bytes = Buffer.byteLength(body);
  if (bytes > cap) {
    throw new Error(`webhook payload exceeds maxPayloadBytes (${bytes} > ${cap}); refused fail-closed`);
  }
  const parsed = new url.URL(config.url);
  const headers: Record<string, string | number> = {
    'Content-Type': 'application/json',
    'Content-Length': bytes,
  };
  if (config.secret) {
    headers[SIGNATURE_HEADER] = signWebhookBody(config.secret, body);
  }
  return {
    // hostname stays VERBATIM from url.URL (brackets preserved for IPv6
    // literals): normalizing brackets would make the deliberately-unfixed
    // #347 bracketed-private-IPv6 SSRF residual in isPrivateIp() reachable.
    // Bracket normalization is blocked on that guard fix (noted on #347).
    hostname: parsed.hostname,
    port: parsed.port || 443,
    path: `${parsed.pathname}${parsed.search}`,
    body,
    headers,
  };
}

/** Real network shell — thin by design; everything decision-shaped lives in the builder. */
const defaultTransport: WebhookTransport = (options, body) =>
  new Promise((resolve) => {
    const req = https.request({
      hostname: options.hostname,
      port: options.port,
      path: options.path,
      method: 'POST',
      headers: options.headers,
      timeout: 5000,
    }, (res) => {
      resolve({ success: res.statusCode === 200, statusCode: res.statusCode });
      res.resume();
    });
    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
    req.write(body);
    req.end();
  });

export class GovernanceWebhook {
  private configs: WebhookConfig[] = [];

  constructor(private readonly transport: WebhookTransport = defaultTransport) {}

  register(config: WebhookConfig): void {
    if (!this.isValidUrl(config.url)) {
      throw new Error(`Invalid webhook URL: must be HTTPS and not a private IP`);
    }
    if (!this.isValidAllowlist(config.payloadFields)) {
      throw new Error(
        `Invalid webhook payloadFields: an explicit, non-empty allowlist of payload field names is required`,
      );
    }
    this.configs.push({
      ...config,
      events: [...config.events],
      payloadFields: [...config.payloadFields],
    });
  }

  unregister(webhookUrl: string): void {
    this.configs = this.configs.filter(c => c.url !== webhookUrl);
  }

  getRegistered(): RegisteredWebhook[] {
    return this.configs.map(c => ({
      url: c.url,
      events: [...c.events],
      payloadFields: [...c.payloadFields],
      hasSecret: Boolean(c.secret),
    }));
  }

  async dispatch(event: string, payload: Record<string, unknown>): Promise<WebhookResult[]> {
    const targets = this.configs.filter(c => c.events.includes(event) || c.events.includes('*'));
    return Promise.all(targets.map(config => this.send(config, event, payload)));
  }

  private async send(
    config: WebhookConfig,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<WebhookResult> {
    // Resolve-only contract: ANY builder throw (byte bound, malformed URL)
    // becomes the per-target failure result — dispatch()'s Promise.all must
    // never reject, and sibling targets' results must never be discarded.
    let built: ReturnType<typeof buildWebhookRequest>;
    try {
      built = buildWebhookRequest(config, event, payload, new Date().toISOString());
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
    // Single parse: hostname/port/path all come from the builder (#350).
    return this.transport(
      { hostname: built.hostname, port: built.port, path: built.path, headers: built.headers },
      built.body,
    );
  }

  private isValidAllowlist(fields: string[]): boolean {
    return (
      Array.isArray(fields) &&
      fields.length > 0 &&
      fields.every(f => typeof f === 'string' && f.length > 0)
    );
  }

  private isValidUrl(webhookUrl: string): boolean {
    try {
      const parsed = new url.URL(webhookUrl);
      if (parsed.protocol !== 'https:') return false;
      if (this.isPrivateIp(parsed.hostname)) return false;
      return true;
    } catch { return false; }
  }

  private isPrivateIp(hostname: string): boolean {
    if (net.isIP(hostname) === 0) return false;
    if (hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1') return true;
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return true;
    if (hostname.startsWith('169.254.')) return true;
    // RFC 1918: 172.16.0.0 – 172.31.255.255
    if (hostname.startsWith('172.')) {
      const second = parseInt(hostname.split('.')[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
    // IPv6 private ranges
    const lower = hostname.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('::ffff:')) return true;
    return false;
  }
}

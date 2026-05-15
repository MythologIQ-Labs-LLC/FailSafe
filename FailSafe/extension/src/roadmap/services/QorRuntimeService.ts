/**
 * QorRuntimeService - Encapsulates Qor runtime HTTP integration.
 *
 * Extracted from ConsoleServer (B166 Phase 2 / plan-v4.10.1a-no-b132).
 * Owns the `enabled` short-circuit, snapshot fetch, JSON fetch, and
 * proxy helper that backed the `/api/qor/*` endpoints.
 *
 * No behavior change vs. the inline implementation.
 */
import type { Request, Response } from "express";

export type QorRuntimeOptions = {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
};

export type QorRuntimeSnapshot = {
  enabled: boolean;
  connected: boolean;
  baseUrl: string;
  policyVersion?: string;
  latencyMs?: number;
  lastCheckedAt: string;
  error?: string;
};

export type QorFetchResult =
  | { ok: true; body: unknown }
  | { ok: false; error: string; detail?: string };

type QorFetchOptions = { method?: "GET" | "POST"; body?: unknown };

/** Allow tests to inject a fake fetch without monkey-patching globals. */
export type QorFetchFn = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export class QorRuntimeService {
  private readonly options: QorRuntimeOptions;
  private readonly fetchImpl: QorFetchFn;

  constructor(qorRuntime: QorRuntimeOptions, fetchImpl?: QorFetchFn) {
    this.options = qorRuntime;
    this.fetchImpl = fetchImpl ?? (fetch as unknown as QorFetchFn);
  }

  async fetchSnapshot(): Promise<QorRuntimeSnapshot> {
    const checkedAt = new Date().toISOString();
    if (!this.options.enabled) {
      return {
        enabled: false, connected: false,
        baseUrl: this.options.baseUrl, lastCheckedAt: checkedAt,
        error: "disabled",
      };
    }
    const startedAt = Date.now();
    const health = await this.fetchJson("/health");
    if (!health.ok) {
      return {
        enabled: true, connected: false,
        baseUrl: this.options.baseUrl,
        latencyMs: Date.now() - startedAt, lastCheckedAt: checkedAt,
        error: health.error || "runtime_unreachable",
      };
    }
    const policy = await this.fetchJson("/policy/version");
    return {
      enabled: true, connected: true,
      baseUrl: this.options.baseUrl,
      policyVersion: policy.ok
        ? String((policy.body as { policyVersion?: string }).policyVersion || "")
        : undefined,
      latencyMs: Date.now() - startedAt, lastCheckedAt: checkedAt,
    };
  }

  async fetchJson(
    endpoint: string,
    options?: QorFetchOptions,
  ): Promise<QorFetchResult> {
    if (!this.options.enabled) return { ok: false, error: "disabled" };
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(), this.options.timeoutMs,
    );
    const headers = this.buildHeaders();
    try {
      const response = await this.fetchImpl(`${this.options.baseUrl}${endpoint}`, {
        method: options?.method || "GET",
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        const detail = await response.text();
        return { ok: false, error: `upstream_${response.status}`, detail };
      }
      return { ok: true, body: await response.json() };
    } catch (error) {
      clearTimeout(timer);
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, error: "request_failed", detail };
    }
  }

  async proxy(
    req: Request,
    res: Response,
    endpoint: string,
    method?: "POST",
  ): Promise<void> {
    if (!this.options.enabled) {
      res.status(503).json({ error: "Qor runtime integration is disabled" });
      return;
    }
    const opts = method === "POST"
      ? { method: "POST" as const, body: req.body || {} }
      : undefined;
    const response = await this.fetchJson(endpoint, opts);
    const body = response.ok
      ? response.body
      : { error: response.error, detail: response.detail };
    res.status(response.ok ? 200 : 502).json(body);
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.options.apiKey) {
      headers["x-qor-api-key"] = this.options.apiKey;
    }
    return headers;
  }
}

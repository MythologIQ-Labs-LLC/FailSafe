// B-INT-1: HTTP surface for the 11 remaining Bicameral MCP tools.
// BicameralMcpClient already exposes typed wrappers (ingest/search/brief/
// judgeGaps/resolveCompliance/linkCommit/update/reset/dashboard/
// validateSymbols/getNeighbors — BicameralMcpClient.ts:220-288). This module
// gives each a `POST /api/actions/bicameral-<tool>` route plus a
// `bicameralToolRoute` factory and an exported `registerBicameralToolRoutes`.
//
// Governance split (plan v5.1.8 Phase 4 §2): mutation tools route through the
// universal `governToolCall` interceptor seam; query tools call the client
// method directly. The split is a deliberate refinement of the legacy
// history/drift/ratify precedent — see the plan's F6 note.

import type { Request, Response } from "express";
import { governToolCall, type BicameralRouteDeps } from "./BicameralRoute";

/**
 * A tool route spec. `client` resolves the typed client method's result from
 * the parsed body; `parse` validates the request body, returning a 400 message
 * string on failure or `null` when the body is acceptable. `governed:true`
 * pushes the call through the McpInterceptor seam first.
 */
export interface BicameralToolSpec {
  /** Route slug — registered as `POST /api/actions/bicameral-<tool>`. */
  tool: string;
  /** When true, route through the governToolCall interceptor seam. */
  governed: boolean;
  /** MCP envelope tool name used for the interceptor call (governed only). */
  envelopeName?: string;
  /** Validate the request body; return a 400 error string, or null when ok. */
  parse: (body: Record<string, unknown>) => string | null;
  /** Build the interceptor envelope arguments from the parsed body. */
  toArgs: (body: Record<string, unknown>) => Record<string, unknown>;
  /** Invoke the matching typed client method; result is JSON-returned. */
  invoke: (client: BicameralToolClient, body: Record<string, unknown>) => Promise<unknown>;
}

/** The subset of BicameralMcpClient surface the tool routes depend on. */
export interface BicameralToolClient {
  isConnected(): boolean;
  ingest(opts: { repoPath: string }): Promise<unknown>;
  search(opts: { query: string }): Promise<unknown>;
  brief(opts: { feature: string }): Promise<unknown>;
  judgeGaps(opts: { feature: string }): Promise<unknown>;
  resolveCompliance(opts: { decisionId: string; resolution: string }): Promise<unknown>;
  linkCommit(opts: { commitSha: string; decisionId: string }): Promise<unknown>;
  update(opts: { decisionId: string; payload: Record<string, unknown> }): Promise<unknown>;
  reset(opts?: { scope?: string }): Promise<unknown>;
  dashboard(): Promise<unknown>;
  validateSymbols(opts: { symbols: string[] }): Promise<unknown>;
  getNeighbors(opts: { decisionId: string }): Promise<unknown>;
}

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * Factory: build one `POST /api/actions/bicameral-<tool>` handler for a spec.
 * Order: rejectIfRemote → client-wired check (503) → connected check (409) →
 * body validation (400) → governance (governed specs only) → invoke → JSON.
 */
export function bicameralToolRoute(
  app: import("express").Application,
  deps: BicameralRouteDeps,
  spec: BicameralToolSpec,
): void {
  app.post(`/api/actions/bicameral-${spec.tool}`, async (req: Request, res: Response) => {
    if (deps.rejectIfRemote(req, res)) return;
    const client = deps.getBicameralClient() as unknown as BicameralToolClient | null;
    if (!client) {
      res.status(503).json({ ok: false, error: "Bicameral client not wired" });
      return;
    }
    if (!client.isConnected()) {
      res.status(409).json({
        ok: false,
        error: "Bicameral not connected — POST /bicameral-connect first",
      });
      return;
    }
    const body: Record<string, unknown> =
      req.body && typeof req.body === "object" ? req.body : {};
    const parseError = spec.parse(body);
    if (parseError) {
      res.status(400).json({ ok: false, error: parseError });
      return;
    }
    try {
      if (spec.governed) {
        const blocked = await governToolCall(
          deps,
          { name: spec.envelopeName ?? `bicameral.${spec.tool}`, arguments: spec.toArgs(body) },
          res,
        );
        if (blocked) return;
      }
      const result = await spec.invoke(client, body);
      res.json({ ok: true, result });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
}

/** The 11 tool specs — 5 governed mutations + 6 direct query tools. */
export const BICAMERAL_TOOL_SPECS: BicameralToolSpec[] = [
  // ── mutation tools (governed through the interceptor seam) ──────────────
  {
    tool: "ingest", governed: true,
    parse: (b) => (str(b.repoPath) ? null : "repoPath required (non-empty string)"),
    toArgs: (b) => ({ repo_path: b.repoPath }),
    invoke: (c, b) => c.ingest({ repoPath: b.repoPath as string }),
  },
  {
    tool: "update", governed: true,
    parse: (b) =>
      !str(b.decisionId) ? "decisionId required (non-empty string)"
        : (b.payload && typeof b.payload === "object" ? null : "payload required (object)"),
    toArgs: (b) => ({ decision_id: b.decisionId, payload: b.payload }),
    invoke: (c, b) => c.update({
      decisionId: b.decisionId as string,
      payload: b.payload as Record<string, unknown>,
    }),
  },
  {
    tool: "reset", governed: true,
    parse: () => null,
    toArgs: (b) => (str(b.scope) ? { scope: b.scope } : {}),
    invoke: (c, b) => c.reset(str(b.scope) ? { scope: b.scope as string } : {}),
  },
  {
    tool: "resolveCompliance", governed: true,
    parse: (b) =>
      !str(b.decisionId) ? "decisionId required (non-empty string)"
        : (str(b.resolution) ? null : "resolution required (non-empty string)"),
    toArgs: (b) => ({ decision_id: b.decisionId, resolution: b.resolution }),
    invoke: (c, b) => c.resolveCompliance({
      decisionId: b.decisionId as string,
      resolution: b.resolution as string,
    }),
  },
  {
    tool: "linkCommit", governed: true,
    parse: (b) =>
      !str(b.commitSha) ? "commitSha required (non-empty string)"
        : (str(b.decisionId) ? null : "decisionId required (non-empty string)"),
    toArgs: (b) => ({ commit_sha: b.commitSha, decision_id: b.decisionId }),
    invoke: (c, b) => c.linkCommit({
      commitSha: b.commitSha as string,
      decisionId: b.decisionId as string,
    }),
  },
  // ── query tools (call the client method directly) ──────────────────────
  {
    tool: "search", governed: false,
    parse: (b) => (str(b.query) ? null : "query required (non-empty string)"),
    toArgs: (b) => ({ query: b.query }),
    invoke: (c, b) => c.search({ query: b.query as string }),
  },
  {
    tool: "brief", governed: false,
    parse: (b) => (str(b.feature) ? null : "feature required (non-empty string)"),
    toArgs: (b) => ({ feature: b.feature }),
    invoke: (c, b) => c.brief({ feature: b.feature as string }),
  },
  {
    tool: "judgeGaps", governed: false,
    parse: (b) => (str(b.feature) ? null : "feature required (non-empty string)"),
    toArgs: (b) => ({ feature: b.feature }),
    invoke: (c, b) => c.judgeGaps({ feature: b.feature as string }),
  },
  {
    tool: "dashboard", governed: false,
    parse: () => null,
    toArgs: () => ({}),
    invoke: (c) => c.dashboard(),
  },
  {
    tool: "validateSymbols", governed: false,
    parse: (b) =>
      Array.isArray(b.symbols) && b.symbols.every((s) => typeof s === "string")
        ? null : "symbols required (string array)",
    toArgs: (b) => ({ symbols: b.symbols }),
    invoke: (c, b) => c.validateSymbols({ symbols: b.symbols as string[] }),
  },
  {
    tool: "getNeighbors", governed: false,
    parse: (b) => (str(b.decisionId) ? null : "decisionId required (non-empty string)"),
    toArgs: (b) => ({ decision_id: b.decisionId }),
    invoke: (c, b) => c.getNeighbors({ decisionId: b.decisionId as string }),
  },
];

/**
 * Register all 11 Bicameral tool routes. Called once from setupBicameralRoutes.
 * Governed specs route through BicameralRoute's `governToolCall` interceptor
 * seam; query specs invoke the client directly.
 */
export function registerBicameralToolRoutes(
  app: import("express").Application,
  deps: BicameralRouteDeps,
): void {
  for (const spec of BICAMERAL_TOOL_SPECS) {
    bicameralToolRoute(app, deps, spec);
  }
}

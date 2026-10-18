/**
 * #538 (plan-538b LD4): refuse Console POSTs that did not come from the Console page on
 * this machine. Runs as middleware before any rate limiter, so refused cross-site
 * requests never spend a route's budget.
 *
 * - Host: the hostname must be `localhost`, `127.0.0.1` or `::1` (DNS rebinding sends the
 *   attacker's name). The port is not pinned: under VS Code remote development the
 *   forwarded port differs from the Console's, and browsers cannot set Host.
 * - Origin: when sent, it must be exactly `http://` + the request's Host (any other page,
 *   `null`, a webview or https is refused). Non-browser local clients send none.
 * - Content type (when required): the media type before the first `;`, lowercased, must
 *   equal `application/json`. Browsers send cross-site `text/plain` POSTs without a
 *   preflight; JSON needs one, which the Console never grants.
 *
 * Refused as a result: Consoles reached through a browser-based remote (Codespaces,
 * vscode.dev, code-server behind https) and the cross-port workspace switcher. The VS Code
 * commands remain the path for those.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

export type ConsoleRequestRefusal = "host" | "origin" | "content-type";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/** Hostname of a Host header value, or null when it is malformed. */
export function hostnameOf(host: string): string | null {
  const h = host.trim().toLowerCase();
  if (!h) return null;
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    if (end < 0) return null;
    const rest = h.slice(end + 1);
    if (rest && !/^:\d+$/.test(rest)) return null;
    return h.slice(1, end);
  }
  const parts = h.split(":");
  if (parts.length > 2 || (parts.length === 2 && !/^\d+$/.test(parts[1]))) return null;
  return parts[0];
}

/** Media type of a Content-Type header: the part before the first `;`, trimmed and lowercased. */
export function mediaTypeOf(contentType: unknown): string {
  return String(contentType ?? "").split(";")[0].trim().toLowerCase();
}

export function consoleRequestRefusal(
  req: { headers: Record<string, string | string[] | undefined> },
  options: { requireJson: boolean },
): ConsoleRequestRefusal | null {
  const host = req.headers.host;
  if (typeof host !== "string" || !LOOPBACK_HOSTNAMES.has(hostnameOf(host) ?? "")) return "host";
  const origin = req.headers.origin;
  if (origin !== undefined && String(origin).trim().toLowerCase() !== `http://${host.trim().toLowerCase()}`) return "origin";
  if (options.requireJson && mediaTypeOf(req.headers["content-type"]) !== "application/json") return "content-type";
  return null;
}

const REFUSALS: Record<ConsoleRequestRefusal, { status: number; error: string }> = {
  host: { status: 403, error: "Refused: this request was not addressed to the FailSafe Console on this machine; nothing was run." },
  origin: { status: 403, error: "Refused: this request came from another web page; nothing was run. Use the FailSafe command in VS Code instead." },
  "content-type": { status: 415, error: "Refused: send this request as application/json; nothing was run." },
};

/**
 * Middleware: the loopback socket check (`rejectIfRemote`), then the Host, Origin and
 * (by default) content-type checks. Answers and stops on the first refusal.
 */
export function consoleRequestGuard(
  rejectIfRemote: (req: Request, res: Response) => boolean,
  options: { requireJson?: boolean } = {},
): RequestHandler {
  const requireJson = options.requireJson ?? true;
  return (req: Request, res: Response, next: NextFunction) => {
    if (rejectIfRemote(req, res)) return;
    const refusal = consoleRequestRefusal(req, { requireJson });
    if (refusal) {
      res.status(REFUSALS[refusal].status).json({ ok: false, guard: refusal, error: REFUSALS[refusal].error });
      return;
    }
    next();
  };
}

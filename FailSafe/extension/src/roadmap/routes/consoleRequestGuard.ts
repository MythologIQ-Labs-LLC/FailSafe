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
 *
 * #564 (plan-564-websocket-origin): two stricter rules for every request, not only POSTs.
 * - consoleHostGuard: an app-wide middleware, registered before every route, that refuses any
 *   HTTP request whose Host is not exactly a loopback name for the address family the
 *   connection arrived on (consoleHostRefusal). The port is not pinned. A DNS-rebinding page
 *   sends its own name and is refused; so are browser-based remotes, whose Host is a proxy name.
 * - consoleWebSocketRefusal: a WebSocket handshake needs protocol 13, a loopback peer, that Host
 *   rule, and an Origin equal to exactly `http://` + the Host. Browsers always send Origin on a
 *   handshake and a handshake gets no CORS protection, so a missing Origin is refused.
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

// ---------------------------------------------------------------- #564 Host and WebSocket rules

export type ConsoleHostRefusal = "listener" | "host";
export type ConsoleWebSocketRefusal = "version" | "remote" | ConsoleHostRefusal | "origin";

/** The loopback peer addresses (the set ConsoleServer.isLocalRequest also checks). */
export function isLoopbackAddress(address: unknown): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/** Exact Host values for a connection that arrived on 127.0.0.1 or ::1 (any port, or none). */
const HOST_BY_LOCAL: Record<string, RegExp> = {
  "127.0.0.1": /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/,
  "::1": /^(localhost|\[::1\])(:\d{1,5})?$/,
};

/**
 * Null, or why this Host is refused: the connection did not arrive on 127.0.0.1 or ::1
 * (`listener`), or the Host is not a string that is exactly a loopback name for that family,
 * lowercased, with an optional port (`host`). `localhost.`, `127.0.0.2`, numeric or long forms
 * and a rebinding name are all refused.
 */
export function consoleHostRefusal(host: unknown, localAddress: unknown): ConsoleHostRefusal | null {
  const rule = typeof localAddress === "string" && Object.prototype.hasOwnProperty.call(HOST_BY_LOCAL, localAddress)
    ? HOST_BY_LOCAL[localAddress] : null;
  if (!rule) return "listener";
  if (typeof host !== "string" || !rule.test(host.toLowerCase())) return "host";
  return null;
}

const HOST_REFUSAL = {
  status: 403,
  error: "Refused: this request was not addressed to the FailSafe Console on this machine by a loopback name; nothing was run.",
};

/** App-wide middleware (#564 R1): answers 403 before any route when the Host is refused. */
export function consoleHostGuard(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (consoleHostRefusal(req.headers.host, req.socket?.localAddress) !== null) {
      res.status(HOST_REFUSAL.status).json({ ok: false, guard: "host", error: HOST_REFUSAL.error });
      return;
    }
    next();
  };
}

/**
 * Null, or why a WebSocket handshake is refused: not protocol 13 (`version`, which also refuses
 * protocol 8's Sec-WebSocket-Origin), a peer that is not loopback (`remote`), the Host rule
 * (`listener`, `host`), or an Origin that is not exactly `http://` + the Host (`origin`: missing,
 * `null`, another site, another port, a path, whitespace, or a duplicated header).
 */
export function consoleWebSocketRefusal(req: {
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: unknown; localAddress?: unknown };
}): ConsoleWebSocketRefusal | null {
  const headers = req.headers;
  if (headers["sec-websocket-version"] !== "13") return "version";
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return "remote";
  const host = headers.host;
  const hostRefusal = consoleHostRefusal(host, req.socket?.localAddress);
  if (hostRefusal) return hostRefusal;
  const origin = headers.origin;
  if (typeof origin !== "string" || origin.toLowerCase() !== `http://${String(host).toLowerCase()}`) return "origin";
  return null;
}

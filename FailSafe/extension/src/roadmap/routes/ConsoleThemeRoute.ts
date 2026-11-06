/**
 * #601: Console theme routes.
 *
 * - GET  /api/v1/ui/theme     -> { theme, explicit } (read-only, like every other Console GET).
 * - GET  /api/v1/ui/theme.js  -> a one-line script that applies the theme before first paint.
 *   The value is taken from the fixed theme list, never from the request.
 * - POST /api/v1/ui/theme     -> changes the shared theme. Requires the Console request guard
 *   (loopback socket, loopback Host, exact Origin, application/json) AND the per-process theme
 *   key, which the extension host passes only to Console pages it opens itself. A request
 *   without the key changes nothing, so another page or a bare localhost client cannot write.
 *
 * Changes are not broadcast here: the authority notifies ConsoleServer, which broadcasts
 * `ui.theme` for every change, including those made in the sidebar or the Settings UI.
 */
import { createHash, timingSafeEqual } from "crypto";
import type express from "express";
import type { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { consoleRequestGuard } from "./consoleRequestGuard";
import type { ConsoleThemeAuthority } from "../services/ConsoleThemeAuthority";

export const THEME_KEY_HEADER = "x-failsafe-theme-key";

export interface ConsoleThemeRouteDeps {
  authority: ConsoleThemeAuthority;
  themeKey: string;
  rejectIfRemote(req: Request, res: Response): boolean;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time comparison of the presented key with the expected one. */
export function themeKeyMatches(presented: unknown, expected: string): boolean {
  if (typeof presented !== "string" || presented.length === 0 || expected.length === 0) return false;
  return timingSafeEqual(digest(presented), digest(expected));
}

export function registerConsoleThemeRoutes(app: express.Application, deps: ConsoleThemeRouteDeps): void {
  app.get("/api/v1/ui/theme", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(deps.authority.snapshot());
  });

  app.get("/api/v1/ui/theme.js", (_req, res) => {
    const { theme } = deps.authority.current();
    res.set("Cache-Control", "no-store");
    res.type("application/javascript");
    res.send(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)});\n`);
  });

  const limiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: false, legacyHeaders: false });
  app.post(
    "/api/v1/ui/theme",
    consoleRequestGuard((req, res) => deps.rejectIfRemote(req, res)),
    limiter,
    async (req: Request, res: Response) => {
      if (!themeKeyMatches(req.get(THEME_KEY_HEADER), deps.themeKey)) {
        res.status(401).json({ ok: false, error: "theme-key", message: "Open the Console from VS Code to change the theme; nothing was changed." });
        return;
      }
      const theme = await deps.authority.set(req.body?.theme);
      if (!theme) {
        res.status(400).json({ ok: false, error: "unsupported-theme", message: "That theme is not supported; nothing was changed." });
        return;
      }
      res.json({ ok: true, ...deps.authority.snapshot(), theme });
    },
  );
}

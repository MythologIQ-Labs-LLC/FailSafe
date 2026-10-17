/**
 * CommitCheckRoute (FX907, #83 Phase A) — GET /api/v1/governance/commit-check.
 *
 * The endpoint the FailSafe pre-commit hook (CommitGuard.writeHookScript)
 * queries. Contract constraints, both pinned by tests:
 *  - The hook runs `curl -sf`, which treats any non-2xx as server-unavailable
 *    and FAILS OPEN. Therefore BLOCK verdicts MUST be HTTP 200 with
 *    {allow:false, reason}. Only the invalid-token path returns 401 — a stale
 *    token after an extension restart is deliberately the same editor-down
 *    fail-open class, not a policy block.
 *  - The hook parses the body with grep ('"allow":true' / '"reason":"…"'), so
 *    the JSON field shapes are load-bearing.
 */
import type { Application, Request, Response } from "express";
import type { ApiRouteDeps } from "./types";

export const COULD_NOT_READ = "FailSafe could not read the active intent";

export function registerCommitCheckRoute(
  app: Application,
  deps: ApiRouteDeps,
): void {
  app.get(
    "/api/v1/governance/commit-check",
    async (req: Request, res: Response) => {
      const token =
        (req.header && req.header("X-FailSafe-Token")) ||
        (req.headers && (req.headers["x-failsafe-token"] as string)) ||
        "";
      if (!deps.validateCommitToken || !deps.validateCommitToken(token)) {
        res.status(401).json({ allow: false, reason: "invalid token" });
        return;
      }

      const hub = await deps.buildHubSnapshot();
      const modeState = hub.governanceModeState as { mode?: string } | undefined;
      const mode = modeState?.mode ?? "enforce";
      if (mode !== "enforce") {
        res.status(200).json({ allow: true });
        return;
      }
      // #532 part B (B283): the active intent comes from the IntentService, read at
      // request time. The hub payload has no activeIntent key, so reading it refused
      // every commit in enforce mode. Absent or failing reads block (HTTP 200).
      let active: unknown;
      try {
        if (!deps.getActiveIntent) throw new Error("intent service not wired");
        active = await deps.getActiveIntent();
      } catch {
        res.status(200).json({ allow: false, reason: COULD_NOT_READ });
        return;
      }
      if (active) {
        res.status(200).json({ allow: true });
        return;
      }
      res.status(200).json({
        allow: false,
        reason:
          "Enforce mode: no active intent — create one (FailSafe: Create Intent) or switch mode",
      });
    },
  );
}

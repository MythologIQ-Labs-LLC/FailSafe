import type { Application } from "express";
import type { ApiRouteDeps } from "./types";
import { setupBrainstormTranscriptRoutes } from "./brainstorm-transcript-routes";
import { setupBrainstormGraphRoutes } from "./brainstorm-graph-routes";
import { setupBrainstormPendingRoutes } from "./brainstorm-pending-routes";

export function setupBrainstormRoutes(app: Application, deps: ApiRouteDeps): void {
  setupBrainstormTranscriptRoutes(app, deps);
  setupBrainstormGraphRoutes(app, deps);
  setupBrainstormPendingRoutes(app, deps);
}

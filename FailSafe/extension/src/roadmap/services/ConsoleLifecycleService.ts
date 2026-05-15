/** ConsoleLifecycleService — owns start/stop/server-registry/WebSocket setup
 *  for ConsoleServer. Extracted from ConsoleServer.ts (Phase 60 §0). */
import * as path from "path";
import * as fs from "fs";
import * as net from "net";
import express from "express";
import { Server as HttpServer } from "http";
import { WebSocketManager } from "./WebSocketManager";
import { registerServer, markDisconnected } from "./ServerRegistry";
import type { HubSnapshotService } from "./HubSnapshotService";
import type { PlanManager } from "../../qorelogic/planning/PlanManager";

export interface ConsoleLifecycleDeps {
  app: express.Application;
  port: number;
  host: string;
  workspaceRoot: string;
  wsManager: WebSocketManager;
  hub: HubSnapshotService;
  planManager: PlanManager;
  broadcast: (d: Record<string, unknown>) => void;
}

export class ConsoleLifecycleService {
  private server: HttpServer | null = null;
  private actualPort: number;
  private ledgerWatcher: fs.FSWatcher | null = null;
  private ledgerDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: ConsoleLifecycleDeps) {
    this.actualPort = deps.port;
  }

  getPort(): number { return this.actualPort; }
  getServer(): HttpServer | null { return this.server; }

  async start(): Promise<void> {
    this.actualPort = await this.findAvailablePort(this.deps.port);
    this.server = this.deps.app.listen(this.actualPort, this.deps.host, () => {
      console.log(`Roadmap server: http://localhost:${this.actualPort}`);
    });
    this.setupWebSocket();
    this.watchMetaLedger();
    registerServer({
      port: this.actualPort,
      workspaceName: path.basename(this.deps.workspaceRoot),
      workspacePath: this.deps.workspaceRoot,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    this.deps.hub.recordCheckpoint({
      checkpointType: "snapshot.created", actor: "system",
      phase: this.deps.hub.inferPhaseKeyFromPlan(this.deps.planManager.getActivePlan()),
      status: "validated", policyVerdict: "PASS", evidenceRefs: [],
      payload: { source: "roadmap-server.start" },
    });
  }

  stop(): void {
    markDisconnected(this.actualPort);
    this.ledgerWatcher?.close();
    this.ledgerWatcher = null;
    this.deps.wsManager.close();
    this.server?.close();
  }

  private setupWebSocket(): void {
    if (!this.server) return;
    this.deps.wsManager.setup(this.server, (ws) => {
      this.deps.hub.buildHubSnapshot().then((hub) => {
        ws.send(JSON.stringify({ type: "init", payload: hub }));
      });
    });
  }

  private watchMetaLedger(): void {
    const ledgerPath = path.join(this.deps.workspaceRoot, "docs", "META_LEDGER.md");
    if (!fs.existsSync(ledgerPath)) return;
    try {
      this.ledgerWatcher = fs.watch(ledgerPath, () => {
        if (this.ledgerDebounceTimer) clearTimeout(this.ledgerDebounceTimer);
        this.ledgerDebounceTimer = setTimeout(() => {
          this.deps.broadcast({ type: "hub.refresh" });
        }, 1500);
      });
    } catch { /* File watcher unsupported — degrade silently */ }
  }

  private async findAvailablePort(preferred: number): Promise<number> {
    if (await this.isPortAvailable(preferred)) return preferred;
    for (let offset = 1; offset <= 10; offset++) {
      const candidate = preferred + offset;
      if (await this.isPortAvailable(candidate)) {
        console.log(`Port ${preferred} in use, using ${candidate}`);
        return candidate;
      }
    }
    return preferred;
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => server.close(() => resolve(true)));
      server.listen(port, this.deps.host);
    });
  }
}

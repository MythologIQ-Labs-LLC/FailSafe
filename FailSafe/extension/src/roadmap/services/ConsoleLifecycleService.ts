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
import type { WorkspaceMutationBus, MutationDisposable } from "../../shared/WorkspaceMutationBus";

export interface ConsoleLifecycleDeps {
  app: express.Application;
  port: number;
  host: string;
  workspaceRoot: string;
  wsManager: WebSocketManager;
  hub: HubSnapshotService;
  planManager: PlanManager;
  broadcast: (d: Record<string, unknown>) => void;
  /** Optional WorkspaceMutationBus (B192 remediation). When provided,
   *  watchMetaLedger routes through the shared bus; otherwise falls back
   *  to direct fs.watch (back-compat). */
  mutationBus?: WorkspaceMutationBus;
}

export class ConsoleLifecycleService {
  private server: HttpServer | null = null;
  private actualPort: number;
  private ledgerWatcher: fs.FSWatcher | null = null;
  private ledgerDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private ledgerWatcherDisposable: MutationDisposable | null = null;

  constructor(private readonly deps: ConsoleLifecycleDeps) {
    this.actualPort = deps.port;
  }

  getPort(): number { return this.actualPort; }
  getServer(): HttpServer | null { return this.server; }

  async start(): Promise<void> {
    // Repeated activation must not open another listener or register duplicate
    // readiness for a server that is already serving this workspace.
    if (this.server?.listening) return;
    this.actualPort = await this.findAvailablePort(this.deps.port);

    // EADDRINUSE can occur between probing and binding. Do not begin the
    // WebSocket service, ledger watcher, registry, or readiness checkpoint
    // until the HTTP server has emitted the actual listening event (#471).
    const server = await new Promise<HttpServer>((resolve, reject) => {
      let candidate: HttpServer;
      try {
        candidate = this.deps.app.listen(this.actualPort, this.deps.host);
      } catch (error) {
        reject(error);
        return;
      }
      const onListening = () => {
        candidate.removeListener("error", onError);
        resolve(candidate);
      };
      const onError = (error: Error) => {
        candidate.removeListener("listening", onListening);
        reject(error);
      };
      candidate.once("listening", onListening);
      candidate.once("error", onError);
    });
    this.server = server;
    const address = server.address();
    if (address && typeof address !== "string") this.actualPort = address.port;
    console.log(`Roadmap server: http://localhost:${this.actualPort}`);

    this.setupWebSocket();
    this.watchMetaLedger();
    registerServer({
      port: this.actualPort,
      workspaceName: path.basename(this.deps.workspaceRoot),
      workspacePath: this.deps.workspaceRoot,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    // A successful bind is transport readiness, NOT a passing policy audit.
    this.deps.hub.recordCheckpoint({
      checkpointType: "snapshot.created", actor: "system",
      phase: this.deps.hub.inferPhaseKeyFromPlan(this.deps.planManager.getActivePlan()),
      status: "validated", policyVerdict: "UNKNOWN", evidenceRefs: [],
      payload: { source: "roadmap-server.start", transport: "listening" },
    });
  }

  stop(): void {
    if (this.server) markDisconnected(this.actualPort);
    this.ledgerWatcher?.close();
    this.ledgerWatcher = null;
    if (this.ledgerWatcherDisposable) {
      try { this.ledgerWatcherDisposable.dispose(); } catch { /* already gone */ }
      this.ledgerWatcherDisposable = null;
    }
    if (this.ledgerDebounceTimer) clearTimeout(this.ledgerDebounceTimer);
    this.ledgerDebounceTimer = null;
    this.deps.wsManager.close();
    this.server?.close();
    this.server = null;
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
    // B192 remediation: prefer the shared WorkspaceMutationBus when wired.
    // Bus internally applies its own debounce; we pass 1500ms to preserve
    // the historical behavior of this specific watcher.
    if (this.deps.mutationBus) {
      this.ledgerWatcherDisposable = this.deps.mutationBus.registerWatcher(
        ledgerPath,
        () => this.broadcastLedgerChange(),
        1500,
      );
      return;
    }
    // Fall-back path (back-compat for callers that don't provide a bus).
    try {
      this.ledgerWatcher = fs.watch(ledgerPath, () => {
        if (this.ledgerDebounceTimer) clearTimeout(this.ledgerDebounceTimer);
        this.ledgerDebounceTimer = setTimeout(() => {
          this.broadcastLedgerChange();
        }, 1500);
      });
    } catch { /* File watcher unsupported — degrade silently */ }
  }

  /** Broadcast on META_LEDGER mutation: hub.refresh for the existing console
   *  surfaces + tracker.refresh so the Development Tracker (Tracker v1.1) re-fetches
   *  its freshly-generated model. */
  private broadcastLedgerChange(): void {
    this.deps.broadcast({ type: "hub.refresh" });
    this.deps.broadcast({ type: "tracker.refresh" });
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
    throw new Error(`No available Roadmap server port in range ${preferred}..${preferred + 10}`);
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

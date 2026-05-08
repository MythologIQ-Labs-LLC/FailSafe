// Phase 2 helper: boot a REAL ConsoleServer against fake managers and serve
// its routes + WebSocket on an ephemeral 127.0.0.1 port. Sibling to
// `serveCompactUI.ts` (which mimics the Monitor surface); this helper instead
// drives the actual Express app + WebSocketManager via private-cast hooks
// (per the established pattern at `consoleServer.test.ts:16-29`).
//
// Verdict-injection chain (F1a, plan v5):
//   step 4.5 below points `server.checkpointMemory` at `checkpointRef`
//   (helper-owned array) and nulls out `checkpointDb`. Subsequent
//   `setVerdicts(...)` mutations mutate `checkpointRef` in place; because the
//   private field IS the same reference, ConsoleServer's
//   `getRecentVerdicts -> ckptGetRecentVerdicts(null, memory, limit)` falls
//   back to memory and returns the mutated state on the next request.

import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import type { AddressInfo } from "net";
import type { Application } from "express";
import { WebSocket } from "ws";

import { ConsoleServer } from "../../../roadmap/ConsoleServer";
import { EventBus } from "../../../shared/EventBus";
import type { WebSocketManager } from "../../../roadmap/services/WebSocketManager";
import type { CheckpointDb, CheckpointRecord } from "../../../roadmap/services/CheckpointStore";
import type {
  CatalogItem,
  RiskEntry,
  TimelineEvent,
} from "./consoleServerFixtures";
import type { HubFixture, ShieldEntry } from "./ledgerFixtures";

export interface ConsoleServerFixtures {
  workspaceRoot?: string;
  ledgerEntries?: ShieldEntry[];
  initialVerdicts?: CheckpointRecord[];
  marketplaceCatalog?: CatalogItem[];
  timelineEvents?: TimelineEvent[];
  risks?: RiskEntry[];
  initialHub?: HubFixture;
}

export interface ConsoleServerController {
  url: string;
  setHub(hub: HubFixture): void;
  setVerdicts(verdicts: CheckpointRecord[]): void;
  broadcast(message: { type: string; payload?: unknown }): void;
  closeAllSockets(): void;
  close(): Promise<void>;
}

interface FakeManagers {
  planManager: unknown;
  qorelogicManager: unknown;
  sentinelDaemon: unknown;
  hubRef: { current: HubFixture | null };
}

function writeWorkspaceFixtures(
  workspaceRoot: string,
  fixtures: ConsoleServerFixtures,
): void {
  const logsDir = path.join(workspaceRoot, ".failsafe", "logs");
  const risksDir = path.join(workspaceRoot, ".failsafe", "risks");
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(risksDir, { recursive: true });
  const events = fixtures.timelineEvents ?? [];
  const jsonl = events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
  fs.writeFileSync(path.join(logsDir, "transparency.jsonl"), jsonl, "utf8");
  fs.writeFileSync(
    path.join(risksDir, "risks.json"),
    JSON.stringify({ risks: fixtures.risks ?? [] }),
    "utf8",
  );
}

function buildFakeManagers(initialHub: HubFixture | null): FakeManagers {
  const hubRef: { current: HubFixture | null } = { current: initialHub };
  const planManager = {
    getAllSprints: () => [],
    getCurrentSprint: () => null,
    getActivePlan: () => null,
  };
  const qorelogicManager = {
    getLedgerManager: () => null,
    getL3Queue: () => [],
    getTrustEngine: () => ({ getAllAgents: async () => [] }),
    getShadowGenomeManager: () => ({
      analyzeFailurePatterns: () => [],
      analyzeAllPatterns: () => [],
      getUnresolvedEntries: () => [],
    }),
  };
  const sentinelDaemon = {
    getStatus: () => ({ running: false, queueDepth: 0 }),
  };
  return { planManager, qorelogicManager, sentinelDaemon, hubRef };
}

function applyPrivateCast(
  server: ConsoleServer,
  checkpointRef: CheckpointRecord[],
): void {
  const priv = server as unknown as {
    checkpointMemory: CheckpointRecord[];
    checkpointDb: CheckpointDb;
    securityScanner: {
      checkAvailability: () => Promise<{
        garak: boolean;
        promptfoo: boolean;
        lastChecked: string;
      }>;
    };
  };
  priv.checkpointMemory = checkpointRef;
  priv.checkpointDb = null;
  // Stub scanner availability so /api/marketplace/catalog doesn't hang
  // running `garak --version` / `npx promptfoo --version` subprocesses on
  // hosts that lack them. Real availability is irrelevant to the surfaces
  // these specs cover (catalog shape + UI coherence). Test-fixture only.
  priv.securityScanner.checkAvailability = async () => ({
    garak: false,
    promptfoo: false,
    lastChecked: new Date().toISOString(),
  });
}

function attachWebSocket(
  server: ConsoleServer,
  harness: http.Server,
  sockets: Set<WebSocket>,
): void {
  const wsm = (server as unknown as { wsManager: WebSocketManager }).wsManager;
  wsm.setup(harness, (ws) => {
    sockets.add(ws);
    const initPayload = { type: "init", payload: {} };
    try {
      ws.send(JSON.stringify(initPayload));
    } catch {
      /* socket may already be closing — safe to ignore in fixture */
    }
    ws.on("close", () => sockets.delete(ws));
  });
}

async function listenAndResolveUrl(harness: http.Server): Promise<string> {
  await new Promise<void>((resolve) => {
    harness.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = harness.address() as AddressInfo | null;
  if (!addr || typeof addr === "string") {
    throw new Error("serveConsoleServerUI: failed to bind harness");
  }
  return `http://127.0.0.1:${addr.port}`;
}

function terminateAll(sockets: Set<WebSocket>): void {
  for (const ws of sockets) {
    try { ws.terminate(); } catch { /* socket already gone */ }
  }
  sockets.clear();
}

function buildController(
  url: string,
  harness: http.Server,
  sockets: Set<WebSocket>,
  checkpointRef: CheckpointRecord[],
  hubRef: { current: HubFixture | null },
): ConsoleServerController {
  const broadcastRaw = (raw: string): void => {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) ws.send(raw);
    }
  };
  return {
    url,
    setHub(hub) {
      hubRef.current = hub;
      broadcastRaw(JSON.stringify({ type: "hub.refresh" }));
    },
    setVerdicts(verdicts) {
      checkpointRef.length = 0;
      checkpointRef.push(...verdicts);
    },
    broadcast(message) { broadcastRaw(JSON.stringify(message)); },
    closeAllSockets() { terminateAll(sockets); },
    close() {
      terminateAll(sockets);
      return new Promise<void>((resolve, reject) => {
        harness.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

export async function serveConsoleServerUI(
  fixtures: ConsoleServerFixtures = {},
): Promise<ConsoleServerController> {
  const workspaceRoot = fixtures.workspaceRoot
    || fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-console-server-fixture-"));
  writeWorkspaceFixtures(workspaceRoot, fixtures);

  const fakes = buildFakeManagers(fixtures.initialHub ?? null);
  const eventBus = new EventBus();
  const checkpointRef: CheckpointRecord[] = [...(fixtures.initialVerdicts ?? [])];

  const server = new ConsoleServer(
    fakes.planManager as never,
    fakes.qorelogicManager as never,
    fakes.sentinelDaemon as never,
    eventBus,
    { workspaceRoot },
  );
  applyPrivateCast(server, checkpointRef);

  const app = (server as unknown as { app: Application }).app;
  const harness = http.createServer(app);
  const sockets = new Set<WebSocket>();
  attachWebSocket(server, harness, sockets);

  const url = await listenAndResolveUrl(harness);
  return buildController(url, harness, sockets, checkpointRef, fakes.hubRef);
}

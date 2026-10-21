import { WebSocketServer, WebSocket, type VerifyClientCallbackAsync } from "ws";
import type { Server } from "http";
import { consoleWebSocketRefusal } from "../routes/consoleRequestGuard";

/**
 * Manages WebSocket connections and broadcasts for the ConsoleServer.
 * Framework-agnostic — portable to any HTTP server.
 */
export class WebSocketManager {
  private wss: WebSocketServer | null = null;

  /**
   * #564: every handshake passes consoleWebSocketRefusal before the upgrade completes; a refusal,
   * or anything that throws while checking, answers 403, so `onConnect` never runs for it and the
   * socket never joins the broadcast set.
   */
  setup(server: Server, onConnect: (ws: WebSocket) => void): void {
    const verifyClient: VerifyClientCallbackAsync = (info, cb) => {
      let refused = true;
      try { refused = consoleWebSocketRefusal(info.req) !== null; } catch { refused = true; }
      if (refused) cb(false, 403, "Forbidden");
      else cb(true);
    };
    this.wss = new WebSocketServer({ server, verifyClient });
    this.wss.on("connection", onConnect);
  }

  /** Connected clients (0 before setup). */
  clientCount(): number {
    return this.wss ? this.wss.clients.size : 0;
  }

  broadcast(data: Record<string, unknown>): void {
    if (!this.wss) return;
    const message = JSON.stringify(data);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }

  close(): void {
    if (!this.wss) return;
    // wss.close() alone only stops accepting new upgrades; per the `ws`
    // library it does not close already-established client connections
    // (it waits for them to disconnect on their own before emitting
    // 'close'). Without terminating clients here, every repeated
    // start/stop cycle (activation, deactivation, workspace reload) leaks
    // open sockets for as long as the client stays connected.
    for (const client of this.wss.clients) client.terminate();
    this.wss.close();
    this.wss = null;
  }
}

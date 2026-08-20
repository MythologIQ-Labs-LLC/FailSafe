import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

/**
 * Manages WebSocket connections and broadcasts for the ConsoleServer.
 * Framework-agnostic — portable to any HTTP server.
 */
export class WebSocketManager {
  private wss: WebSocketServer | null = null;

  setup(server: Server, onConnect: (ws: WebSocket) => void): void {
    this.wss = new WebSocketServer({ server });
    this.wss.on("connection", onConnect);
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

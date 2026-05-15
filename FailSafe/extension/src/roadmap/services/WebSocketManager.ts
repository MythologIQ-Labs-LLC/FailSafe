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
    this.wss?.close();
    this.wss = null;
  }
}

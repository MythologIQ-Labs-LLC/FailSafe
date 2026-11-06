/**
 * FailSafe Client SDK - Lightweight browser-compatible API client
 *
 * Provides typed access to the FailSafe API server for webviews,
 * standalone browsers, and Tauri apps. No Node.js imports.
 */

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
}

export interface SystemStatus {
  governance: { mode: string };
  sentinel: { running: boolean; mode: string };
  features: { tier: string };
}

export interface Verdict {
  id: string;
  filePath: string;
  level: string;
  message: string;
  timestamp: string;
}

export interface TrustScore {
  did: string;
  score: number;
  label: string;
  lastUpdated: string;
}

/** Current /api/v1/trust response. A checkpoint count is NOT a verified
 * agent score; overall remains null until genuine policy verification exists. */
export interface TrustOverview {
  overall: number | null;
  status: 'no_evidence' | 'unverified';
  checkpointCount: number;
  passCount: number;
}

export interface Risk {
  id: string;
  title: string;
  severity: string;
  status: string;
  description: string;
}

export interface FailSafeEvent {
  type: string;
  timestamp: string;
  payload: unknown;
  seq: number;
}

export class FailSafeClient {
  constructor(
    private baseUrl = typeof (globalThis as any).window !== "undefined"
      ? (globalThis as any).window.location.origin
      : "http://localhost:9376",
  ) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(`GET ${path}: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`POST ${path}: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`PUT ${path}: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  private async del(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: "DELETE" });
    if (!res.ok) {
      throw new Error(`DELETE ${path}: ${res.status} ${res.statusText}`);
    }
  }

  // Health & Status
  async getHealth(): Promise<HealthResponse> {
    return this.get("/api/v1/health");
  }
  async getStatus(): Promise<SystemStatus> {
    return this.get("/api/v1/status");
  }

  // Governance
  async getGovernanceMode(): Promise<{ mode: string }> {
    return this.get("/api/v1/governance/mode");
  }
  async setGovernanceMode(mode: string): Promise<void> {
    await this.put("/api/v1/governance/mode", { mode });
  }

  // Sentinel
  async getSentinelStatus(): Promise<{ running: boolean; mode: string }> {
    return this.get("/api/v1/sentinel/status");
  }
  async getVerdicts(limit = 50): Promise<Verdict[]> {
    return this.get(`/api/v1/sentinel/verdicts?limit=${limit}`);
  }

  // Trust
  async getTrustScores(): Promise<TrustOverview> {
    return this.get("/api/v1/trust");
  }
  async getTrustScore(did: string): Promise<TrustScore> {
    return this.get(`/api/v1/trust/${encodeURIComponent(did)}`);
  }

  // Risks
  async getRisks(): Promise<Risk[]> {
    return this.get("/api/v1/risks");
  }
  async createRisk(risk: Omit<Risk, "id">): Promise<Risk> {
    return this.post("/api/v1/risks", risk);
  }
  async updateRisk(id: string, updates: Partial<Risk>): Promise<Risk> {
    return this.put(`/api/v1/risks/${encodeURIComponent(id)}`, updates);
  }
  async deleteRisk(id: string): Promise<void> {
    await this.del(`/api/v1/risks/${encodeURIComponent(id)}`);
  }

  // Features
  async getFeatures(): Promise<Record<string, boolean>> {
    return this.get("/api/v1/features");
  }
  async getFeature(flag: string): Promise<{ enabled: boolean; tier: string }> {
    return this.get(`/api/v1/features/${encodeURIComponent(flag)}`);
  }

  // SSE Event Subscription
  subscribe(callback: (event: FailSafeEvent) => void): () => void {
    const source = new EventSource(`${this.baseUrl}/api/v1/events/stream`);

    source.onmessage = (e) => {
      try {
        const event: FailSafeEvent = JSON.parse(e.data);
        callback(event);
      } catch {
        // Ignore malformed events
      }
    };

    source.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };

    return () => source.close();
  }
}

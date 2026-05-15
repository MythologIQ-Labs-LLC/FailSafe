import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { EventBus } from "../shared/EventBus";
import { ConsoleServer } from "../roadmap/ConsoleServer";
import { ProjectOverviewPanel } from "../genesis/panels/ProjectOverviewPanel";
import { RiskRegisterProvider } from "../genesis/views/RiskRegisterProvider";

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

suite("Security hardening coverage", () => {
  test("enforces local-only request checks in ConsoleServer guard methods", () => {
    const workspaceRoot = mkTempDir("failsafe-sec-guard-");
    try {
      const eventBus = new EventBus();
      const fakePlanManager = {
        getAllSprints: () => [],
        getCurrentSprint: () => null,
        getActivePlan: () => null,
      };
      const fakeQorLogicManager = {
        getLedgerManager: () => null,
      };
      const fakeSentinelDaemon = {
        getStatus: () => ({ running: false, queueDepth: 0 }),
      };

      const server = new ConsoleServer(
        fakePlanManager as never,
        fakeQorLogicManager as never,
        fakeSentinelDaemon as never,
        eventBus,
        { workspaceRoot },
      ) as never as {
        isLocalRequest: (req: unknown) => boolean;
        rejectIfRemote: (req: unknown, res: unknown) => boolean;
      };

      assert.strictEqual(
        server.isLocalRequest({ socket: { remoteAddress: "127.0.0.1" } }),
        true,
      );
      assert.strictEqual(
        server.isLocalRequest({ socket: { remoteAddress: "::1" } }),
        true,
      );
      assert.strictEqual(
        server.isLocalRequest({ socket: { remoteAddress: "192.168.1.10" } }),
        false,
      );

      let statusCode: number | undefined;
      let errorBody: unknown;
      const fakeRes = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(body: unknown) {
          errorBody = body;
          return this;
        },
      };
      const blocked = server.rejectIfRemote(
        { socket: { remoteAddress: "10.0.0.2" } },
        fakeRes,
      );

      assert.strictEqual(blocked, true);
      assert.strictEqual(statusCode, 403);
      assert.strictEqual(
        String((errorBody as { error?: string }).error || ""),
        "Forbidden: local access only",
      );
      eventBus.dispose();
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("renders ProjectOverviewPanel HTML with escaped dynamic values and vscode API bridge", async () => {
    const html = await (
      ProjectOverviewPanel as never as {
        prototype: { getHtmlContent: (this: unknown) => Promise<string> };
      }
    ).prototype.getHtmlContent.call({
      panel: { webview: { cspSource: "vscode-webview://test" } },
      getOverviewData: async () => ({
        projectName: 'proj-<img src=x onerror=alert("xss")>',
        governancePosture: {
          sentinelRunning: true,
          activeIntent: true,
          l3QueueDepth: 0,
          avgTrustScore: 0.9,
        },
        riskSummary: {
          total: 1,
          openCritical: 0,
          openHigh: 0,
        },
        planProgress: {
          hasPlan: true,
          title: 'plan-<script>alert("x")</script>',
          percentComplete: 50,
          currentPhase: 'phase-<svg onload=alert("x")>',
        },
        recentActivity: [],
      }),
    });

    assert.strictEqual(html.includes("acquireVsCodeApi()"), true);
    assert.strictEqual(html.includes("proj-<img"), false);
    assert.strictEqual(
      html.includes('plan-<script>alert("x")</script>'),
      false,
    );
    assert.strictEqual(html.includes('phase-<svg onload=alert("x")>'), false);
    assert.strictEqual(html.includes("&lt;img"), true);
    assert.strictEqual(html.includes("&lt;script&gt;"), true);
    assert.strictEqual(html.includes("&lt;svg"), true);
  });

  test("escapes risk IDs before embedding them into inline JS handlers", () => {
    const eventBus = new EventBus();
    const provider = new RiskRegisterProvider(
      vscode.Uri.file(path.join(os.tmpdir(), "failsafe-test")),
      {
        getAllRisks: () => [],
        getSummary: () => ({
          total: 0,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
          byStatus: { open: 0, mitigating: 0, resolved: 0, accepted: 0 },
          byCategory: {
            security: 0,
            performance: 0,
            "technical-debt": 0,
            dependency: 0,
            governance: 0,
            compliance: 0,
            operational: 0,
          },
          openCritical: 0,
          openHigh: 0,
        }),
      } as never,
      eventBus,
    ) as never as {
      renderRiskItem: (risk: unknown) => string;
      dispose: () => void;
    };

    const cardHtml = provider.renderRiskItem({
      id: "risk-'x'\"y",
      title: "x",
      description: "y",
      impact: "",
      severity: "low",
      status: "open",
    });

    assert.strictEqual(cardHtml.includes("id:'risk-\\'x\\'\\\"y'"), true);
    assert.strictEqual(cardHtml.includes("id:'risk-'x'\"y'"), false);
    provider.dispose();
    eventBus.dispose();
  });

  test("contributes risk commands and sidebar view in extension manifest", () => {
    const manifestPath = path.resolve(__dirname, "../../package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      contributes?: {
        commands?: Array<{ command?: string }>;
        views?: Record<string, Array<{ id?: string }>>;
      };
    };

    const commands = new Set(
      (manifest.contributes?.commands || []).map((c) => c.command || ""),
    );
    assert.strictEqual(commands.has("failsafe.openRiskRegister"), true);
    assert.strictEqual(commands.has("failsafe.addRisk"), true);

    const sidebarViews = manifest.contributes?.views?.["failsafe-sidebar-container"] || [];
    const viewIds = new Set(sidebarViews.map((v) => v.id || ""));
    assert.strictEqual(viewIds.has("failsafe.sidebarView"), true);
  });
});

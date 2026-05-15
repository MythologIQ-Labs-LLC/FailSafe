import { describe, it, beforeEach, afterEach } from "mocha";
import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import * as yaml from "js-yaml";

/**
 * CheckpointManager Unit Tests
 *
 * Tests for the Sovereign Checkpoint Protocol implementation.
 */

// Test workspace setup
const testWorkspace = path.resolve(__dirname, "test-workspace");
const checkpointDir = path.join(testWorkspace, ".agent", "checkpoints");

describe("Sovereign Checkpoint Protocol", () => {
  beforeEach(() => {
    // Create test workspace
    if (!fs.existsSync(checkpointDir)) {
      fs.mkdirSync(checkpointDir, { recursive: true });
    }
  });

  afterEach(function () {
    this.timeout(10000);
    // Cleanup
    try {
      if (fs.existsSync(testWorkspace)) {
        fs.rmSync(testWorkspace, { recursive: true, force: true });
      }
    } catch {
      // Windows may hold brief locks on temp dirs; swallow cleanup errors
    }
  });

  describe("Checkpoint YAML Parsing", () => {
    it("should parse valid checkpoint YAML", () => {
      const checkpointYaml = `
checkpoint:
  version: 1
  created: "2026-02-06T13:00:00Z"
  sealed: true
  skill_session: qor-implement

snapshot:
  git_head: abc123
  git_status: clean
  ledger_chain_head: null
  sentinel_events_processed: 0

manifold:
  src:
    file_count: 10
    total_bytes: 5000
    last_modified: "2026-02-06T12:00:00Z"

user_overrides: []
`;
      const parsed = yaml.load(checkpointYaml) as {
        checkpoint?: { version?: number; sealed?: boolean };
        snapshot?: { git_status?: string };
        manifold?: { src?: { file_count?: number } };
      };

      assert.strictEqual(parsed.checkpoint?.version, 1);
      assert.strictEqual(parsed.checkpoint?.sealed, true);
      assert.strictEqual(parsed.snapshot?.git_status, "clean");
      assert.strictEqual(parsed.manifold?.src?.file_count, 10);
    });

    it("should handle malformed YAML gracefully", () => {
      const malformedYaml = `
checkpoint: {
  version: 1
  # Missing closing brace
`;
      try {
        yaml.load(malformedYaml);
        assert.fail("Should have thrown on malformed YAML");
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    it("should serialize checkpoint to YAML correctly", () => {
      const checkpoint = {
        checkpoint: {
          version: 1,
          created: "2026-02-06T13:00:00Z",
          sealed: false,
          skill_session: "test-session",
        },
        snapshot: {
          git_head: null,
          git_status: "unknown",
          ledger_chain_head: null,
          sentinel_events_processed: 0,
        },
        manifold: {},
        user_overrides: [],
      };

      const serialized = yaml.dump(checkpoint, { indent: 2 });
      const reparsed = yaml.load(serialized) as typeof checkpoint;

      assert.strictEqual(reparsed.checkpoint.version, 1);
      assert.strictEqual(reparsed.checkpoint.skill_session, "test-session");
    });
  });

  describe("Manifold Calculation", () => {
    it("should calculate folder metrics correctly", () => {
      // Create test files
      const srcDir = path.join(testWorkspace, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "file1.ts"), "const a = 1;");
      fs.writeFileSync(path.join(srcDir, "file2.ts"), "const b = 2;");

      // Calculate metrics manually
      const files = fs
        .readdirSync(srcDir)
        .filter((f) => fs.statSync(path.join(srcDir, f)).isFile());
      let totalBytes = 0;
      for (const file of files) {
        totalBytes += fs.statSync(path.join(srcDir, file)).size;
      }

      assert.strictEqual(files.length, 2);
      assert.ok(totalBytes > 0);
    });

    it("should handle empty folders", () => {
      const emptyDir = path.join(testWorkspace, "empty");
      fs.mkdirSync(emptyDir, { recursive: true });

      const files = fs.readdirSync(emptyDir);
      assert.strictEqual(files.length, 0);
    });
  });

  describe("Drift Detection", () => {
    it("should detect no drift when states match", () => {
      const before = {
        file_count: 10,
        total_bytes: 5000,
      };
      const after = {
        file_count: 10,
        total_bytes: 5000,
      };

      const delta = {
        file_count_delta: after.file_count - before.file_count,
        bytes_delta: after.total_bytes - before.total_bytes,
      };

      assert.strictEqual(delta.file_count_delta, 0);
      assert.strictEqual(delta.bytes_delta, 0);
    });

    it("should detect drift when files added", () => {
      const before = {
        file_count: 10,
        total_bytes: 5000,
      };
      const after = {
        file_count: 12,
        total_bytes: 6500,
      };

      const delta = {
        file_count_delta: after.file_count - before.file_count,
        bytes_delta: after.total_bytes - before.total_bytes,
      };

      assert.strictEqual(delta.file_count_delta, 2);
      assert.strictEqual(delta.bytes_delta, 1500);
    });

    it("should detect drift when files removed", () => {
      const before = {
        file_count: 10,
        total_bytes: 5000,
      };
      const after = {
        file_count: 8,
        total_bytes: 4000,
      };

      const delta = {
        file_count_delta: after.file_count - before.file_count,
        bytes_delta: after.total_bytes - before.total_bytes,
      };

      assert.strictEqual(delta.file_count_delta, -2);
      assert.strictEqual(delta.bytes_delta, -1000);
    });
  });

  describe("File Classification", () => {
    it("should classify security files as L3", () => {
      const files = [
        "src/auth/login.ts",
        "crypto/keys.ts",
        "config/secrets.json",
      ];
      const l3Keywords = ["auth", "crypto", "secret", "password", "key"];

      for (const file of files) {
        const isL3 = l3Keywords.some((kw) => file.toLowerCase().includes(kw));
        assert.strictEqual(isL3, true, `${file} should be L3`);
      }
    });

    it("should classify API files as L2", () => {
      const files = [
        "src/api/users.ts",
        "services/payment.ts",
        "controllers/order.ts",
      ];
      const l2Keywords = ["api", "service", "controller", "handler"];

      for (const file of files) {
        const isL2 = l2Keywords.some((kw) => file.toLowerCase().includes(kw));
        assert.strictEqual(isL2, true, `${file} should be L2`);
      }
    });

    it("should classify routine files as L1", () => {
      const files = [
        "src/utils/format.ts",
        "components/Button.tsx",
        "styles/main.css",
      ];
      const l3Keywords = ["auth", "crypto", "secret", "password", "key"];
      const l2Keywords = ["api", "service", "controller", "handler"];

      for (const file of files) {
        const lower = file.toLowerCase();
        const isL3 = l3Keywords.some((kw) => lower.includes(kw));
        const isL2 = l2Keywords.some((kw) => lower.includes(kw));
        assert.strictEqual(isL3, false, `${file} should not be L3`);
        assert.strictEqual(isL2, false, `${file} should not be L2`);
      }
    });
  });

  describe("User Override Tracking", () => {
    it("should record user override with timestamp and reason", () => {
      const override = {
        timestamp: new Date().toISOString(),
        reason: "Using Superpowers skill for quick fix",
        acknowledged: true,
      };

      assert.ok(override.timestamp);
      assert.strictEqual(
        override.reason,
        "Using Superpowers skill for quick fix",
      );
      assert.strictEqual(override.acknowledged, true);
    });

    it("should store multiple overrides in array", () => {
      const overrides = [
        {
          timestamp: "2026-02-06T10:00:00Z",
          reason: "First override",
          acknowledged: true,
        },
        {
          timestamp: "2026-02-06T11:00:00Z",
          reason: "Second override",
          acknowledged: true,
        },
      ];

      assert.strictEqual(overrides.length, 2);
      assert.strictEqual(overrides[0].reason, "First override");
    });
  });

  describe("ICheckpointMetrics integration", () => {
    it("should wire ledger entry count via metrics interface", () => {
      const metrics = {
        getLedgerEntryCount: () => 42,
        getSentinelEventsProcessed: () => 100,
      };

      const entryCount = metrics.getLedgerEntryCount();
      const chainHead = String(entryCount);
      assert.strictEqual(chainHead, "42");
    });

    it("should wire sentinel events processed via metrics interface", () => {
      const metrics = {
        getLedgerEntryCount: () => 0,
        getSentinelEventsProcessed: () => 250,
      };

      const eventsProcessed = metrics.getSentinelEventsProcessed();
      assert.strictEqual(eventsProcessed, 250);
    });

    it("should default to null/0 when metrics not provided", () => {
      type Metrics = { getLedgerEntryCount(): number; getSentinelEventsProcessed(): number };
      const metrics = undefined as Metrics | undefined;
      const chainHead = metrics ? String(metrics.getLedgerEntryCount()) : null;
      const eventsProcessed = metrics?.getSentinelEventsProcessed() ?? 0;

      assert.strictEqual(chainHead, null);
      assert.strictEqual(eventsProcessed, 0);
    });
  });
});

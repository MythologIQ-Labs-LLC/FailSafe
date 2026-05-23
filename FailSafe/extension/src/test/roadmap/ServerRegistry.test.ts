import { describe, it, beforeEach, afterEach } from "mocha";
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  registerServer,
  unregisterServer,
  markDisconnected,
  readRegistry,
} from "../../roadmap/services/ServerRegistry";

describe("ServerRegistry", () => {
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  let tmpHome: string;
  let registryPath: string;

  beforeEach(() => {
    // Create a temporary home directory for isolated testing
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-registry-"));
    registryPath = path.join(tmpHome, ".failsafe", "servers.json");

    // Save and override HOME for tests
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;
  });

  afterEach(function () {
    this.timeout(10000);
    // Restore HOME
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    // Restore USERPROFILE
    if (originalUserProfile !== undefined) {
      process.env.USERPROFILE = originalUserProfile;
    } else {
      delete process.env.USERPROFILE;
    }

    // Clean up tmp directory
    try {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    } catch {
      // Windows may hold brief locks
    }
  });

  describe("registerServer", () => {
    it("creates registry file if it does not exist", () => {
      registerServer({
        port: 9376,
        workspaceName: "TestProject",
        workspacePath: "/test/path",
        pid: process.pid,
        startedAt: new Date().toISOString(),
      });

      const registry = readRegistry();
      assert.strictEqual(registry.length, 1);
      assert.strictEqual(registry[0].port, 9376);
      assert.strictEqual(registry[0].workspaceName, "TestProject");
      assert.strictEqual(registry[0].status, "active");
    });

    it("replaces existing entry for same port", () => {
      registerServer({
        port: 9376,
        workspaceName: "Project1",
        workspacePath: "/test/path1",
        pid: process.pid,
        startedAt: new Date().toISOString(),
      });

      registerServer({
        port: 9376,
        workspaceName: "Project2",
        workspacePath: "/test/path2",
        pid: process.pid,
        startedAt: new Date().toISOString(),
      });

      const registry = readRegistry();
      assert.strictEqual(registry.length, 1);
      assert.strictEqual(registry[0].workspaceName, "Project2");
    });

    it("replaces existing entry for same workspace path", () => {
      registerServer({
        port: 9376,
        workspaceName: "Project",
        workspacePath: "/test/same/path",
        pid: process.pid,
        startedAt: new Date().toISOString(),
      });

      registerServer({
        port: 9377,
        workspaceName: "Project",
        workspacePath: "/test/same/path",
        pid: process.pid,
        startedAt: new Date().toISOString(),
      });

      const registry = readRegistry();
      assert.strictEqual(registry.length, 1);
      assert.strictEqual(registry[0].port, 9377);
    });

    it("does not depend on a shared servers.json.tmp path during writes", () => {
      const sharedTmp = registryPath + ".tmp";
      fs.mkdirSync(path.dirname(sharedTmp), { recursive: true });
      fs.writeFileSync(sharedTmp, "stale", "utf-8");

      registerServer({
        port: 9378,
        workspaceName: "Project3",
        workspacePath: "/test/path3",
        pid: process.pid,
        startedAt: new Date().toISOString(),
      });

      const registry = readRegistry();
      assert.strictEqual(registry.length, 1);
      assert.strictEqual(registry[0].port, 9378);
      assert.strictEqual(
        fs.readFileSync(sharedTmp, "utf-8"),
        "stale",
        "shared tmp file should be ignored, not used as the write target",
      );
    });
  });

  describe("unregisterServer", () => {
    it("removes server by port", () => {
      registerServer({
        port: 9376,
        workspaceName: "Project1",
        workspacePath: "/test/path1",
        pid: process.pid,
        startedAt: new Date().toISOString(),
      });

      registerServer({
        port: 9377,
        workspaceName: "Project2",
        workspacePath: "/test/path2",
        pid: process.pid,
        startedAt: new Date().toISOString(),
      });

      unregisterServer(9376);

      const registry = readRegistry();
      assert.strictEqual(registry.length, 1);
      assert.strictEqual(registry[0].port, 9377);
    });
  });

  describe("markDisconnected", () => {
    it("updates status to disconnected", () => {
      registerServer({
        port: 9376,
        workspaceName: "Project",
        workspacePath: "/test/path",
        pid: process.pid,
        startedAt: new Date().toISOString(),
      });

      markDisconnected(9376);

      const registry = readRegistry();
      assert.strictEqual(registry.length, 1);
      assert.strictEqual(registry[0].status, "disconnected");
    });

    it("does nothing if port not found", () => {
      registerServer({
        port: 9376,
        workspaceName: "Project",
        workspacePath: "/test/path",
        pid: process.pid,
        startedAt: new Date().toISOString(),
      });

      markDisconnected(9999); // Non-existent port

      const registry = readRegistry();
      assert.strictEqual(registry.length, 1);
      assert.strictEqual(registry[0].status, "active");
    });
  });

  describe("readRegistry", () => {
    it("returns empty array if registry does not exist", () => {
      const registry = readRegistry();
      assert.deepStrictEqual(registry, []);
    });

    it("returns all entries with stale PIDs filtered", () => {
      // Manually write a stale entry with an invalid PID
      fs.mkdirSync(path.join(tmpHome, ".failsafe"), { recursive: true });
      fs.writeFileSync(
        registryPath,
        JSON.stringify({
          servers: [
            {
              port: 9376,
              workspaceName: "Active",
              workspacePath: "/active",
              pid: process.pid, // Current process - valid
              startedAt: new Date().toISOString(),
              status: "active",
            },
            {
              port: 9377,
              workspaceName: "Stale",
              workspacePath: "/stale",
              pid: 99999999, // Invalid PID
              startedAt: new Date().toISOString(),
              status: "active",
            },
          ],
        }),
        "utf-8"
      );

      const registry = readRegistry();
      // Stale entry should be filtered out
      assert.strictEqual(registry.length, 1);
      assert.strictEqual(registry[0].workspaceName, "Active");
    });
  });
});

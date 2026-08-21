// Regression coverage for the crash-stale install/scan state defect
// (FailSafe#240 follow-up, named by relay cycle #132/#134):
//
// MarketplaceCatalog.persistState() durably wrote item.status to
// ~/.failsafe/marketplace/state.json, including the transient "installing"
// and "scanning" values. loadState() rehydrated whatever it found with no
// check for whether the extension-host session that set it is still alive.
// Since "installing"/"scanning" are only ever set by this session's own
// live install lifecycle, either value observed at construction time was
// always written by a *previous*, now-dead session -- and nothing in the
// new session will ever resolve it. marketplaceInstallRoutes.ts's
// `status === "installing" || status === "scanning"` 409 guard then
// permanently deadlocked every future install attempt for that item with
// no truthful recovery path.

import { describe, it, afterEach } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { MarketplaceCatalog } from "../../roadmap/services/MarketplaceCatalog";

const ITEM_ID = "autoresearch-karpathy";

function withTempHome<T>(action: (home: string) => T): T {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mpc-"));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    return action(home);
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function statePathFor(home: string): string {
  return path.join(home, ".failsafe", "marketplace", "state.json");
}

function seedState(home: string, items: Record<string, unknown>): void {
  const statePath = statePathFor(home);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(
    statePath,
    JSON.stringify({
      items,
      scannerAvailability: { garak: false, promptfoo: false, lastChecked: "" },
      pendingHITLApprovals: [],
      lastSyncedAt: new Date().toISOString(),
    }),
    "utf-8",
  );
}

describe("MarketplaceCatalog crash-stale install/scan recovery (FailSafe#240)", function () {
  this.timeout(10000);

  afterEach(() => {
    delete process.env.HOME;
    delete process.env.USERPROFILE;
  });

  it("reconciles a prior-session 'installing' state to 'failed' on load, not permanently stuck", () => {
    withTempHome((home) => {
      seedState(home, { [ITEM_ID]: { status: "installing" } });

      const catalog = new MarketplaceCatalog();
      const item = catalog.getItem(ITEM_ID)!;

      assert.notEqual(item.status, "installing");
      assert.notEqual(item.status, "scanning");
      assert.equal(item.status, "failed");
    });
  });

  it("reconciles a prior-session 'scanning' state to 'failed' on load", () => {
    withTempHome((home) => {
      seedState(home, { [ITEM_ID]: { status: "scanning" } });

      const catalog = new MarketplaceCatalog();
      const item = catalog.getItem(ITEM_ID)!;

      assert.equal(item.status, "failed");
    });
  });

  it("does not fabricate 'installed' or run a security scan when recovering stale state", () => {
    withTempHome((home) => {
      seedState(home, { [ITEM_ID]: { status: "installing" } });

      const catalog = new MarketplaceCatalog();
      const item = catalog.getItem(ITEM_ID)!;

      assert.notEqual(item.status, "installed");
      assert.notEqual(item.status, "quarantined");
      assert.equal(item.securityScan, undefined);
    });
  });

  it("persists the reconciliation so a second restart also reads a retryable state", () => {
    withTempHome((home) => {
      seedState(home, { [ITEM_ID]: { status: "installing" } });

      // First restart: reconciles in-memory and writes the correction back.
      new MarketplaceCatalog();

      const onDisk = JSON.parse(fs.readFileSync(statePathFor(home), "utf-8"));
      assert.equal(onDisk.items[ITEM_ID].status, "failed");

      // Second restart reads the already-corrected state, not the stale value.
      const again = new MarketplaceCatalog();
      assert.equal(again.getItem(ITEM_ID)!.status, "failed");
    });
  });

  it("does not touch items that were not left mid-transition", () => {
    withTempHome((home) => {
      seedState(home, {
        [ITEM_ID]: { status: "installing" },
        "autogen-microsoft": { status: "installed", installedAt: "2026-01-01T00:00:00.000Z" },
      });

      const catalog = new MarketplaceCatalog();

      assert.equal(catalog.getItem(ITEM_ID)!.status, "failed");
      assert.equal(catalog.getItem("autogen-microsoft")!.status, "installed");
    });
  });

  it("does not reclassify a status set during the live session (only loadState() reconciles)", () => {
    withTempHome(() => {
      const catalog = new MarketplaceCatalog();

      // Simulates the install route setting status for a genuinely
      // in-progress operation started by *this* session.
      catalog.updateItemStatus(ITEM_ID, { status: "installing" });

      assert.equal(catalog.getItem(ITEM_ID)!.status, "installing");
    });
  });

  it("falls back to defaults (not fabricated success) on a malformed state file", () => {
    withTempHome((home) => {
      const statePath = statePathFor(home);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, "{ not valid json", "utf-8");

      const catalog = new MarketplaceCatalog();
      const item = catalog.getItem(ITEM_ID)!;

      assert.equal(item.status, "not-installed");
    });
  });

  it("persistState() writes atomically: no leftover temp file, valid JSON on disk", () => {
    withTempHome((home) => {
      const catalog = new MarketplaceCatalog();
      catalog.updateItemStatus(ITEM_ID, { status: "installed", installedAt: new Date().toISOString() });

      const dir = path.join(home, ".failsafe", "marketplace");
      const entries = fs.readdirSync(dir);
      assert.deepEqual(entries.filter((f) => f.endsWith(".tmp")), []);

      const onDisk = JSON.parse(fs.readFileSync(statePathFor(home), "utf-8"));
      assert.equal(onDisk.items[ITEM_ID].status, "installed");
    });
  });
});

// Wayfinder integration (plan-wayfinder-integration, META_LEDGER #514-#515):
// the mattpocock/skills engineering pack ships as a catalog entry under the
// NEW "agent-skills" category.
describe("MarketplaceCatalog — agent-skills category (mattpocock-skills)", () => {
  it("catalog returns the mattpocock-skills entry with agent-skills category, MIT license, sandbox on", () => {
    withTempHome(() => {
      const catalog = new MarketplaceCatalog();
      const item = catalog.getCatalog().find((i) => i.id === "mattpocock-skills");
      assert.ok(item, "mattpocock-skills entry must exist in the curated catalog");
      assert.equal(item!.category, "agent-skills");
      assert.equal(item!.licenseType, "MIT");
      assert.equal(item!.sandboxEnabled, true);
      assert.equal(item!.repoUrl, "https://github.com/mattpocock/skills");
      assert.equal(
        catalog.getByCategory("agent-skills").some((i) => i.id === "mattpocock-skills"),
        true,
        "getByCategory must surface the entry under agent-skills",
      );
    });
  });

  it("every category used by any catalog entry carries a label in CATEGORY_LABELS (inverse coverage)", () => {
    withTempHome(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { CATEGORY_LABELS } = require("../../roadmap/services/MarketplaceTypes");
      const catalog = new MarketplaceCatalog();
      const used = new Set(catalog.getCatalog().map((i) => i.category));
      for (const cat of used) {
        assert.equal(
          typeof CATEGORY_LABELS[cat], "string",
          `category "${cat}" must have a CATEGORY_LABELS entry (unlabeled categories render as ghost filters)`,
        );
      }
      assert.ok(used.has("agent-skills"), "agent-skills must be an in-use category");
    });
  });
});

// ── #378: corrupt state.json is preserved before persistState overwrites ──────
suite('#378 MarketplaceCatalog corrupt-state preservation', () => {
  test('persistState over a corrupt state.json preserves the original bytes aside', () => {
    withTempHome((home) => {
      const statePath = statePathFor(home);
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      const corrupt = '{"items": {"voice-pack": {"status": TRUNC';
      fs.writeFileSync(statePath, corrupt, 'utf-8');
      const catalog = new MarketplaceCatalog();
      catalog.persistState();
      const dir = path.dirname(statePath);
      const baks = fs.readdirSync(dir).filter((f) => /^state\.json\.corrupt-\d+\.bak$/.test(f));
      assert.equal(baks.length, 1, 'the corrupt original must be preserved, not destroyed');
      assert.equal(fs.readFileSync(path.join(dir, baks[0]), 'utf-8'), corrupt);
      assert.ok(fs.existsSync(statePath), 'the persist itself still writes fresh state');
    });
  });

  test('persistState over healthy state: no .bak', () => {
    withTempHome((home) => {
      seedState(home, {});
      const catalog = new MarketplaceCatalog();
      catalog.persistState();
      const dir = path.dirname(statePathFor(home));
      const baks = fs.readdirSync(dir).filter((f) => f.includes('.corrupt-'));
      assert.equal(baks.length, 0);
    });
  });
});

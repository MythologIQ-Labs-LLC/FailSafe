// Functional tests for MarketplaceTypes constants (FX385) + MarketplaceCatalog (FX383).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CATEGORY_LABELS, DIFFICULTY_LABELS } from '../../roadmap/services/MarketplaceTypes';
import { MarketplaceCatalog } from '../../roadmap/services/MarketplaceCatalog';

function withTempHome(action: (home: string) => void): void {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mph-'));
  const prevHome = process.env.HOME;
  const prevUser = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try { action(home); }
  finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevUser === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUser;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

suite('MarketplaceTypes (FX385)', () => {
  test('FX385 CATEGORY_LABELS — covers all 3 marketplace categories', () => {
    assert.equal(CATEGORY_LABELS['autonomous-multi-agent'], 'Autonomous & Multi-Agent');
    assert.equal(CATEGORY_LABELS['safety-red-teaming'], 'Safety & Red Teaming');
    assert.equal(CATEGORY_LABELS['ui-orchestration'], 'UI & Orchestration');
  });

  test('FX385 DIFFICULTY_LABELS — covers beginner/intermediate/advanced', () => {
    assert.equal(DIFFICULTY_LABELS.beginner, 'Beginner');
    assert.equal(DIFFICULTY_LABELS.intermediate, 'Intermediate');
    assert.equal(DIFFICULTY_LABELS.advanced, 'Advanced');
  });
});

suite('MarketplaceCatalog (FX383 + FX378 + FX381)', () => {
  test('FX378 getCatalog — returns curated marketplace items (>= 11 entries)', () => {
    withTempHome(() => {
      const c = new MarketplaceCatalog();
      const all = c.getCatalog();
      assert.ok(all.length >= 11, `expected >= 11 items, got ${all.length}`);
      assert.ok(all.every(i => i.id && i.name && i.repoUrl && i.category));
    });
  });

  test('FX383 getItem — known id returns item; unknown returns undefined', () => {
    withTempHome(() => {
      const c = new MarketplaceCatalog();
      const all = c.getCatalog();
      const first = c.getItem(all[0].id);
      assert.equal(first?.id, all[0].id);
      assert.equal(c.getItem('does-not-exist'), undefined);
    });
  });

  test('FX383 getByCategory — returns only items matching category', () => {
    withTempHome(() => {
      const c = new MarketplaceCatalog();
      const autonomous = c.getByCategory('autonomous-multi-agent');
      assert.ok(autonomous.length > 0);
      assert.ok(autonomous.every(i => i.category === 'autonomous-multi-agent'));
    });
  });

  test('FX383 getFeatured — returns only featured items', () => {
    withTempHome(() => {
      const c = new MarketplaceCatalog();
      const featured = c.getFeatured();
      assert.ok(featured.length > 0);
      assert.ok(featured.every(i => i.featured === true));
    });
  });

  test('FX381 trustTier — every item starts as "unverified" by default', () => {
    withTempHome(() => {
      const c = new MarketplaceCatalog();
      assert.ok(c.getCatalog().every(i => i.trustTier === 'unverified'));
    });
  });

  test('FX383 getInstalled / getQuarantined — empty initially', () => {
    withTempHome(() => {
      const c = new MarketplaceCatalog();
      assert.deepEqual(c.getInstalled(), []);
      assert.deepEqual(c.getQuarantined(), []);
    });
  });

  test('FX383 updateItemStatus — mutates item + persists state to disk', () => {
    withTempHome((home) => {
      const c = new MarketplaceCatalog();
      const all = c.getCatalog();
      const id = all[0].id;
      c.updateItemStatus(id, { status: 'installed', installedAt: '2026-05-07T00:00:00Z' });
      assert.equal(c.getItem(id)?.status, 'installed');
      const statePath = path.join(home, '.failsafe', 'marketplace', 'state.json');
      assert.ok(fs.existsSync(statePath));
      const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      assert.equal(data.items[id].status, 'installed');
    });
  });

  test('FX383 updateItemStatus — getInstalled reflects updated status', () => {
    withTempHome(() => {
      const c = new MarketplaceCatalog();
      const id = c.getCatalog()[0].id;
      c.updateItemStatus(id, { status: 'installed' });
      assert.equal(c.getInstalled().length, 1);
      assert.equal(c.getInstalled()[0].id, id);
    });
  });

  test('FX383 setScannerAvailability + getScannerAvailability — round-trip', () => {
    withTempHome(() => {
      const c = new MarketplaceCatalog();
      c.setScannerAvailability({ garak: true, promptfoo: false, lastChecked: '2026-05-07T00:00:00Z' });
      const a = c.getScannerAvailability();
      assert.equal(a.garak, true);
      assert.equal(a.promptfoo, false);
      assert.equal(a.lastChecked, '2026-05-07T00:00:00Z');
    });
  });

  test('FX383 MarketplaceCatalog re-instantiation loads persisted state', () => {
    withTempHome(() => {
      const c1 = new MarketplaceCatalog();
      const id = c1.getCatalog()[0].id;
      c1.updateItemStatus(id, { status: 'installed' });
      const c2 = new MarketplaceCatalog();
      assert.equal(c2.getItem(id)?.status, 'installed');
    });
  });

  test('FX383 getCachePath / getItemInstallPath — under ~/.failsafe/marketplace', () => {
    withTempHome((home) => {
      const c = new MarketplaceCatalog();
      assert.equal(c.getCachePath(), path.join(home, '.failsafe', 'marketplace'));
      assert.equal(
        c.getItemInstallPath('foo-id'),
        path.join(home, '.failsafe', 'marketplace', 'foo-id'),
      );
    });
  });

  test('FX383 corrupt state.json — gracefully falls back to defaults', () => {
    withTempHome((home) => {
      const dir = path.join(home, '.failsafe', 'marketplace');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'state.json'), '{not-json');
      const c = new MarketplaceCatalog();
      // No crash, catalog still loads
      assert.ok(c.getCatalog().length > 0);
    });
  });
});

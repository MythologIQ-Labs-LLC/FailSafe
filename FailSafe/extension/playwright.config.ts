import { defineConfig } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// #591: the UI suites start real Console servers in the test process, and services
// such as MarketplaceCatalog resolve ~/.failsafe from os.homedir() when they are
// constructed. Without this, a run wrote ~/.failsafe/marketplace/state.json into
// the developer's real profile. The first process to load this config creates a
// disposable home and exports it; workers inherit the same directory.
// Playwright finds its browsers under the home directory on Linux and macOS
// (~/.cache/ms-playwright, ~/Library/Caches/ms-playwright), so pin the default
// cache from the ORIGINAL home before redirecting it. An explicit setting wins.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && !process.env.FAILSAFE_PLAYWRIGHT_HOME) {
  const realHome = os.homedir();
  process.env.PLAYWRIGHT_BROWSERS_PATH =
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || path.join(realHome, 'AppData', 'Local'), 'ms-playwright')
      : process.platform === 'darwin'
        ? path.join(realHome, 'Library', 'Caches', 'ms-playwright')
        : path.join(process.env.XDG_CACHE_HOME || path.join(realHome, '.cache'), 'ms-playwright');
}
if (!process.env.FAILSAFE_PLAYWRIGHT_HOME) {
  process.env.FAILSAFE_PLAYWRIGHT_HOME = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-playwright-home-')),
  );
}
process.env.HOME = process.env.FAILSAFE_PLAYWRIGHT_HOME;
process.env.USERPROFILE = process.env.FAILSAFE_PLAYWRIGHT_HOME;
if (path.resolve(os.homedir()).toLowerCase() !== path.resolve(process.env.FAILSAFE_PLAYWRIGHT_HOME).toLowerCase()) {
  throw new Error('playwright.config: disposable home not in effect; refusing to run UI suites against the real profile');
}

export default defineConfig({
  testDir: 'src/test/ui',
  // B199 Phase 2: restrict Playwright discovery to .spec.ts files. The
  // src/test/ui/ tree also contains mocha .test.ts (e.g. helpers/) which
  // use mocha's suite/test/teardown — they must not be picked up by
  // Playwright (which would fail with `suite is not defined`).
  testMatch: '**/*.spec.ts',
  timeout: 45000,
  expect: { timeout: 5000 },
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  }
});

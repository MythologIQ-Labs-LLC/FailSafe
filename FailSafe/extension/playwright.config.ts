import { defineConfig } from '@playwright/test';

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

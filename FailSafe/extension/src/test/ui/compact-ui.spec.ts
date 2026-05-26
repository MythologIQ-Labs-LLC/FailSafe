import fs from 'fs';
import http from 'http';
import path from 'path';
import { test, expect } from '@playwright/test';

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

test('compact webpanel renders without in-panel hub button', async ({ page }) => {
  const root = path.resolve(__dirname, '../../roadmap/ui');
  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const filePath = path.join(root, relative);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', contentType(filePath));
    res.end(fs.readFileSync(filePath));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to bind test server');
  }
  const base = `http://127.0.0.1:${address.port}`;

  try {
    await page.goto(`${base}/index.html?theme=dark`);
    await expect(page.locator('.brand-title', { hasText: 'FailSafe Monitor' })).toBeVisible();
    await expect(page.locator('.brand-title')).toHaveAttribute('data-tooltip', 'Real-time governance monitoring and system health');
    await expect(page.locator('.brand-subtitle')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open FailSafe Console' })).toHaveCount(0);
    await expect(page.locator('#status-line')).toBeVisible();
    await expect(page.locator('#recent-line')).toBeVisible();
    await expect(page.locator('#sentinel-label')).toBeVisible();
    await expect(page.locator('#queue-value')).toBeVisible();
    await expect(page.getByText('FailSafe is an open source project by MythologIQ Labs, LLC')).toBeVisible();
  } finally {
    if (typeof (server as { closeAllConnections?: () => void }).closeAllConnections === 'function') {
      (server as { closeAllConnections: () => void }).closeAllConnections();
    }
    if (typeof (server as { closeIdleConnections?: () => void }).closeIdleConnections === 'function') {
      (server as { closeIdleConnections: () => void }).closeIdleConnections();
    }
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
